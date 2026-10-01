import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type CoachOperatingMode = 'single_team' | 'independent_coach' | 'both'

export const isCoachOperatingMode = (value: unknown): value is CoachOperatingMode =>
  value === 'single_team' || value === 'independent_coach' || value === 'both'

export const privateTrainingEnabled = (mode: unknown) =>
  mode === 'independent_coach' || mode === 'both'

export const teamManagementEnabled = (mode: unknown) =>
  mode === 'single_team' || mode === 'both'

export async function loadCoachOperatingMode(coachId: string) {
  const { data, error } = await supabaseAdmin.from('independent_coach_profiles')
    .select('coach_id,is_active,operating_mode')
    .eq('coach_id', coachId)
    .maybeSingle()
  if (error) return { profile: null, error }
  return {
    profile: data ? {
      coachId: data.coach_id,
      isActive: data.is_active !== false,
      mode: isCoachOperatingMode(data.operating_mode) ? data.operating_mode : 'single_team' as CoachOperatingMode,
    } : null,
    error: null,
  }
}
