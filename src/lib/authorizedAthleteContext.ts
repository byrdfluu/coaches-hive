import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type AuthorizedAthleteContext = {
  profileId: string
  ownerUserId: string
  legacySubProfileId: string | null
  isPrimary: boolean
}

/**
 * Resolves the exact athlete persona available to an authenticated account.
 * This mirrors my_accessible_athlete_profiles: ownership or an active family
 * relationship is required. Never infer access from an organization role.
 */
export async function resolveAuthorizedAthleteContext(
  userId: string,
  requestedProfileId?: string | null,
): Promise<AuthorizedAthleteContext | null> {
  const requested = String(requestedProfileId || '').trim()
  let profilesQuery = supabaseAdmin.from('athlete_profiles')
    .select('id,owner_user_id,is_primary,status,created_at')
    .eq('status', 'active')
  if (requested) profilesQuery = profilesQuery.eq('id', requested)

  const { data: candidateRows, error } = requested
    ? await profilesQuery.limit(1)
    : await profilesQuery.eq('owner_user_id', userId).order('is_primary', { ascending: false }).order('created_at').limit(1)
  if (error) return null
  let profile: {
    id: string
    owner_user_id: string
    is_primary: boolean
  } | null = candidateRows?.[0] || null

  if (!profile && !requested) {
    const { data: guardianRows } = await supabaseAdmin.from('athlete_guardian_invitations')
      .select('athlete_id').eq('accepted_by', userId).eq('status', 'accepted')
    const athleteIds = Array.from(new Set((guardianRows || []).map(row => row.athlete_id).filter(Boolean)))
    if (athleteIds.length) {
      const { data } = await supabaseAdmin.from('athlete_profiles')
        .select('id,owner_user_id,is_primary,status,created_at')
        .in('id', athleteIds).eq('status', 'active')
        .order('is_primary', { ascending: false }).order('created_at').limit(1)
      profile = data?.[0] || null
    }
  }
  if (!profile) return null

  let authorized = profile.owner_user_id === userId
  if (!authorized) {
    const { data: guardianLink } = await supabaseAdmin.from('athlete_guardian_invitations')
      .select('id').eq('athlete_id', profile.id).eq('accepted_by', userId).eq('status', 'accepted').maybeSingle()
    authorized = Boolean(guardianLink)
  }
  if (!authorized) return null

  return {
    profileId: profile.id,
    ownerUserId: profile.owner_user_id,
    legacySubProfileId: profile.is_primary ? null : profile.id,
    isPrimary: Boolean(profile.is_primary),
  }
}
