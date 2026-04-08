import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isPushEnabled } from '@/lib/notificationPrefs'
import { getInviteDashboardPath } from '@/lib/inviteDelivery'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
]

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return jsonError('Unauthorized', 401)
  }

  const body = await request.json().catch(() => ({}))
  const { invite_id, action } = body || {}

  if (!invite_id || !['approve', 'decline'].includes(action)) {
    return jsonError('invite_id and action (approve|decline) are required')
  }

  const { data: invite } = await supabaseAdmin
    .from('org_invites')
    .select('*')
    .eq('id', invite_id)
    .maybeSingle()

  if (!invite) {
    return jsonError('Invite not found', 404)
  }

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role, status')
    .eq('org_id', invite.org_id)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!membership || membership.status === 'suspended' || !ADMIN_ROLES.includes(String(membership.role || ''))) {
    return jsonError('Forbidden', 403)
  }

  if (invite.status !== 'awaiting_approval') {
    return jsonError('Invite is not awaiting approval', 409)
  }

  if (action === 'decline') {
    await supabaseAdmin
      .from('org_invites')
      .update({ status: 'declined' })
      .eq('id', invite_id)

    if (invite.invited_user_id) {
      const { data: prefsRow } = await supabaseAdmin
        .from('profiles')
        .select('notification_prefs')
        .eq('id', invite.invited_user_id)
        .maybeSingle()
      if (isPushEnabled(prefsRow?.notification_prefs, 'messages')) {
        await supabaseAdmin.from('notifications').insert({
          user_id: invite.invited_user_id,
          type: 'org_invite_declined',
          title: 'Invite declined',
          body: 'Your organization invite was declined.',
          action_url: '/athlete/dashboard',
          data: { invite_id, org_id: invite.org_id, category: 'Messages' },
        })
      }
    }

    return NextResponse.json({ status: 'declined' })
  }

  if (!invite.invited_user_id) {
    return jsonError('Invitee has not accepted the invite yet.', 409)
  }

  const { data: existingMembership } = await supabaseAdmin
    .from('organization_memberships')
    .select('id, status')
    .eq('org_id', invite.org_id)
    .eq('user_id', invite.invited_user_id)
    .maybeSingle()

  if (existingMembership?.status === 'suspended') {
    await supabaseAdmin
      .from('organization_memberships')
      .update({ status: 'active', suspended_at: null })
      .eq('id', existingMembership.id)
  } else if (!existingMembership) {
    await supabaseAdmin.from('organization_memberships').insert({
      org_id: invite.org_id,
      user_id: invite.invited_user_id,
      role: invite.role,
    })
  }

  if (invite.team_id && invite.role === 'athlete') {
    const { data: existingTeamMember } = await supabaseAdmin
      .from('org_team_members')
      .select('id')
      .eq('team_id', invite.team_id)
      .eq('athlete_id', invite.invited_user_id)
      .maybeSingle()
    if (!existingTeamMember) {
      await supabaseAdmin.from('org_team_members').insert({
        team_id: invite.team_id,
        athlete_id: invite.invited_user_id,
      })
    }
  }

  if (invite.team_id && ['coach', 'assistant_coach'].includes(String(invite.role))) {
    const { data: existingCoachLink } = await supabaseAdmin
      .from('org_team_coaches')
      .select('id')
      .eq('team_id', invite.team_id)
      .eq('coach_id', invite.invited_user_id)
      .maybeSingle()
    if (!existingCoachLink) {
      await supabaseAdmin.from('org_team_coaches').insert({
        team_id: invite.team_id,
        coach_id: invite.invited_user_id,
        role: invite.role,
      })
    }
    if (invite.role === 'coach') {
      const { data: teamRow } = await supabaseAdmin
        .from('org_teams')
        .select('coach_id')
        .eq('id', invite.team_id)
        .maybeSingle()
      if (!teamRow?.coach_id) {
        await supabaseAdmin
          .from('org_teams')
          .update({ coach_id: invite.invited_user_id })
          .eq('id', invite.team_id)
      }
    }
  }

  await supabaseAdmin
    .from('org_invites')
    .update({ status: 'approved' })
    .eq('id', invite_id)

  if (invite.invited_user_id) {
    const { data: prefsRow } = await supabaseAdmin
      .from('profiles')
      .select('notification_prefs')
      .eq('id', invite.invited_user_id)
      .maybeSingle()
    if (isPushEnabled(prefsRow?.notification_prefs, 'messages')) {
      await supabaseAdmin.from('notifications').insert({
        user_id: invite.invited_user_id,
        type: 'org_invite_approved',
        title: 'Invite approved',
        body: 'You have been added to the organization.',
        action_url: getInviteDashboardPath(invite.role),
        data: { invite_id, org_id: invite.org_id, team_id: invite.team_id, role: invite.role, category: 'Messages' },
      })
    }
  }

  return NextResponse.json({ status: 'approved' })
}
