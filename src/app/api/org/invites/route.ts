import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { insertNotifications } from '@/lib/inAppNotifications'
import { isPushEnabled } from '@/lib/notificationPrefs'
import { getInviteDashboardPath, sendOrgInviteEmail } from '@/lib/inviteDelivery'
import {
  ORG_ATHLETE_LIMITS,
  ORG_COACH_LIMITS,
  formatTierName,
  isOrgPlanActive,
  normalizeOrgStatus,
  normalizeOrgTier,
} from '@/lib/planRules'
import { trackServerFlowEvent, trackServerFlowFailure } from '@/lib/serverFlowTelemetry'
import type { User } from '@supabase/supabase-js'
import { createInviteToken, hashInviteToken, inviteTokenExpiresAt } from '@/lib/inviteTokens'
import { isSuperadminUser } from '@/lib/recurringFees'
import { recordWorkspaceAdminAudit } from '@/lib/workspaceAdmin'
import { randomUUID } from 'node:crypto'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const authorizationError = (
  code: 'not_platform_admin' | 'workspace_not_found' | 'workspace_org_mismatch' | 'missing_manage_members_permission',
  message: string,
) => NextResponse.json({ error: { code, message } }, { status: 403 })

const inviteError = (code: string, message: string, status: number, requestId: string, retryable = status >= 500) =>
  NextResponse.json(
    { error: { code, message, retryable, request_id: requestId } },
    { status, headers: { 'x-request-id': requestId } },
  )

const ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
] as const

const INVITABLE_ROLES = new Set([
  ...ADMIN_ROLES,
  'coach',
  'assistant_coach',
  'athlete',
])

async function resolvePostRequestUser(request: Request): Promise<User | null> {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.user) return session.user

  const authorization = request.headers.get('authorization') || ''
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token) return null

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) return null
  return user
}

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return jsonError('Unauthorized', 401)
  }

  const email = (session.user.email || '').toLowerCase()
  const userId = session.user.id

  const url = new URL(request.url)
  const orgId = url.searchParams.get('org_id')

  if (orgId) {
    const { data: membership } = await supabaseAdmin
      .from('organization_memberships')
      .select('role, status')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!membership || membership.status === 'suspended' || !ADMIN_ROLES.includes(membership.role as (typeof ADMIN_ROLES)[number])) {
      return jsonError('Forbidden', 403)
    }

    const { data: inviteRows, error } = await supabaseAdmin
      .from('org_invites')
      .select('id, org_id, team_id, role, invited_email, invited_user_id, status, created_at')
      .eq('org_id', orgId)
      .eq('status', 'awaiting_approval')
      .order('created_at', { ascending: false })

    if (error) {
      return jsonError(error.message, 500)
    }

    const profileIds = Array.from(
      new Set((inviteRows || []).map((row) => row.invited_user_id).filter(Boolean)),
    ) as string[]
    const teamIds = Array.from(
      new Set((inviteRows || []).map((row) => row.team_id).filter(Boolean)),
    ) as string[]

    const { data: membershipRows } = profileIds.length
      ? await supabaseAdmin
          .from('organization_memberships')
          .select('user_id, status')
          .eq('org_id', orgId)
          .in('user_id', profileIds)
      : { data: [] }
    const membershipStatusMap = new Map((membershipRows || []).map((row) => [row.user_id, row.status]))

    const { data: profileRows } = profileIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', profileIds)
      : { data: [] }

    const { data: teamRows } = teamIds.length
      ? await supabaseAdmin.from('org_teams').select('id, name').in('id', teamIds)
      : { data: [] }

    const profileMap = new Map((profileRows || []).map((row) => [row.id, row]))
    const teamMap = new Map((teamRows || []).map((row) => [row.id, row.name]))

    const invites = (inviteRows || [])
      .filter((row) => {
        if (!row.invited_user_id) return true
        const status = membershipStatusMap.get(row.invited_user_id)
        return !status
      })
      .map((row) => ({
      id: row.id,
      org_id: row.org_id,
      team_id: row.team_id,
      team_name: row.team_id ? teamMap.get(row.team_id) || null : null,
      role: row.role,
      invited_email: row.invited_email,
      invited_name: row.invited_user_id ? profileMap.get(row.invited_user_id)?.full_name || null : null,
      invited_user_id: row.invited_user_id,
      status: row.status,
      created_at: row.created_at,
    }))

    return NextResponse.json({ invites })
  }

  const { data: inviteRows, error } = await supabaseAdmin
    .from('org_invites')
    .select('id, org_id, team_id, role, invited_email, status, created_at')
    .in('status', ['pending', 'awaiting_approval'])
    .or(`invited_user_id.eq.${userId},invited_email.ilike.${email}`)
    .order('created_at', { ascending: false })

  if (error) {
    return jsonError(error.message, 500)
  }

  const orgIds = Array.from(new Set((inviteRows || []).map((row) => row.org_id)))
  const teamIds = Array.from(new Set((inviteRows || []).map((row) => row.team_id).filter(Boolean)))

  const { data: orgRows } = orgIds.length
    ? await supabaseAdmin.from('organizations').select('id, name').in('id', orgIds)
    : { data: [] }
  const { data: teamRows } = teamIds.length
    ? await supabaseAdmin.from('org_teams').select('id, name').in('id', teamIds)
    : { data: [] }

  const orgMap = new Map((orgRows || []).map((row) => [row.id, row.name]))
  const teamMap = new Map((teamRows || []).map((row) => [row.id, row.name]))

  const invites = (inviteRows || []).map((row) => ({
    id: row.id,
    org_id: row.org_id,
    org_name: orgMap.get(row.org_id) || 'Organization',
    team_id: row.team_id,
    team_name: row.team_id ? teamMap.get(row.team_id) || 'Team' : null,
    role: row.role,
    invited_email: row.invited_email,
    status: row.status,
    created_at: row.created_at,
  }))

  return NextResponse.json({ invites })
}

