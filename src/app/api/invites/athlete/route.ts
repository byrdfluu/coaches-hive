import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireWorkspaceContext, workspaceCan } from '@/lib/workspaceAuthority'
import { createInviteToken, hashInviteToken, inviteTokenExpiresAt } from '@/lib/inviteTokens'
import { buildBrandedEmailHtml, sendTransactionalEmail } from '@/lib/email'
import { requestIdFor } from '@/lib/requestSecurity'

export const dynamic = 'force-dynamic'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  const fail = (status: number, retryable = status >= 500) => NextResponse.json({
    code: 'athlete_invitation_failed',
    message: 'We couldn’t send the invitation. Please try again.',
    retryable,
    request_id: requestId,
  }, { status, headers: { 'X-Coaches-Hive-Support-Reference': requestId } })
  const reject = (reason: string, status: number, context: Record<string, unknown> = {}) => {
    console.warn('[invites/athlete] request rejected', { request_id: requestId, reason, ...context })
    return fail(status, status === 429 || status >= 500)
  }

  const user = await getMobileRequestUser(request)
  if (!user) return reject('unauthorized', 401)
  const body = await request.json().catch(() => null)
  if (!body) return reject('invalid_json', 400, { user_id: user.id })
  const email = String(body.email || '').trim().toLowerCase()
  const bodyWorkspaceId = String(body.workspace_id || '').trim()
  const headerWorkspaceId = String(request.headers.get('x-workspace-id') || '').trim()
  if (!/^\S+@\S+\.\S+$/.test(email)) return reject('invalid_email', 422, { user_id: user.id })
  if (!UUID_PATTERN.test(headerWorkspaceId) || !UUID_PATTERN.test(bodyWorkspaceId)) {
    return reject('invalid_workspace_id', 400, { user_id: user.id, header_workspace_id: headerWorkspaceId, body_workspace_id: bodyWorkspaceId })
  }
  if (bodyWorkspaceId !== headerWorkspaceId) {
    return reject('workspace_context_mismatch', 409, { user_id: user.id, header_workspace_id: headerWorkspaceId, body_workspace_id: bodyWorkspaceId })
  }

  const workspace = await requireWorkspaceContext(user.id, headerWorkspaceId)
  if (!workspace) return reject('active_workspace_membership_not_found', 403, { user_id: user.id, workspace_id: headerWorkspaceId })
  const authorized = workspace.type === 'independent_coach'
    ? workspace.ownerUserId === user.id && workspace.roles.some(role => role === 'owner' || role === 'coach')
    : workspaceCan(workspace, 'manage_members')
  if (!authorized) return reject('missing_manage_members_permission', 403, {
    user_id: user.id, workspace_id: workspace.id, workspace_type: workspace.type,
  })

  const organizationId = String(body.organization_id || '').trim() || null
  const legacyOrgId = String(body.org_id || '').trim() || null
  const leagueId = String(body.league_id || '').trim() || null
  if (workspace.type === 'organization') {
    const suppliedOrganizationIds = [organizationId, legacyOrgId].filter((value): value is string => Boolean(value))
    if (!workspace.organizationId || !suppliedOrganizationIds.length
      || suppliedOrganizationIds.some(value => value !== workspace.organizationId) || leagueId) {
      return reject('workspace_organization_mismatch', 409, { user_id: user.id, workspace_id: workspace.id })
    }
  } else if (workspace.type === 'league') {
    if (!workspace.leagueId || leagueId !== workspace.leagueId || organizationId || legacyOrgId) {
      return reject('workspace_league_mismatch', 409, { user_id: user.id, workspace_id: workspace.id })
    }
  } else if (organizationId || legacyOrgId || leagueId) {
    return reject('independent_workspace_owner_ids_present', 409, { user_id: user.id, workspace_id: workspace.id })
  }

  const [{ data: workspaceRow }, { data: inviter }, { data: invitedProfile }, existingResult] = await Promise.all([
    supabaseAdmin.from('business_workspaces').select('display_name').eq('id', workspace.id).single(),
    supabaseAdmin.from('profiles').select('full_name,email').eq('id', user.id).maybeSingle(),
    supabaseAdmin.from('profiles').select('id,role').ilike('email', email).maybeSingle(),
    supabaseAdmin.from('coach_athlete_invitations').select('id').eq('workspace_id', workspace.id)
      .ilike('invited_email', email).eq('status', 'pending').limit(1).maybeSingle(),
  ])
  if (invitedProfile?.role && invitedProfile.role !== 'athlete') return reject('email_role_conflict', 409, { user_id: user.id, workspace_id: workspace.id })
  if (existingResult.error) return reject('invitation_lookup_failed', 500, { user_id: user.id, workspace_id: workspace.id, db_code: existingResult.error.code })

  const token = createInviteToken()
  const expiresAt = inviteTokenExpiresAt()
  const invitationValues = {
    workspace_id: workspace.id,
    coach_id: user.id,
    invited_email: email,
    invited_user_id: invitedProfile?.id || null,
    invite_token_hash: hashInviteToken(token),
    status: 'pending',
    email_delivery_status: 'pending',
    token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }
  let invitationResult = existingResult.data?.id
    ? await supabaseAdmin.from('coach_athlete_invitations').update(invitationValues).eq('id', existingResult.data.id).eq('status', 'pending').select('id').single()
    : await supabaseAdmin.from('coach_athlete_invitations').insert(invitationValues).select('id').single()
  if (invitationResult.error?.code === '23505') {
    invitationResult = await supabaseAdmin.from('coach_athlete_invitations').update(invitationValues)
      .eq('workspace_id', workspace.id).ilike('invited_email', email).eq('status', 'pending').select('id').single()
  }
  if (invitationResult.error || !invitationResult.data) {
    return reject('invitation_create_failed', 500, { user_id: user.id, workspace_id: workspace.id, db_code: invitationResult.error?.code })
  }

  const invitationId = invitationResult.data.id
  const actionUrl = `https://app.coacheshive.com/invite/accept?token=${encodeURIComponent(token)}`
  const inviterName = inviter?.full_name || 'A Coaches Hive staff member'
  const workspaceName = workspaceRow?.display_name || 'your Coaches Hive workspace'
  const bodyHtml = `<p><strong>${escapeHtml(inviterName)}</strong> invited you to join <strong>${escapeHtml(workspaceName)}</strong> as an athlete.</p>`
  const delivery = await sendTransactionalEmail({
    toEmail: email,
    subject: `${inviterName} invited you to ${workspaceName}`,
    templateAlias: 'user_invite',
    templateModel: {
      email_heading: 'You were invited to Coaches Hive',
      message_preview: `${inviterName} invited you to join ${workspaceName}.`,
      cta_label: 'Accept invitation', action_url: actionUrl, invite_type: 'athlete',
      inviter_name: inviterName, inviter_role: 'Staff', athlete_name: String(body.name || '').trim(),
      invite_type_label: 'athlete', body_html: bodyHtml,
    },
    htmlBody: buildBrandedEmailHtml(bodyHtml, actionUrl, 'Accept invitation'),
    textBody: `${inviterName} invited you to join ${workspaceName} as an athlete. Accept the invitation: ${actionUrl}`,
    tag: 'coach_invite_athlete',
    metadata: { invitation_id: invitationId, workspace_id: workspace.id, inviter_user_id: user.id, request_id: requestId },
  }).catch((error: unknown) => {
    console.error('[invites/athlete] email provider request failed', {
      request_id: requestId, workspace_id: workspace.id, invitation_id: invitationId,
      error_message: error instanceof Error ? error.message : 'Unknown email provider error',
    })
    return null
  })
  if (!delivery) {
    await supabaseAdmin.from('coach_athlete_invitations').update({
      status: 'delivery_failed', email_delivery_status: 'failed',
      email_delivery_attempted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', invitationId)
    return reject('invitation_delivery_failed', 502, { user_id: user.id, workspace_id: workspace.id, invitation_id: invitationId })
  }
  const providerMessageId = 'messageId' in delivery ? String(delivery.messageId || '') || null : null
  const { error: deliveryUpdateError } = await supabaseAdmin.from('coach_athlete_invitations').update({
    email_delivery_status: delivery.status,
    email_delivery_attempted_at: new Date().toISOString(),
    email_provider_message_id: providerMessageId,
    ...(delivery.status === 'sent' ? {} : { status: 'delivery_failed' }),
    updated_at: new Date().toISOString(),
  }).eq('id', invitationId)
  if (delivery.status !== 'sent' || deliveryUpdateError) {
    return reject('invitation_delivery_failed', 502, { user_id: user.id, workspace_id: workspace.id, invitation_id: invitationId })
  }

  return NextResponse.json({ success: true, invitation_id: invitationId, status: 'pending' }, {
    status: existingResult.data?.id ? 200 : 201,
    headers: { 'X-Coaches-Hive-Support-Reference': requestId },
  })
}
