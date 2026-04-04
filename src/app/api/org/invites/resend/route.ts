import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isPushEnabled } from '@/lib/notificationPrefs'
import { getInviteDashboardPath, sendOrgInviteEmail } from '@/lib/inviteDelivery'
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

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const inviteId = body?.invite_id
  if (!inviteId) return jsonError('Missing invite.', 400)

  const { data: invite } = await supabaseAdmin
    .from('org_invites')
    .select('id, org_id, team_id, role, invited_email, invited_user_id, invited_by, status')
    .eq('id', inviteId)
    .maybeSingle()
  if (!invite) return jsonError('Invite not found.', 404)

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role, status')
    .eq('org_id', invite.org_id)
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (!membership || !adminRoles.includes(membership.role) || membership.status === 'suspended') {
    return jsonError('Forbidden', 403)
  }

  if (invite.invited_user_id) {
    const { data: invitedMembership } = await supabaseAdmin
      .from('organization_memberships')
      .select('status')
      .eq('org_id', invite.org_id)
      .eq('user_id', invite.invited_user_id)
      .maybeSingle()
    if (invitedMembership?.status === 'suspended') {
      return jsonError('User is suspended. Restore access instead.', 409)
    }
  }

  await supabaseAdmin
    .from('org_invites')
    .update({ created_at: new Date().toISOString() })
    .eq('id', invite.id)

  if (invite.invited_user_id) {
    const { data: prefsRow } = await supabaseAdmin
      .from('profiles')
      .select('notification_prefs')
      .eq('id', invite.invited_user_id)
      .maybeSingle()
    if (isPushEnabled(prefsRow?.notification_prefs, 'messages')) {
      await supabaseAdmin.from('notifications').insert({
        user_id: invite.invited_user_id,
        type: 'org_invite',
        title: 'Invite reminder',
        body: 'You have a pending organization invite.',
        action_url: getInviteDashboardPath(invite.role),
        data: { invite_id: invite.id, org_id: invite.org_id, team_id: invite.team_id, role: invite.role, category: 'Messages' },
      })
    }
  }

  const [orgResult, teamResult, inviterResult] = await Promise.all([
    supabaseAdmin.from('organizations').select('name').eq('id', invite.org_id).maybeSingle(),
    invite.team_id ? supabaseAdmin.from('org_teams').select('name').eq('id', invite.team_id).maybeSingle() : Promise.resolve({ data: null }),
    invite.invited_by
      ? supabaseAdmin.from('profiles').select('full_name, email').eq('id', invite.invited_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  let warning: string | null = null
  let inviteDelivery = 'skipped'
  if (invite.invited_email) {
    const delivery = await sendOrgInviteEmail({
      toEmail: String(invite.invited_email).trim().toLowerCase(),
      inviteId: invite.id,
      orgId: invite.org_id,
      orgName: orgResult.data?.name || null,
      teamId: invite.team_id || null,
      teamName: teamResult.data?.name || null,
      role: invite.role || null,
      inviterName:
        inviterResult.data?.full_name || inviterResult.data?.email || session.user.user_metadata?.full_name || session.user.email || 'Org admin',
    })
    inviteDelivery = delivery.status
    if (delivery.status !== 'sent') {
      warning = 'Invite was refreshed, but email delivery failed.'
    }
  }

  return NextResponse.json({ ok: true, invite_delivery: inviteDelivery, warning })
}