export async function POST(request: Request) {
  const suppliedRequestId = request.headers.get('x-request-id')?.trim()
  const requestId = suppliedRequestId && /^[A-Za-z0-9._:-]{8,100}$/.test(suppliedRequestId)
    ? suppliedRequestId
    : randomUUID()
  const user = await resolvePostRequestUser(request)

  if (!user) {
    trackServerFlowEvent({
      flow: 'org_invite_create',
      step: 'auth',
      status: 'failed',
      metadata: { reason: 'unauthorized' },
    })
    return inviteError('unauthorized', 'Authentication is required.', 401, requestId, false)
  }

  const body = await request.json().catch(() => ({}))
  const { org_id, team_id, invited_email } = body || {}
  const role = String(body?.role || '').trim()
  const requestedRoles = Array.isArray(body?.roles) ? body.roles.map((value: unknown) => String(value).trim()).filter(Boolean) : []
  const roles = Array.from(new Set([role, ...requestedRoles].filter(Boolean)))
  const inviteEmail = String(invited_email || '').trim().toLowerCase()

  if (!org_id || !role || !inviteEmail) {
    trackServerFlowEvent({
      flow: 'org_invite_create',
      step: 'validate',
      status: 'failed',
      userId: user.id,
      metadata: { reason: 'missing_required_fields' },
    })
    return inviteError('invalid_request', 'org_id, role, and invited_email are required.', 400, requestId, false)
  }

  if (roles.some((candidate) => !INVITABLE_ROLES.has(candidate as (typeof ADMIN_ROLES)[number]))) {
    return inviteError('invalid_roles', 'One or more invitation roles are invalid.', 422, requestId, false)
  }

  // Headers are case-insensitive by the Fetch standard, so this reads both
  // X-Workspace-ID and x-workspace-id from native mobile clients.
  const headerWorkspaceId = request.headers.get('x-workspace-id')?.trim() || ''
  const bodyWorkspaceId = typeof body?.workspace_id === 'string' ? body.workspace_id.trim() : ''
  const workspaceId = headerWorkspaceId || bodyWorkspaceId
  const { data: workspace } = workspaceId
    ? await supabaseAdmin.from('business_workspaces')
        .select('id,organization_id,workspace_type,status')
        .eq('id', workspaceId)
        .maybeSingle()
    : { data: null }

  if (!workspace || workspace.status === 'archived') {
    return inviteError('workspace_not_found', 'The requested organization workspace was not found.', 403, requestId, false)
  }
  if (workspace.workspace_type !== 'organization' || workspace.organization_id !== org_id) {
    return inviteError('workspace_org_mismatch', 'The workspace does not belong to the requested organization.', 403, requestId, false)
  }

  const { data: workspaceMembership } = await supabaseAdmin
    .from('workspace_memberships')
    .select('roles, permissions, status')
    .eq('workspace_id', workspace.id)
    .eq('user_id', user.id)
    .maybeSingle()
  const workspaceRoles = Array.isArray(workspaceMembership?.roles) ? workspaceMembership!.roles.map(String) : []
  const workspacePermissions = workspaceMembership?.permissions && typeof workspaceMembership.permissions === 'object'
    ? workspaceMembership.permissions as Record<string, unknown>
    : {}
  const canManageMembers = workspaceMembership?.status === 'active' && (
    workspaceRoles.some((candidate) => candidate === 'owner' || candidate === 'org_admin')
    || workspacePermissions.manage_members === true
  )
  const isPlatformSuperadmin = await isSuperadminUser(user)

  if (!canManageMembers && !isPlatformSuperadmin) {
    const code = workspaceMembership?.status === 'active'
      ? 'missing_manage_members_permission'
      : 'not_platform_admin'
    trackServerFlowEvent({
      flow: 'org_invite_create',
      step: 'workspace_authorization',
      status: 'failed',
      userId: user.id,
      entityId: org_id,
      metadata: { reason: code, workspaceId: workspace.id },
    })
    return inviteError(
      code,
      code === 'missing_manage_members_permission'
        ? 'The workspace membership does not grant manage_members permission.'
        : 'The user is neither a workspace member with manage_members permission nor a verified platform superadmin.',
      403,
      requestId,
      false,
    )
  }

  const actorRole = isPlatformSuperadmin ? 'superadmin' : workspaceRoles[0] || 'workspace_member'

  const { data: authoritativeOrg } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('id', org_id)
    .maybeSingle()
  if (!authoritativeOrg) return inviteError('organization_not_found', 'Organization not found.', 404, requestId, false)

  if (team_id) {
    const { data: authoritativeTeam } = await supabaseAdmin
      .from('org_teams')
      .select('id')
      .eq('id', team_id)
      .eq('org_id', authoritativeOrg.id)
      .maybeSingle()
    if (!authoritativeTeam) return inviteError('team_org_mismatch', 'Team does not belong to this organization.', 422, requestId, false)
  }

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('plan, plan_status')
    .eq('org_id', org_id)
    .maybeSingle()

  const orgTier = normalizeOrgTier(orgSettings?.plan)
  const planStatus = normalizeOrgStatus(orgSettings?.plan_status)
  if (!isOrgPlanActive(planStatus)) {
    return inviteError('billing_inactive', 'Billing is inactive. Activate the organization subscription before sending invitations.', 403, requestId, false)
  }
  const coachLimit = ORG_COACH_LIMITS[orgTier]
  const athleteLimit = ORG_ATHLETE_LIMITS[orgTier]

  if (roles.some((candidate) => candidate === 'coach' || candidate === 'assistant_coach')) {
    if (coachLimit !== null) {
      const { count } = await supabaseAdmin
        .from('organization_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org_id)
        .in('role', ['coach', 'assistant_coach'])
      if ((count || 0) >= coachLimit) {
        return inviteError('coach_limit_reached', `Your ${formatTierName(orgTier)} plan allows up to ${coachLimit} coaches. Upgrade to add more.`, 403, requestId, false)
      }
    }
  }

  if (roles.includes('athlete')) {
    if (athleteLimit !== null) {
      const { count } = await supabaseAdmin
        .from('organization_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org_id)
        .eq('role', 'athlete')
      if ((count || 0) >= athleteLimit) {
        return inviteError('athlete_limit_reached', `Your ${formatTierName(orgTier)} plan allows up to ${athleteLimit} athletes. Upgrade to add more.`, 403, requestId, false)
      }
    }
  }

  const { data: invitedProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', inviteEmail)
    .maybeSingle()

  if (invitedProfile?.id) {
    const { data: existingMembership } = await supabaseAdmin
      .from('organization_memberships')
      .select('id, status')
      .eq('org_id', org_id)
      .eq('user_id', invitedProfile.id)
      .maybeSingle()
    if (existingMembership?.status === 'suspended') {
      return inviteError('member_suspended', 'This user is suspended. Restore access instead.', 409, requestId, false)
    }
    if (existingMembership) {
      return inviteError('already_a_member', 'This user is already in this organization.', 409, requestId, false)
    }
  }

  const inviteToken = createInviteToken()
  const invitePayload = {
    org_id: authoritativeOrg.id,
    organization_name: authoritativeOrg.name,
    workspace_id: workspace.id,
    team_id: team_id || null,
    role,
    roles,
    invited_email: inviteEmail,
    invited_user_id: invitedProfile?.id || null,
    invited_by: user.id,
    status: 'draft',
    invite_token_hash: hashInviteToken(inviteToken),
    token_expires_at: inviteTokenExpiresAt(),
    updated_at: new Date().toISOString(),
  }

  trackServerFlowEvent({
    flow: 'org_invite_create',
    step: 'write',
    status: 'started',
    userId: user.id,
    role: actorRole,
    entityId: org_id,
    metadata: {
      teamId: team_id || null,
      invitedEmail: inviteEmail,
      invitedUserId: invitedProfile?.id || null,
      invitedRole: role,
      invitedRoles: roles,
    },
  })

  const { data: retryableInvite } = await supabaseAdmin.from('org_invites').select('id')
    .eq('org_id', authoritativeOrg.id).eq('workspace_id', workspace.id)
    .ilike('invited_email', inviteEmail).in('status', ['draft', 'failed', 'pending'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const inviteWrite = retryableInvite?.id
    ? supabaseAdmin.from('org_invites').update(invitePayload).eq('id', retryableInvite.id).select('id').single()
    : supabaseAdmin.from('org_invites').insert(invitePayload).select('id').single()
  const { data: inviteRow, error } = await inviteWrite

  if (error || !inviteRow) {
    trackServerFlowFailure(error || new Error('Invite insert returned no row'), {
      flow: 'org_invite_create',
      step: 'invite_insert',
      userId: user.id,
      role: actorRole,
      entityId: org_id,
      metadata: {
        teamId: team_id || null,
        invitedEmail: inviteEmail,
        invitedRole: role,
        invitedRoles: roles,
      },
    })
    return inviteError('invite_create_failed', 'Unable to create the invitation. Please try again.', 500, requestId, true)
  }


  if (isPlatformSuperadmin) {
    try {
      await recordWorkspaceAdminAudit({
        actorId: user.id,
        actorEmail: user.email,
        workspaceId: workspace.id,
        eventType: 'superadmin_org_invite_created',
        recordType: 'org_invite',
        recordId: inviteRow.id,
        previousState: null,
        newState: { org_id, invited_email: inviteEmail, role, roles, team_id: team_id || null },
        reason: 'Invitation initiated through the mobile superadmin portal',
        actingRole: 'superadmin',
      })
    } catch (auditError) {
      trackServerFlowFailure(auditError, {
        flow: 'org_invite_create',
        step: 'superadmin_audit',
        userId: user.id,
        role: actorRole,
        entityId: inviteRow.id,
        metadata: { orgId: org_id, workspaceId: workspace.id },
      })
      await supabaseAdmin.from('org_invites').update({ status: 'failed' }).eq('id', inviteRow.id)
      return inviteError('audit_failed', 'Unable to record the required invitation audit event.', 500, requestId, true)
    }
  }

  if (invitedProfile?.id) {
    const { data: prefsRow } = await supabaseAdmin
      .from('profiles')
      .select('notification_prefs')
      .eq('id', invitedProfile.id)
      .maybeSingle()
    if (isPushEnabled(prefsRow?.notification_prefs, 'messages')) {
      await insertNotifications({
        user_id: invitedProfile.id,
        type: 'org_invite',
        title: 'New team invitation',
        body: 'You have been invited to join an organization.',
        action_url: getInviteDashboardPath(role),
        data: { invite_id: inviteRow.id, org_id, team_id, role, category: 'Messages' },
      })
    }
  }

  const [teamResult, inviterResult] = await Promise.all([
    team_id ? supabaseAdmin.from('org_teams').select('name').eq('id', team_id).maybeSingle() : Promise.resolve({ data: null }),
    supabaseAdmin.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle(),
  ])

  const delivery = await sendOrgInviteEmail({
    toEmail: inviteEmail,
    inviteId: inviteRow.id,
    orgId: authoritativeOrg.id,
    orgName: authoritativeOrg.name,
    teamId: team_id || null,
    teamName: teamResult.data?.name || null,
    role: String(role),
    roles,
    inviterName: inviterResult.data?.full_name || inviterResult.data?.email || user.email || 'Org admin',
    inviteToken,
  })

  await supabaseAdmin.from('org_invites').update({
    status: delivery.status === 'sent' ? 'pending' : 'failed',
    email_delivery_status: delivery.status,
    email_delivery_attempted_at: new Date().toISOString(),
  }).eq('id', inviteRow.id)

  if (delivery.status !== 'sent') {
    return inviteError('email_delivery_failed', 'The invitation was saved but the email could not be sent. It can be retried.', 502, requestId, true)
  }

  const warning =
    delivery.status === 'sent'
      ? null
      : 'Invite created, but email delivery failed. Check Postmark configuration.'

  trackServerFlowEvent({
    flow: 'org_invite_create',
    step: 'write',
    status: 'succeeded',
    userId: user.id,
    role: actorRole,
    entityId: inviteRow.id,
    metadata: {
      orgId: org_id,
      teamId: team_id || null,
      invitedEmail: inviteEmail,
      invitedRole: role,
      invitedRoles: roles,
      inviteDelivery: delivery.status,
    },
  })

  return NextResponse.json({
    id: inviteRow.id,
    invite_delivery: delivery.status,
    warning,
    invite: {
      id: inviteRow.id,
      org_id,
      team_id: team_id || null,
      role,
      roles,
      invited_email: inviteEmail,
      invited_user_id: invitedProfile?.id || null,
      status: 'pending',
    },
  }, { headers: { 'x-request-id': requestId } })
}
