import { NextResponse } from 'next/server'
import { getSessionRole, jsonError, commonRoles } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getAthleteProfileById, getPrimaryAthleteProfile, upsertPrimaryAthleteProfile, updateAthleteProfile } from '@/lib/athleteProfiles'
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

const avatarPathFromPublicUrl = (value?: string | null) => {
  if (!value) return null
  try {
    const marker = '/storage/v1/object/public/avatars/'
    const pathname = new URL(value).pathname
    const markerIndex = pathname.indexOf(marker)
    return markerIndex >= 0 ? decodeURIComponent(pathname.slice(markerIndex + marker.length)) : null
  } catch {
    return null
  }
}

const removeAvatar = async (path?: string | null) => {
  if (!path) return
  await supabaseAdmin.storage.from('avatars').remove([path])
}

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(commonRoles)
  if (error || !session) return error

  const form = await request.formData()
  const file = form.get('file')
  const athleteProfileId =
    typeof form.get('athlete_profile_id') === 'string' ? (form.get('athlete_profile_id') as string).trim() : null
  const subProfileId =
    typeof form.get('sub_profile_id') === 'string' ? (form.get('sub_profile_id') as string).trim() : null
  const targetAthleteProfileId = athleteProfileId || subProfileId

  if (!(file instanceof File)) {
    return jsonError('file is required')
  }

  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return jsonError('Only JPEG, PNG, WebP, and GIF images are allowed.', 400)
  }
  if (file.size > MAX_SIZE_BYTES) {
    return jsonError('Image must be 5 MB or smaller.', 400)
  }

  try {
    await ensureBucket()
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not setup bucket', 500)
  }

  const userId = session.user.id
  const isAthleteUpload = role === 'athlete' || Boolean(targetAthleteProfileId)
  const requestedProfile = isAthleteUpload
    ? targetAthleteProfileId
      ? await getAthleteProfileById({
          supabase: supabaseAdmin,
          ownerUserId: userId,
          athleteProfileId: targetAthleteProfileId,
        })
      : await getPrimaryAthleteProfile({ supabase: supabaseAdmin, ownerUserId: userId })
    : null

  if (isAthleteUpload && (requestedProfile?.error || !requestedProfile?.data)) {
    return jsonError('Athlete profile not found', 404)
  }

  const targetProfile = requestedProfile?.data || null
  const { data: accountProfile } = targetProfile
    ? { data: null }
    : await supabaseAdmin.from('profiles').select('avatar_url').eq('id', userId).maybeSingle()
  if (!targetProfile && !accountProfile) {
    return jsonError('Profile not found', 404)
  }
  const previousPath = avatarPathFromPublicUrl(targetProfile?.avatar_url || accountProfile?.avatar_url)
  const fileExt = file.name.split('.').pop() || 'png'
  const filePath = targetProfile && !targetProfile.is_primary
    ? `${userId}/sub-profiles/${targetProfile.id}/${crypto.randomUUID()}.${fileExt}`
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

  if (targetProfile && !targetProfile.is_primary) {
    const { error: subProfileError } = await updateAthleteProfile({
      supabase: supabaseAdmin,
      ownerUserId: userId,
      athleteProfileId: targetProfile.id,
      updates: { avatar_url: publicUrl },
    })

    if (subProfileError) {
      await removeAvatar(filePath)
      return jsonError(subProfileError.message, 500)
    }
  } else if (targetProfile) {
    const { error: profileError } = await upsertPrimaryAthleteProfile({
      supabase: supabaseAdmin,
      ownerUserId: userId,
      updates: { avatar_url: publicUrl },
    })

    if (profileError) {
      await removeAvatar(filePath)
      return jsonError(profileError.message, 500)
    }

    await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId)

    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { avatar_url: publicUrl },
    })
  } else {
    const { data: updatedProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId)
      .select('id')
      .maybeSingle()

    if (profileError || !updatedProfile) {
      await removeAvatar(filePath)
      return jsonError(profileError?.message || 'Profile not found', profileError ? 500 : 404)
    }

    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { avatar_url: publicUrl },
    })
  }

  if (previousPath && previousPath !== filePath) {
    await removeAvatar(previousPath)
  }

  return NextResponse.json({ url: publicUrl, path: filePath })
}
