import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendGuardianInviteEmail } from '@/lib/inviteDelivery'
import { createInviteToken, hashInviteToken, inviteTokenExpiresAt } from '@/lib/inviteTokens'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const reminderSecret = process.env.REMINDER_CRON_SECRET
  const hostname = new URL(request.url).hostname
  const localDevelopmentRequest =
    (hostname === '127.0.0.1' || hostname === 'localhost') &&
    request.headers.get('x-local-invite-worker') === '1'
  const authorized =
    localDevelopmentRequest ||
    (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) ||
    (reminderSecret && request.headers.get('x-reminder-secret') === reminderSecret)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: invitations, error } = await supabaseAdmin
    .from('athlete_guardian_invitations')
    .select('id, org_id, athlete_id, invited_email, invited_role, created_by, email_delivery_status')
    .eq('status', 'pending')
    .or('email_delivery_status.is.null,email_delivery_status.eq.failed,email_delivery_status.eq.skipped')
    .order('created_at', { ascending: true })
    .limit(50)
  if (error) return NextResponse.json({ error: 'Unable to load pending invitations' }, { status: 500 })

  let sent = 0
  let failed = 0
  for (const invitation of invitations || []) {
    const [{ data: organization }, { data: athlete }, { data: inviter }] = await Promise.all([
      supabaseAdmin.from('organizations').select('name').eq('id', invitation.org_id).maybeSingle(),
      supabaseAdmin.from('athlete_profiles').select('full_name').eq('id', invitation.athlete_id).maybeSingle(),
      supabaseAdmin.from('profiles').select('full_name, email').eq('id', invitation.created_by).maybeSingle(),
    ])
    if (!organization?.name || !athlete?.full_name) {
      failed++
      await supabaseAdmin.from('athlete_guardian_invitations').update({
        email_delivery_status: 'failed',
        email_delivery_attempted_at: new Date().toISOString(),
      }).eq('id', invitation.id)
      continue
    }

    const inviteToken = createInviteToken()
    const { data: claimed } = await supabaseAdmin.from('athlete_guardian_invitations').update({
      organization_name: organization.name,
      invite_token_hash: hashInviteToken(inviteToken),
      token_expires_at: inviteTokenExpiresAt(),
      email_delivery_status: 'sending',
      email_delivery_attempted_at: new Date().toISOString(),
    }).eq('id', invitation.id).eq('status', 'pending')
      .or('email_delivery_status.is.null,email_delivery_status.eq.failed,email_delivery_status.eq.skipped')
      .select('id').maybeSingle()
    if (!claimed) continue

    const delivery = await sendGuardianInviteEmail({
      toEmail: invitation.invited_email,
      inviteId: invitation.id,
      inviteToken,
      orgId: invitation.org_id,
      orgName: organization.name,
      athleteName: athlete.full_name,
      inviterName: inviter?.full_name || inviter?.email || 'An organization administrator',
      invitedRole: invitation.invited_role,
    })
    await supabaseAdmin.from('athlete_guardian_invitations').update({
      email_delivery_status: delivery.status,
      email_delivery_attempted_at: new Date().toISOString(),
    }).eq('id', invitation.id)
    if (delivery.status === 'sent') sent++
    else failed++
  }

  return NextResponse.json({ processed: (invitations || []).length, sent, failed })
}
