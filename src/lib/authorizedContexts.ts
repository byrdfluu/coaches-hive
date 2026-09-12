import type { SupabaseClient } from '@supabase/supabase-js'
import {
  asSharedSupabaseClient,
  type AccessibleAthleteProfile,
  type AvailableWorkspace,
  type CoachTeamContext,
  type LeagueContext,
} from '@/lib/sharedSupabaseContract'

export type AuthorizedContexts = {
  workspaces: AvailableWorkspace[]
  leagues: LeagueContext[]
  athletes: AccessibleAthleteProfile[]
  coachTeams: CoachTeamContext[]
}

export async function loadAuthorizedContexts(client: SupabaseClient): Promise<AuthorizedContexts> {
  const supabase = asSharedSupabaseClient(client)
  const [workspaceResult, leagueResult, athleteResult, coachTeamResult] = await Promise.all([
    supabase.rpc('available_workspaces'),
    supabase.rpc('my_league_contexts'),
    supabase.rpc('my_accessible_athlete_profiles'),
    supabase.rpc('my_coach_team_contexts'),
  ])
  const failure = [workspaceResult, leagueResult, athleteResult, coachTeamResult].find(result => result.error)
  if (failure?.error) throw new Error(failure.error.message)
  return {
    workspaces: workspaceResult.data || [],
    leagues: leagueResult.data || [],
    athletes: athleteResult.data || [],
    coachTeams: coachTeamResult.data || [],
  }
}
