import { NextResponse } from 'next/server'
import { getSessionRole, jsonError, commonRoles } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const ensureBucket = async () => {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets()
  if (error) throw new Error(error.message)
  const exists = (buckets || []).some((bucket) => bucket.name === 'avatars')
  if (!exists) {
    const { error: createError } = await supabaseAdmin.storage.createBucket('avatars', {
      public: true,
    })
    if (createError) throw new Error(createError.message)
  }
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(commonRoles)
  if (error || !session) return error

  const form = await request.formData()
  const file = form.get('file')
  const subProfileId = typeof form.get('sub_profile_id') === 'string' ? (form.get('sub_profile_id') as string).trim() : null

  if (!(file instanceof File)) {
    return jsonError('file is required')
  }

  try {
    await ensureBucket()
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not setup bucket', 500)
  }

  const userId = session.user.id
  const fileExt = file.name.split('.').pop() || 'png'
  const filePath = subProfileId
    ? `${userId}/sub-profiles/${subProfileId}/${Date.now()}.${fileExt}`
    : `${userId}/${Date.now()}.${fileExt}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('avatars')
    .upload(filePath, file, {
      contentType: file.type || 'image/png',
      upsert: true,
    })

  if (uploadError) {
    return jsonError(uploadError.message, 500)
  }

  const { data } = supabaseAdmin.storage.from('avatars').getPublicUrl(filePath)
  const publicUrl = data.publicUrl

  if (subProfileId) {
    // Verify ownership and update the sub-profile's avatar
    const { data: existing } = await supabaseAdmin
      .from('athlete_sub_profiles')
      .select('id')
      .eq('id', subProfileId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!existing) return jsonError('Sub-profile not found', 404)

    const { error: subProfileError } = await supabaseAdmin
      .from('athlete_sub_profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', subProfileId)

    if (subProfileError) return jsonError(subProfileError.message, 500)
  } else {
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId)

    if (profileError) {
      return jsonError(profileError.message, 500)
    }

    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { avatar_url: publicUrl },
    })
  }

  return NextResponse.json({ url: publicUrl, path: filePath })
}
