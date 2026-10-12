import { NextResponse } from 'next/server'
import { getSessionRole, jsonError, commonRoles } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveActiveOrganizationStaffContext } from '@/lib/organizationStaffContext'
export const dynamic = 'force-dynamic'


const ensureBucket = async () => {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets()
  if (error) throw new Error(error.message)
  const exists = (buckets || []).some((bucket) => bucket.name === 'branding')
  if (!exists) {
    const { error: createError } = await supabaseAdmin.storage.createBucket('branding', {
      public: true,
    })
    if (createError) throw new Error(createError.message)
  }
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const MAX_SIZE_BYTES = 10 * 1024 * 1024

const brandingPathFromPublicUrl = (value?: string | null) => {
  if (!value) return null
  try {
    const marker = '/storage/v1/object/public/branding/'
    const pathname = new URL(value).pathname
    const markerIndex = pathname.indexOf(marker)
    return markerIndex >= 0 ? decodeURIComponent(pathname.slice(markerIndex + marker.length)) : null
  } catch {
    return null
  }
}

const removeBrandingAsset = async (path?: string | null) => {
  if (!path) return
  await supabaseAdmin.storage.from('branding').remove([path])
}

export async function POST(request: Request) {
  const { session, error, supabase } = await getSessionRole(commonRoles)
  if (error || !session) return error

  const form = await request.formData()
  const file = form.get('file')
  const scope = String(form.get('scope') || '')
  const slot = String(form.get('slot') || '')

  if (!(file instanceof File)) {
    return jsonError('file is required')
  }
  if (!['coach', 'org'].includes(scope)) {
    return jsonError('scope must be coach or org')
  }
  if (!['logo', 'cover'].includes(slot)) {
    return jsonError('slot must be logo or cover')
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return jsonError('Only JPEG, PNG, WebP, HEIC, and HEIF images are allowed.', 400)
  }
  if (file.size > MAX_SIZE_BYTES) {
    return jsonError('Image must be 10 MB or smaller.', 400)
  }

  try {
    await ensureBucket()
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not setup bucket', 500)
  }

  const updateField = slot === 'logo' ? 'brand_logo_url' : 'brand_cover_url'
  const organizationContext = scope === 'org'
    ? await resolveActiveOrganizationStaffContext(
        supabase,
        session.user.user_metadata?.current_org_id || null,
        session.user.user_metadata?.active_workspace_id || null,
      )
    : null

  if (scope === 'org' && !organizationContext) {
    return jsonError('Organization not found', 404)
  }

  const ownerId = organizationContext?.organizationId || session.user.id
  const previousRecord = scope === 'coach'
    ? await supabaseAdmin.from('profiles').select(updateField).eq('id', session.user.id).maybeSingle()
    : await supabaseAdmin.from('org_settings').select(updateField).eq('org_id', ownerId).maybeSingle()
  if (scope === 'coach' && (previousRecord.error || !previousRecord.data)) {
    return jsonError(previousRecord.error?.message || 'Coach profile not found', previousRecord.error ? 500 : 404)
  }
  const previousUrl = (previousRecord.data as Record<string, string | null> | null)?.[updateField] || null
  const previousPath = brandingPathFromPublicUrl(previousUrl)
  const fileExt = file.name.split('.').pop() || 'png'
  const key = `${scope}/${ownerId}/${slot}-${crypto.randomUUID()}.${fileExt}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('branding')
    .upload(key, file, {
      contentType: file.type || 'image/png',
      upsert: true,
    })

  if (uploadError) {
    return jsonError(uploadError.message, 500)
  }

  const { data } = supabaseAdmin.storage.from('branding').getPublicUrl(key)
  const publicUrl = data.publicUrl

  if (scope === 'coach') {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ [updateField]: publicUrl })
      .eq('id', session.user.id)
    if (error) {
      await removeBrandingAsset(key)
      return jsonError(error.message, 500)
    }
  } else {
    const { error } = await supabaseAdmin
      .from('org_settings')
      .upsert({
        org_id: ownerId,
        [updateField]: publicUrl,
      }, { onConflict: 'org_id' })
    if (error) {
      await removeBrandingAsset(key)
      return jsonError(error.message, 500)
    }
  }

  if (previousPath && previousPath !== key) {
    await removeBrandingAsset(previousPath)
  }

  return NextResponse.json({ url: publicUrl, path: key })
}
