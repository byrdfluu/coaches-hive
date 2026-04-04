import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
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
] as const

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
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
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    trackServerFlowEvent({
      flow: 'org_invite_create',
      step: 'auth',
      status: 'failed',
      metadata: { reason: 'unauthorized' },
    })
    return jsonError('Unauthorized', 401)
  }

  const body = await request.json().catch(() => ({}))
  const { org_id, team_id, role, invited_email } = body || {}
  const inviteEmail = String(invited_email || '').trim().toLowerCase()

  if (!org_id || !role || !inviteEmail) {
    trackServerFlowEvent({
      flow: 'org_invite_create',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      metadata: { reason: 'missing_required_fields' },
    })
    return jsonError('org_id, role, and invited_email are required')
  }

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role, status')
    .eq('org_id', org_id)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!membership || membership.status === 'suspended' || !ADMIN_ROLES.includes(membership.role as (typeof ADMIN_ROLES)[number])) {
    trackServerFlowEvent({
      flow: 'org_invite_create',
      step: 'role_check',
      status: 'failed',
      userId: session.user.id,
      entityId: org_id,
      metadata: { reason: 'forbidden' },
    })
    return jsonError('Forbidden', 403)
  }

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('plan, plan_status')
    .eq('org_id', org_id)
    .maybeSingle()

  const orgTier = normalizeOrgTier(orgSettings?.plan)
  const planStatus = normalizeOrgStatus(orgSettings?.plan_status)
  if (!isOrgPlanActive(planStatus)) {
    return jsonError('Billing inactive. Activate your subscription to send invites.', 403)
  }
  const coachLimit = ORG_COACH_LIMITS[orgTier]
  const athleteLimit = ORG_ATHLETE_LIMITS[orgTier]

  if (role === 'coach' || role === 'assistant_coach') {
    if (coachLimit !== null) {
      const { count } = await supabaseAdmin
        .from('organization_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org_id)
        .in('role', ['coach', 'assistant_coach'])
      if ((count || 0) >= coachLimit) {
        return jsonError(`Your ${formatTierName(orgTier)} plan allows up to ${coachLimit} coaches. Upgrade to add more.`, 403)
      }
    }
  }

  if (role === 'athlete') {
    if (athleteLimit !== null) {
      const { count } = await supabaseAdmin
        .from('organization_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org_id)
        .eq('role', 'athlete')
      if ((count || 0) >= athleteLimit) {
        return jsonError(`Your ${formatTierName(orgTier)} plan allows up to ${athleteLimit} athletes. Upgrade to add more.`, 403)
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
      return jsonError('User is suspended. Restore access instead.', 409)
    }
    if (existingMembership) {
      return jsonError('User is already in this organization.', 409)
    }
  }

  const invitePayload = {
    org_id,
    team_id: team_id || null,
    role,
    invited_email: inviteEmail,
    invited_user_id: invitedProfile?.id || null,
    invited_by: session.user.id,
    status: 'pending',
  }

  trackServerFlowEvent({
    flow: 'org_invite_create',
    step: 'write',
    status: 'started',
    userId: session.user.id,
    role: membership.role,
    entityId: org_id,
    metadata: {
      teamId: team_id || null,
      invitedEmail: inviteEmail,
      invitedUserId: invitedProfile?.id || null,
      invitedRole: role,
    },
  })

  const { data: inviteRow, error } = await supabaseAdmin
    .from('org_invites')
    .insert(invitePayload)
    .select('id')
    .single()

  if (error || !inviteRow) {
    trackServerFlowFailure(error || new Error('Invite insert returned no row'), {
      flow: 'org_invite_create',
      step: 'invite_insert',
      userId: session.user.id,
      role: membership.role,
      entityId: org_id,
      metadata: {
        teamId: team_id || null,
        invitedEmail: inviteEmail,
        invitedRole: role,
      },
    })
    return jsonError(error?.message || 'Unable to create invite', 500)
  }

  if (invitedProfile?.id) {
    const { data: prefsRow } = await supabaseAdmin
      .from('profiles')
      .select('notification_prefs')
      .eq('id', invitedProfile.id)
      .maybeSingle()
    if (isPushEnabled(prefsRow?.notification_prefs, 'messages')) {
      await supabaseAdmin.from('notifications').insert({
        user_id: invitedProfile.id,
        type: 'org_invite',
        title: 'New team invitation',
        body: 'You have been invited to join an organization.',
        action_url: getInviteDashboardPath(role),
        data: { invite_id: inviteRow.id, org_id, team_id, role, category: 'Messages' },
      })
    }
  }

  const [orgResult, teamResult, inviterResult] = await Promise.all([
    supabaseAdmin.from('organizations').select('name').eq('id', org_id).maybeSingle(),
    team_id ? supabaseAdmin.from('org_teams').select('name').eq('id', team_id).maybeSingle() : Promise.resolve({ data: null }),
    supabaseAdmin.from('profiles').select('full_name, email').eq('id', session.user.id).maybeSingle(),
  ])

  const delivery = await sendOrgInviteEmail({
    toEmail: inviteEmail,
    inviteId: inviteRow.id,
    orgId: org_id,
    orgName: orgResult.data?.name || null,
    teamId: team_id || null,
    teamName: teamResult.data?.name || null,
    role: String(role),
    inviterName: inviterResult.data?.full_name || inviterResult.data?.email || session.user.email || 'Org admin',
    isNewUser: !invitedProfile?.id,
  })

  const warning =
    delivery.status === 'sent'
      ? null
      : 'Invite created, but email delivery failed. Check Postmark configuration.'

  trackServerFlowEvent({
    flow: 'org_invite_create',
    step: 'write',
    status: 'succeeded',
    userId: session.user.id,
    role: membership.role,
    entityId: inviteRow.id,
    metadata: {
      orgId: org_id,
      teamId: team_id || null,
      invitedEmail: inviteEmail,
      invitedRole: role,
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
      invited_email: inviteEmail,
      invited_user_id: invitedProfile?.id || null,
      status: 'pending',
    },
  })
}
