import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { emitTenantEvent, organizationNotificationContext } from '@/lib/notificationProducers'
export const dynamic = 'force-dynamic'


const adminRoles = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'admin',
]

const coachRoles = ['coach', 'assistant_coach']

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const membershipId = body?.membership_id
  const teamId = body?.team_id || null
  if (!membershipId) return jsonError('Missing membership.', 400)

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('id, org_id, user_id, role')
    .eq('id', membershipId)
    .maybeSingle()
  if (!membership) return jsonError('Membership not found.', 404)

  const { data: adminMembership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role')
    .eq('org_id', membership.org_id)
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (!adminMembership) return jsonError('Forbidden', 403)

  if (teamId) {
    const { data: team } = await supabaseAdmin
      .from('org_teams')
      .select('id')
      .eq('id', teamId)
      .eq('org_id', membership.org_id)
      .maybeSingle()
    if (!team) return jsonError('Invalid team.', 400)
  }

  if (membership.role === 'athlete') {
    await supabaseAdmin.from('org_team_members').delete().eq('athlete_id', membership.user_id)
    if (teamId) {
      await supabaseAdmin.from('org_team_members').insert({
        team_id: teamId,
        athlete_id: membership.user_id,
      })
    }
  }

  if (coachRoles.includes(membership.role)) {
    await supabaseAdmin.from('org_team_coaches').delete().eq('coach_id', membership.user_id)
    if (teamId) {
      await supabaseAdmin.from('org_team_coaches').insert({
        team_id: teamId,
        coach_id: membership.user_id,
        role: membership.role,
      })
    }
  }

  const { data: teamRows } = await supabaseAdmin
    .from('org_teams')
    .select('id')
    .eq('org_id', membership.org_id)
  const teamIds = (teamRows || []).map((row) => row.id)

  const teamMembers = teamIds.length
    ? await supabaseAdmin
        .from('org_team_members')
        .select('team_id, athlete_id')
        .in('team_id', teamIds)
    : { data: [] }

  const teamCoaches = teamIds.length
    ? await supabaseAdmin
        .from('org_team_coaches')
        .select('team_id, coach_id, role')
        .in('team_id', teamIds)
    : { data: [] }

  const notificationContext = await organizationNotificationContext(membership.org_id)
  await emitTenantEvent({ recipientIds: [membership.user_id], type: 'team_assignment_changed', category: 'roster',
    title: teamId ? 'Team assignment updated' : 'Team assignment removed',
    body: teamId ? 'Your organization team assignment has changed.' : 'You are no longer assigned to an organization team.',
    destination: '/open-app?destination=workspace-roster', resourceId: membership.id,
    state: teamId ? `assigned:${teamId}` : 'unassigned', context: notificationContext,
    data: { team_id: teamId, membership_id: membership.id } })

  return NextResponse.json({
    ok: true,
    team_members: teamMembers.data || [],
    team_coaches: teamCoaches.data || [],
  })
}
