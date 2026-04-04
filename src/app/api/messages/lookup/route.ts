import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const ALLOWED_ROLES = [
  'coach',
  'athlete',
  'admin',
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
]

const ADMIN_ORG_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])
const COACH_ROLES = new Set(['coach', 'assistant_coach'])
const ATHLETE_ROLES = new Set(['athlete'])

export async function GET(request: Request) {
  const { session, role, error } = await getSessionRole(ALLOWED_ROLES)
  if (error || !session) return error

  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('query') || '').trim()
  const typesParam = (searchParams.get('types') || 'user,org,team').trim()
  const types = new Set(typesParam.split(',').map((value) => value.trim()).filter(Boolean))

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const results: Array<{ id: string; label: string; type: string; role?: string | null }> = []

  const userId = session.user.id
  const isPlatformAdmin = role === 'admin'

  let orgIds: string[] = []
  let adminOrgIds: string[] = []
  let teamIds: string[] = []

  if (!isPlatformAdmin && (types.has('org') || types.has('team'))) {
    const { data: membershipRows } = await supabaseAdmin
      .from('organization_memberships')
      .select('org_id, role')
      .eq('user_id', userId)

    const memberships = membershipRows || []
    orgIds = Array.from(new Set(memberships.map((row) => row.org_id).filter(Boolean)))
    adminOrgIds = Array.from(
      new Set(
        memberships
          .filter((row) => ADMIN_ORG_ROLES.has(String(row.role)))
          .map((row) => row.org_id)
          .filter(Boolean)
      )
    )

    const isCoach = memberships.some((row) => COACH_ROLES.has(String(row.role)))
    const isAthlete = memberships.some((row) => ATHLETE_ROLES.has(String(row.role)))

    const teamSet = new Set<string>()

    if (adminOrgIds.length) {
      const { data: adminTeams } = await supabaseAdmin
        .from('org_teams')
        .select('id')
        .in('org_id', adminOrgIds)
      ;(adminTeams || []).forEach((team) => teamSet.add(team.id))
    }

    if (isCoach) {
      const { data: coachTeams } = await supabaseAdmin
        .from('org_teams')
        .select('id')
        .eq('coach_id', userId)
      ;(coachTeams || []).forEach((team) => teamSet.add(team.id))
    }

    if (isAthlete) {
      const { data: athleteTeams } = await supabaseAdmin
        .from('org_team_members')
        .select('team_id')
        .eq('athlete_id', userId)
      ;(athleteTeams || []).forEach((row) => row.team_id && teamSet.add(row.team_id))
    }

    teamIds = Array.from(teamSet)
  }

  if (types.has('user')) {
    const { data: users } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role')
      .ilike('full_name', `%${query}%`)
      .limit(8)

    ;(users || []).forEach((user) => {
      results.push({
        id: user.id,
        label: user.full_name || 'User',
        type: 'user',
        role: user.role || null,
      })
    })
  }

  if (types.has('org')) {
    if (isPlatformAdmin || orgIds.length > 0) {
      const orgQuery = supabaseAdmin
        .from('organizations')
        .select('id, name')
        .ilike('name', `%${query}%`)
        .limit(6)
      if (!isPlatformAdmin) {
        orgQuery.in('id', orgIds)
      }
      const { data: orgs } = await orgQuery

      ;(orgs || []).forEach((org) => {
        results.push({
          id: org.id,
          label: org.name || 'Organization',
          type: 'org',
        })
      })
    }
  }

  if (types.has('team')) {
    if (isPlatformAdmin || teamIds.length > 0) {
      const teamQuery = supabaseAdmin
        .from('org_teams')
        .select('id, name')
        .ilike('name', `%${query}%`)
        .limit(6)
      if (!isPlatformAdmin) {
        teamQuery.in('id', teamIds)
      }
      const { data: teams } = await teamQuery

      ;(teams || []).forEach((team) => {
        results.push({
          id: team.id,
          label: team.name || 'Team',
          type: 'team',
        })
      })
    }
  }

  return NextResponse.json({ results })
}
