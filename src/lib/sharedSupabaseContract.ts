import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type SharedSupabaseClient = SupabaseClient<Database>
export type AvailableWorkspace = Database['public']['Functions']['available_workspaces']['Returns'][number]
export type LeagueContext = Database['public']['Functions']['my_league_contexts']['Returns'][number]
export type AccessibleAthleteProfile = Database['public']['Functions']['my_accessible_athlete_profiles']['Returns'][number]
export type CoachTeamContext = Database['public']['Functions']['my_coach_team_contexts']['Returns'][number]

export const asSharedSupabaseClient = (client: SupabaseClient): SharedSupabaseClient =>
  client as SharedSupabaseClient
