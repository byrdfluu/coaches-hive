import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isPushEnabled } from '@/lib/notificationPrefs'
import { getSessionRoleState } from '@/lib/sessionRoleState'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

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

  if (!invite_id || !['accept', 'decline'].includes(action)) {
    return jsonError('invite_id and action (accept|decline) are required')
  }

  const { data: invite } = await supabaseAdmin
    .from('org_invites')
    .select('*')
    .eq('id', invite_id)
    .maybeSingle()

  if (!invite) {
    return jsonError('Invite not found', 404)
  }

  const email = (session.user.email || '').toLowerCase()
  const inviteEmail = String(invite.invited_email || '').toLowerCase()
  if (inviteEmail !== email && invite.invited_user_id !== session.user.id) {
    return jsonError('Forbidden', 403)
  }

  if (invite.status !== 'pending') {
    return jsonError('Invite already processed', 409)
  }

  const { data: existingMembership } = await supabaseAdmin
    .from('organization_memberships')
    .select('status')
    .eq('org_id', invite.org_id)
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (existingMembership?.status === 'suspended') {
    return jsonError('Your access is suspended. Contact your admin to restore.', 403)
  }

  if (action === 'accept') {
    const status = 'awaiting_approval'
    await supabaseAdmin
      .from('org_invites')
      .update({ status, invited_user_id: session.user.id })
      .eq('id', invite_id)

    // Org-invited users are covered by the org's subscription — advance lifecycle
    // so they aren't forced through the individual select-plan → checkout flow.
    const currentLifecycle = getSessionRoleState(session.user.user_metadata).lifecycleState || ''
    if (currentLifecycle && currentLifecycle !== 'active') {
      await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
        user_metadata: { lifecycle_state: 'active' },
      })
    }

    const { data: adminMembers } = await supabaseAdmin
      .from('organization_memberships')
      .select('user_id, role, status')
      .eq('org_id', invite.org_id)
      .in('role', [
        'org_admin',
        'club_admin',
        'travel_admin',
        'school_admin',
        'athletic_director',
        'program_director',
        'team_manager',
      ])

    if (adminMembers?.length) {
      const notificationRows = []
      for (const member of adminMembers) {
        if (member.status === 'suspended') continue
        const { data: prefsRow } = await supabaseAdmin
          .from('profiles')
          .select('notification_prefs')
          .eq('id', member.user_id)
          .maybeSingle()
        if (isPushEnabled(prefsRow?.notification_prefs, 'messages')) {
          notificationRows.push({
            user_id: member.user_id,
            type: 'org_invite_approval',
            title: 'Invite needs approval',
            body: 'A user accepted an invite and needs org approval.',
            action_url: '/org/permissions',
            data: { invite_id, org_id: invite.org_id, team_id: invite.team_id, role: invite.role, category: 'Messages' },
          })
        }
      }
      if (notificationRows.length) {
        await supabaseAdmin.from('notifications').insert(notificationRows)
      }
    }

    return NextResponse.json({ status })
  }

  const status = 'declined'
  await supabaseAdmin
    .from('org_invites')
    .update({ status, invited_user_id: session.user.id })
    .eq('id', invite_id)

  return NextResponse.json({ status })
}
