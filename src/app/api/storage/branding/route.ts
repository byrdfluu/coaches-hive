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
  if (!['logo', 'cover', 'gallery'].includes(slot)) {
    return jsonError('slot must be logo, cover, or gallery')
  }

  try {
    await ensureBucket()
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not setup bucket', 500)
  }

  const fileExt = file.name.split('.').pop() || 'png'
  const key = `${scope}/${session.user.id}/${slot}-${Date.now()}.${fileExt}`

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
    const updateField = slot === 'logo' ? 'brand_logo_url' : 'brand_cover_url'
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ [updateField]: publicUrl })
      .eq('id', session.user.id)
    if (error) {
      return jsonError(error.message, 500)
    }
  } else {
    const context = await resolveActiveOrganizationStaffContext(
      supabase,
      session.user.user_metadata?.current_org_id || null,
      session.user.user_metadata?.active_workspace_id || null,
    )
    if (!context) {
      return jsonError('Organization not found', 404)
    }
    if (slot === 'logo' || slot === 'cover') {
      const updateField = slot === 'logo' ? 'brand_logo_url' : 'brand_cover_url'
      const { error } = await supabaseAdmin
        .from('org_settings')
        .upsert({
          org_id: context.organizationId,
          [updateField]: publicUrl,
        }, { onConflict: 'org_id' })
      if (error) {
        return jsonError(error.message, 500)
      }
    }
  }

  return NextResponse.json({ url: publicUrl, path: key })
}
