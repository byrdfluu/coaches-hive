import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const MAX_BYTES = 10 * 1024 * 1024

export async function GET() {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error
  const { data, error: queryError } = await supabaseAdmin
    .from('profile_gallery_images')
    .select('id,image_url,storage_path,original_filename,mime_type,size_bytes,created_at')
    .eq('owner_type', 'coach')
    .eq('coach_id', session.user.id)
    .order('created_at', { ascending: true })
  if (queryError) return jsonError('Unable to load profile gallery.', 500)
  return NextResponse.json({ images: data || [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return jsonError('file is required')
  if (!ALLOWED_TYPES.has(file.type)) return jsonError('Upload a JPEG, PNG, WebP, HEIC, or HEIF image.')
  if (file.size <= 0 || file.size > MAX_BYTES) return jsonError('Image must be no larger than 10 MB.')

  const { count } = await supabaseAdmin
    .from('profile_gallery_images')
    .select('id', { count: 'exact', head: true })
    .eq('owner_type', 'coach')
    .eq('coach_id', session.user.id)
  if ((count || 0) >= 6) return jsonError('Showcases can include up to 6 photos.', 409)

  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const storagePath = `coach/${session.user.id}/${crypto.randomUUID()}.${extension}`
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabaseAdmin.storage
    .from('profile-gallery')
    .upload(storagePath, bytes, { contentType: file.type, upsert: false })
  if (uploadError) return jsonError('Unable to upload profile image.', 500)

  const { data: publicData } = supabaseAdmin.storage.from('profile-gallery').getPublicUrl(storagePath)
  const { data: image, error: insertError } = await supabaseAdmin
    .from('profile_gallery_images')
    .insert({
      owner_type: 'coach',
      coach_id: session.user.id,
      org_id: null,
      image_url: publicData.publicUrl,
      storage_path: storagePath,
      original_filename: file.name.slice(0, 255),
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select('id,image_url,storage_path,original_filename,mime_type,size_bytes,created_at')
    .single()
  if (insertError || !image) {
    await supabaseAdmin.storage.from('profile-gallery').remove([storagePath])
    return jsonError('Unable to save profile image.', 500)
  }
  return NextResponse.json({ image }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const imageId = String(body?.image_id || '').trim()
  if (!imageId) return jsonError('image_id is required')

  const { data: image } = await supabaseAdmin
    .from('profile_gallery_images')
    .select('id,storage_path')
    .eq('id', imageId)
    .eq('owner_type', 'coach')
    .eq('coach_id', session.user.id)
    .maybeSingle()
  if (!image) return jsonError('Profile image not found.', 404)

  const { error: storageError } = await supabaseAdmin.storage.from('profile-gallery').remove([image.storage_path])
  if (storageError) return jsonError('Unable to delete profile image.', 500)
  const { error: deleteError } = await supabaseAdmin.from('profile_gallery_images').delete().eq('id', image.id)
  if (deleteError) return jsonError('Image file was removed, but its record needs cleanup.', 500)
  return NextResponse.json({ deleted: true, image_id: image.id })
}
