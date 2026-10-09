import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveActiveOrganizationForUser } from '@/lib/activeOrganization'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = new Set(['org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director', 'team_manager', 'admin'])
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const MAX_BYTES = 10 * 1024 * 1024

const context = async () => {
  const auth = await getSessionRole(['org', 'coach', 'admin'])
  if (auth.error || !auth.session) return { ...auth, organization: null }
  const organization = await resolveActiveOrganizationForUser(auth.session.user.id)
  return { ...auth, organization }
}

export async function GET() {
  const { session, error, organization } = await context()
  if (error || !session) return error
  if (!organization) return jsonError('Organization not found.', 404)
  const { data, error: queryError } = await supabaseAdmin
    .from('profile_gallery_images')
    .select('id,image_url,storage_path,original_filename,mime_type,size_bytes,created_at')
    .eq('owner_type', 'org')
    .eq('org_id', organization.organizationId)
    .order('created_at', { ascending: true })
  if (queryError) return jsonError('Unable to load organization gallery.', 500)
  return NextResponse.json({ images: data || [] })
}

export async function POST(request: Request) {
  const { session, error, organization } = await context()
  if (error || !session) return error
  if (!organization || !ADMIN_ROLES.has(organization.role)) return jsonError('Forbidden', 403)
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return jsonError('file is required')
  if (!ALLOWED_TYPES.has(file.type)) return jsonError('Upload a JPEG, PNG, WebP, HEIC, or HEIF image.')
  if (file.size <= 0 || file.size > MAX_BYTES) return jsonError('Image must be no larger than 10 MB.')

  const { count } = await supabaseAdmin.from('profile_gallery_images').select('id', { count: 'exact', head: true })
    .eq('owner_type', 'org').eq('org_id', organization.organizationId)
  if ((count || 0) >= 6) return jsonError('Showcases can include up to 6 photos.', 409)

  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const storagePath = `org/${organization.organizationId}/${crypto.randomUUID()}.${extension}`
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabaseAdmin.storage.from('profile-gallery')
    .upload(storagePath, bytes, { contentType: file.type, upsert: false })
  if (uploadError) return jsonError('Unable to upload gallery image.', 500)
  const { data: publicData } = supabaseAdmin.storage.from('profile-gallery').getPublicUrl(storagePath)
  const { data: image, error: insertError } = await supabaseAdmin.from('profile_gallery_images').insert({
    owner_type: 'org', coach_id: null, org_id: organization.organizationId,
    image_url: publicData.publicUrl, storage_path: storagePath,
    original_filename: file.name.slice(0, 255), mime_type: file.type, size_bytes: file.size,
  }).select('id,image_url,storage_path,original_filename,mime_type,size_bytes,created_at').single()
  if (insertError || !image) {
    await supabaseAdmin.storage.from('profile-gallery').remove([storagePath])
    return jsonError('Unable to save gallery image.', 500)
  }
  return NextResponse.json({ image }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { session, error, organization } = await context()
  if (error || !session) return error
  if (!organization || !ADMIN_ROLES.has(organization.role)) return jsonError('Forbidden', 403)
  const body = await request.json().catch(() => ({}))
  const imageId = String(body?.image_id || '').trim()
  if (!imageId) return jsonError('image_id is required')
  const { data: image } = await supabaseAdmin.from('profile_gallery_images').select('id,storage_path')
    .eq('id', imageId).eq('owner_type', 'org').eq('org_id', organization.organizationId).maybeSingle()
  if (!image) return jsonError('Gallery image not found.', 404)
  const { error: storageError } = await supabaseAdmin.storage.from('profile-gallery').remove([image.storage_path])
  if (storageError) return jsonError('Unable to delete gallery image.', 500)
  const { error: deleteError } = await supabaseAdmin.from('profile_gallery_images').delete().eq('id', image.id)
  if (deleteError) return jsonError('Image file was removed, but its record needs cleanup.', 500)
  return NextResponse.json({ deleted: true, image_id: image.id })
}
