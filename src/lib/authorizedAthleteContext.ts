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
    .select('id,owner_user_id,family_id,is_primary,status,created_at')
    .eq('status', 'active')
  if (requested) profilesQuery = profilesQuery.eq('id', requested)

  const { data: candidateRows, error } = requested
    ? await profilesQuery.limit(1)
    : await profilesQuery.eq('owner_user_id', userId).order('is_primary', { ascending: false }).order('created_at').limit(1)
  if (error) return null
  let profile: {
    id: string
    owner_user_id: string
    family_id: string | null
    is_primary: boolean
  } | null = candidateRows?.[0] || null

  if (!profile && !requested) {
    const { data: familyRows } = await supabaseAdmin.from('family_members')
      .select('family_id').eq('user_id', userId).eq('status', 'active')
    const familyIds = (familyRows || []).map(row => row.family_id).filter(Boolean)
    if (familyIds.length) {
      const { data } = await supabaseAdmin.from('athlete_profiles')
        .select('id,owner_user_id,family_id,is_primary,status,created_at')
        .in('family_id', familyIds).eq('status', 'active')
        .order('is_primary', { ascending: false }).order('created_at').limit(1)
      profile = data?.[0] || null
    }
  }
  if (!profile) return null

  let authorized = profile.owner_user_id === userId
  if (!authorized && profile.family_id) {
    const { data: familyMembership } = await supabaseAdmin.from('family_members')
      .select('family_id').eq('family_id', profile.family_id).eq('user_id', userId).eq('status', 'active').maybeSingle()
    authorized = Boolean(familyMembership)
  }
  if (!authorized) return null

  return {
    profileId: profile.id,
    ownerUserId: profile.owner_user_id,
    legacySubProfileId: profile.is_primary ? null : profile.id,
    isPrimary: Boolean(profile.is_primary),
  }
}
