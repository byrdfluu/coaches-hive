export type PortalContextPayload = {
  active_role?: string | null
  active_workspace_id?: string | null
  selected_athlete_profile_id?: string | null
  selected_coach_team_id?: string | null
  workspaces?: Array<{
    workspace_id: string
    workspace_type: string
    display_name: string
    organization_id?: string | null
    league_id?: string | null
    roles: string[]
    is_last_used?: boolean
  }>
  athlete_profiles?: Array<{
    id: string
    full_name: string
    avatar_url?: string | null
    is_primary?: boolean
  }>
  coach_team_contexts?: Array<{
    workspace_id: string
    organization_id: string
    organization_name: string
    team_id: string
    team_name: string
  }>
}

export type PortalChoice = {
  id: string
  label: string
  detail: string
  portal: 'org' | 'coach' | 'athlete' | 'league'
  href: string
  workspaceId?: string
  actingRole: string
  athleteProfileId?: string
  coachTeamId?: string
  avatarUrl?: string | null
  active: boolean
}

const orgRoles = ['org_admin', 'team_manager', 'school_admin', 'club_admin', 'travel_admin', 'athletic_director', 'program_director', 'owner']
const leagueRoles = ['league_admin', 'division_admin', 'finance_manager', 'registrar', 'compliance_manager', 'read_only_auditor', 'owner']

export function buildPortalChoices(payload: PortalContextPayload): PortalChoice[] {
  const choices: PortalChoice[] = []
  const athletes = payload.athlete_profiles || []
  const coachTeams = payload.coach_team_contexts || []

  for (const workspace of payload.workspaces || []) {
    const roles = workspace.roles || []
    if (workspace.workspace_type === 'organization') {
      const adminRole = orgRoles.find(role => roles.includes(role))
      if (adminRole) choices.push({
        id: `${workspace.workspace_id}:org`, label: workspace.display_name || 'Organization', detail: 'Organization Admin',
        portal: 'org', href: '/org', workspaceId: workspace.workspace_id, actingRole: adminRole,
        active: payload.active_workspace_id === workspace.workspace_id && ['owner', 'org_admin', 'team_manager', 'school_admin', 'club_admin', 'travel_admin', 'athletic_director', 'program_director'].includes(String(payload.active_role)),
      })
      if (roles.includes('coach') || roles.includes('assistant_coach')) {
        const assignedTeams = coachTeams.filter(team => team.workspace_id === workspace.workspace_id)
        if (assignedTeams.length) {
          for (const team of assignedTeams) choices.push({
            id: `${workspace.workspace_id}:coach:${team.team_id}`, label: team.team_name, detail: `${workspace.display_name} · Coach`,
            portal: 'coach', href: '/coach/dashboard', workspaceId: workspace.workspace_id, actingRole: roles.includes('coach') ? 'coach' : 'assistant_coach', coachTeamId: team.team_id,
            active: payload.active_workspace_id === workspace.workspace_id && payload.selected_coach_team_id === team.team_id && ['coach', 'assistant_coach'].includes(String(payload.active_role)),
          })
        } else choices.push({
          id: `${workspace.workspace_id}:coach`, label: workspace.display_name || 'Organization', detail: 'Coach',
          portal: 'coach', href: '/coach/dashboard', workspaceId: workspace.workspace_id, actingRole: roles.includes('coach') ? 'coach' : 'assistant_coach',
          active: payload.active_workspace_id === workspace.workspace_id && ['coach', 'assistant_coach'].includes(String(payload.active_role)),
        })
      }
    } else if (workspace.workspace_type === 'league') {
      const leagueRole = leagueRoles.find(role => roles.includes(role))
      if (leagueRole) choices.push({
        id: `${workspace.workspace_id}:league`, label: workspace.display_name || 'League', detail: 'League Administration',
        portal: 'league', href: '/league', workspaceId: workspace.workspace_id, actingRole: leagueRole,
        active: payload.active_workspace_id === workspace.workspace_id,
      })
    } else if (roles.includes('coach') || roles.includes('owner')) {
      choices.push({
        id: `${workspace.workspace_id}:coach`, label: workspace.display_name || 'Independent Team', detail: 'Independent Coach',
        portal: 'coach', href: '/coach/dashboard', workspaceId: workspace.workspace_id, actingRole: roles.includes('coach') ? 'coach' : 'owner',
        active: payload.active_workspace_id === workspace.workspace_id && !payload.selected_coach_team_id,
      })
    }

  }

  // Athlete identity is authorized by my_accessible_athlete_profiles, not by a
  // workspace role. A family can have accessible profiles before it belongs to
  // an organization, and a coach/admin account can also own an athlete profile.
  for (const athlete of athletes) choices.push({
    id: `athlete:${athlete.id}`, label: athlete.full_name || 'Athlete', detail: 'Athlete Profile',
    portal: 'athlete', href: '/athlete/dashboard', actingRole: 'athlete', athleteProfileId: athlete.id,
    avatarUrl: athlete.avatar_url, active: payload.active_role === 'athlete' && payload.selected_athlete_profile_id === athlete.id,
  })
  return choices
}
