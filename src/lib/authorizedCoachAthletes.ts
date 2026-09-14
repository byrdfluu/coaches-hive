import { resolveActiveCoachContext } from '@/lib/activeCoachContext'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/** Exact athlete-profile IDs visible in the coach's currently selected context. */
export async function resolveAuthorizedCoachAthleteProfileIds(coachId: string): Promise<string[]> {
  const context = await resolveActiveCoachContext(coachId)
  if (context.organizationId) {
    let teamIds = context.teamId ? [context.teamId] : []
    if (!teamIds.length) {
      const { data: assignments } = await supabaseAdmin.from('org_team_coaches')
        .select('team_id,org_teams!inner(org_id)')
        .eq('coach_id', coachId)
        .eq('org_teams.org_id', context.organizationId)
      teamIds = (assignments || []).map((assignment) => assignment.team_id)
    }
    if (!teamIds.length) return []
    const { data: members } = await supabaseAdmin.from('org_team_members')
      .select('athlete_id').in('team_id', teamIds)
    return Array.from(new Set((members || []).map((member) => member.athlete_id).filter(Boolean)))
  }

  const { data: links } = await supabaseAdmin.from('coach_athlete_links')
    .select('athlete_id').eq('coach_id', coachId).eq('status', 'active')
  const linkedIds = Array.from(new Set((links || []).map((link) => link.athlete_id).filter(Boolean)))
  if (!linkedIds.length) return []
  const { data: exactProfiles } = await supabaseAdmin.from('athlete_profiles').select('id').in('id', linkedIds).eq('status', 'active')
  const exactIds = new Set((exactProfiles || []).map((profile) => profile.id))
  const legacyOwnerIds = linkedIds.filter((id) => !exactIds.has(id))
  const { data: legacyProfiles } = legacyOwnerIds.length
    ? await supabaseAdmin.from('athlete_profiles').select('id').in('owner_user_id', legacyOwnerIds).eq('is_primary', true).eq('status', 'active')
    : { data: [] }
  return Array.from(new Set([...(exactProfiles || []).map((profile) => profile.id), ...(legacyProfiles || []).map((profile) => profile.id)]))
}
