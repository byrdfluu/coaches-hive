import type { SupabaseClient } from '@supabase/supabase-js'

export const resolveAthleteProfileOwner = async (
  supabase: SupabaseClient,
  athleteProfileOrUserId: string,
) => {
  const { data: athleteProfile, error } = await supabase
    .from('athlete_profiles')
    .select('id, owner_user_id')
    .eq('id', athleteProfileOrUserId)
    .maybeSingle()

  if (!error && athleteProfile?.owner_user_id) return String(athleteProfile.owner_user_id)
  return athleteProfileOrUserId
}

export const userOwnsAthleteProfile = async (
  supabase: SupabaseClient,
  userId: string,
  athleteProfileOrUserId: string,
) => {
  if ((await resolveAthleteProfileOwner(supabase, athleteProfileOrUserId)) === userId) return true
  const { data } = await supabase.from('athlete_guardian_invitations').select('id')
    .eq('athlete_id', athleteProfileOrUserId).eq('accepted_by', userId).eq('status', 'accepted').maybeSingle()
  return Boolean(data)
}
