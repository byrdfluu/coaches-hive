import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createInviteToken, hashInviteToken, inviteTokenExpiresAt } from '@/lib/inviteTokens'
import { MOBILE_AUTH_CALLBACK_URL } from '@/lib/mobileLinks'
import { isSuperadminUser } from '@/lib/recurringFees'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const INVITABLE_ROLES = new Set([
  'org_admin','club_admin','travel_admin','school_admin','athletic_director',
  'program_director','team_manager','coach','assistant_coach','athlete',
])

const responseError = (code: string, message: string, status: number, requestId: string, retryable = status >= 500) =>
  NextResponse.json({ error: { code, message, retryable, request_id: requestId } }, {
    status, headers: { 'x-request-id': requestId },
  })

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()

export async function POST(request: Request) {
  const suppliedRequestId = request.headers.get('x-request-id')?.trim()
  const requestId = suppliedRequestId && /^[A-Za-z0-9._:-]{8,100}$/.test(suppliedRequestId)
    ? suppliedRequestId : randomUUID()
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  let user = session?.user || null
  if (!user) {
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
    if (token) user = (await supabaseAdmin.auth.getUser(token)).data.user
  }
  if (!user) return responseError('unauthorized', 'Authentication is required.', 401, requestId, false)

  const body = await request.json().catch(() => null)
  const email = normalizeEmail(body?.invited_email || body?.email)
  const orgId = String(body?.org_id || '').trim()
  const workspaceId = request.headers.get('x-workspace-id')?.trim() || String(body?.workspace_id || '').trim()
  const primaryRole = String(body?.role || '').trim()
  const roles = Array.from(new Set([primaryRole, ...(Array.isArray(body?.roles) ? body.roles.map(String) : [])]
    .map(role => role.trim()).filter(Boolean)))
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !orgId || !workspaceId || !primaryRole) {
    return responseError('invalid_request', 'invited_email, org_id, workspace_id, and role are required.', 400, requestId, false)
  }
  if (roles.some(role => !INVITABLE_ROLES.has(role))) {
    return responseError('invalid_roles', 'One or more invitation roles are invalid.', 422, requestId, false)
  }

  const { data: workspace } = await supabaseAdmin.from('business_workspaces')
    .select('id,organization_id,workspace_type,status,display_name').eq('id', workspaceId).maybeSingle()
  if (!workspace || workspace.status !== 'active') return responseError('workspace_not_found', 'Workspace not found.', 403, requestId, false)
  if (workspace.workspace_type !== 'organization' || workspace.organization_id !== orgId) {
    return responseError('workspace_org_mismatch', 'Workspace does not belong to the requested organization.', 403, requestId, false)
  }
  const { data: membership } = await supabaseAdmin.from('workspace_memberships')
    .select('roles,permissions,status').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle()
  const memberRoles = Array.isArray(membership?.roles) ? (membership?.roles || []).map(String) : []
  const permissions = (membership?.permissions || {}) as Record<string, unknown>
  const authorized = membership?.status === 'active' && (
    memberRoles.some(role => role === 'owner' || role === 'org_admin') || permissions.manage_members === true
  ) || await isSuperadminUser(user)
  if (!authorized) return responseError('missing_manage_members_permission', 'Member-management permission is required.', 403, requestId, false)

  const emailHash = createHash('sha256').update(email).digest('hex')
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString()
  const { count } = await supabaseAdmin.from('staff_invite_provision_requests')
    .select('id', { count: 'exact', head: true }).eq('actor_user_id', user.id)
    .eq('normalized_email_hash', emailHash).gte('created_at', cutoff)
  if ((count || 0) >= 3) {
    await supabaseAdmin.from('staff_invite_provision_requests').insert({
      request_id: requestId, actor_user_id: user.id, workspace_id: workspaceId,
      organization_id: orgId, normalized_email_hash: emailHash, status: 'rate_limited', completed_at: new Date().toISOString(),
    })
    return responseError('rate_limited', 'Too many set-password requests. Try again later.', 429, requestId, true)
  }

  const { data: audit } = await supabaseAdmin.from('staff_invite_provision_requests').insert({
    request_id: requestId, actor_user_id: user.id, workspace_id: workspaceId,
    organization_id: orgId, normalized_email_hash: emailHash, status: 'started',
  }).select('id').single()
  if (!audit) return responseError('audit_failed', 'Unable to record the provisioning request.', 500, requestId, true)

  try {
    const listed = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    let authUser = listed.data.users.find(candidate => normalizeEmail(candidate.email) === email) || null
    if (!authUser) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email, email_confirm: true, user_metadata: { lifecycle_state: 'invited', provisioned_for_workspace: workspaceId },
      })
      if (created.error || !created.data.user) throw new Error('Unable to provision the invited account')
      authUser = created.data.user
    }

    const { data: existingInvite } = await supabaseAdmin.from('org_invites').select('id')
      .eq('org_id', orgId).eq('workspace_id', workspaceId).ilike('invited_email', email)
      .in('status', ['draft','failed','pending']).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const token = createInviteToken()
    const invitationValues = {
      org_id: orgId, workspace_id: workspaceId, organization_name: workspace.display_name,
      invited_email: email, invited_user_id: authUser.id, invited_by: user.id,
      role: primaryRole, roles, status: 'draft', invite_token_hash: hashInviteToken(token),
      token_expires_at: inviteTokenExpiresAt(), updated_at: new Date().toISOString(),
    }
    const inviteWrite = existingInvite?.id
      ? await supabaseAdmin.from('org_invites').update(invitationValues).eq('id', existingInvite.id).select('id').single()
      : await supabaseAdmin.from('org_invites').insert(invitationValues).select('id').single()
    if (inviteWrite.error || !inviteWrite.data) throw new Error('Unable to save the pending invitation')

    const recovery = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: MOBILE_AUTH_CALLBACK_URL })
    if (recovery.error) throw recovery.error
    await Promise.all([
      supabaseAdmin.from('org_invites').update({ status: 'pending', email_delivery_status: 'sent', email_delivery_attempted_at: new Date().toISOString() }).eq('id', inviteWrite.data.id),
      supabaseAdmin.from('staff_invite_provision_requests').update({ invitation_id: inviteWrite.data.id, status: 'sent', completed_at: new Date().toISOString() }).eq('id', audit.id),
    ])
    return NextResponse.json({ request_id: requestId, status: 'sent', invitation_id: inviteWrite.data.id }, {
      headers: { 'x-request-id': requestId },
    })
  } catch (error) {
    await supabaseAdmin.from('staff_invite_provision_requests').update({
      status: 'failed', error_code: 'provisioning_failed', completed_at: new Date().toISOString(),
    }).eq('id', audit.id)
    return responseError('provisioning_failed', 'Unable to send the secure set-password email. Please retry.', 502, requestId, true)
  }
}
