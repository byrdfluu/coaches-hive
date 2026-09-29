import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireWorkspaceContext } from '@/lib/workspaceAuthority'
import { createInviteToken, hashInviteToken, inviteTokenExpiresAt } from '@/lib/inviteTokens'
import { buildBrandedEmailHtml, sendTransactionalEmail } from '@/lib/email'
import { correlatedError, requestIdFor } from '@/lib/requestSecurity'

export const dynamic = 'force-dynamic'
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  const fail = (code: string, message: string, status = 400, retryable = status === 429 || status >= 500) =>
    correlatedError(requestId, code, message, status, retryable)
  const user = await getMobileRequestUser(request)
  if (!user) return fail('unauthorized', 'Authentication is required.', 401, false)
  const body = await request.json().catch(() => null)
  const email = String(body?.email || '').trim().toLowerCase()
  const workspaceId = String(body?.workspace_id || '').trim()
  const headerWorkspaceId = String(request.headers.get('x-workspace-id') || '').trim()
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail('invalid_email', 'A valid athlete email is required.')
  if (!workspaceId || !headerWorkspaceId) return fail('workspace_required', 'A selected workspace is required.')
  if (workspaceId !== headerWorkspaceId) return fail('workspace_context_mismatch', 'The selected workspace does not match the request body.', 409, false)
  const workspace = await requireWorkspaceContext(user.id, workspaceId)
  if (!workspace || workspace.type !== 'independent_coach' || workspace.ownerUserId !== user.id
    || (!workspace.roles.includes('owner') && !workspace.roles.includes('coach'))) {
    return fail('workspace_invite_forbidden', 'Only the owner coach can invite athletes to this Single Team workspace.', 403, false)
  }

  const [{ data: coach }, { data: invitedProfile }, { data: existing }] = await Promise.all([
    supabaseAdmin.from('profiles').select('full_name,email').eq('id', user.id).maybeSingle(),
    supabaseAdmin.from('profiles').select('id,role').eq('email', email).maybeSingle(),
    supabaseAdmin.from('coach_athlete_invitations').select('id').eq('workspace_id', workspaceId)
      .eq('invited_email', email).eq('status', 'pending').maybeSingle(),
  ])
  if (invitedProfile?.role && invitedProfile.role !== 'athlete') return fail('email_role_conflict', 'This email belongs to a non-athlete account.', 409, false)

  const token = createInviteToken()
  const expiresAt = inviteTokenExpiresAt()
  const invitationValues = {
    workspace_id: workspaceId, coach_id: user.id, invited_email: email,
    invited_user_id: invitedProfile?.id || null, invite_token_hash: hashInviteToken(token),
    status: 'pending', email_delivery_status: 'pending', token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }
  const invitationResult = existing?.id
    ? await supabaseAdmin.from('coach_athlete_invitations').update(invitationValues).eq('id', existing.id).select('id').single()
    : await supabaseAdmin.from('coach_athlete_invitations').insert(invitationValues).select('id').single()
  if (invitationResult.error || !invitationResult.data) return fail('invitation_create_failed', 'Unable to create the athlete invitation.', 500, true)

  const invitationId = invitationResult.data.id
  const actionUrl = `https://app.coacheshive.com/invite/accept?token=${encodeURIComponent(token)}`
  const coachName = coach?.full_name || 'Your coach'
  const safeCoachName = escapeHtml(coachName)
  const textBody = `${coachName} invited you to join their Single Team workspace in Coaches Hive. Accept the invitation: ${actionUrl}`
  const delivery = await sendTransactionalEmail({
    toEmail: email, subject: `${coachName} invited you to Coaches Hive`, templateAlias: 'user_invite',
    templateModel: { email_heading: 'You were invited to Coaches Hive',
      message_preview: `${coachName} invited you to join their Single Team workspace.`, cta_label: 'Accept invitation',
      action_url: actionUrl, invite_type: 'athlete', inviter_name: coachName, inviter_role: 'Coach',
      athlete_name: String(body?.name || '').trim(), invite_type_label: 'athlete',
      body_html: `<p><strong>${safeCoachName}</strong> invited you to join their Single Team workspace in Coaches Hive.</p>` },
    htmlBody: buildBrandedEmailHtml(`<p><strong>${safeCoachName}</strong> invited you to join their Single Team workspace in Coaches Hive.</p>`, actionUrl, 'Accept invitation'),
    textBody, tag: 'coach_invite_athlete',
    metadata: { invitation_id: invitationId, workspace_id: workspaceId, coach_id: user.id, request_id: requestId },
  })
  const providerMessageId = 'messageId' in delivery ? String(delivery.messageId || '') || null : null
  await supabaseAdmin.from('coach_athlete_invitations').update({
    email_delivery_status: delivery.status, email_delivery_attempted_at: new Date().toISOString(),
    email_provider_message_id: providerMessageId,
    ...(delivery.status === 'sent' ? {} : { status: 'delivery_failed' }), updated_at: new Date().toISOString(),
  }).eq('id', invitationId)
  if (delivery.status !== 'sent') return fail('invitation_delivery_failed', 'The invitation was saved, but the email provider did not accept it.', 502, true)

  return NextResponse.json({ invitation_id: invitationId, workspace_id: workspaceId, invited_email: email,
    status: 'pending', delivery_status: 'sent', expires_at: expiresAt, request_id: requestId },
  { status: existing?.id ? 200 : 201, headers: { 'X-Coaches-Hive-Support-Reference': requestId } })
}
