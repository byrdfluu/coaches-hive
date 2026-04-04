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

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
] as const

const COACH_ROLES = ['coach', 'assistant_coach', 'head_coach']

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) return jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => ({}))
  const { org_id, invites, default_role = 'athlete' } = body || {}

  if (!org_id || !Array.isArray(invites) || invites.length === 0) {
    return jsonError('org_id and invites are required')
  }

  if (invites.length > 200) {
    return jsonError('Maximum 200 invites per batch')
  }

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role, status')
    .eq('org_id', org_id)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (
    !membership ||
    membership.status === 'suspended' ||
    !ADMIN_ROLES.includes(membership.role as (typeof ADMIN_ROLES)[number])
  ) {
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

  // Normalize and validate rows
  const normalizedInvites = (invites as Array<{ email?: string; role?: string; team_id?: string }>)
    .map((inv) => ({
      email: String(inv.email || '').trim().toLowerCase(),
      role: String(inv.role || default_role).trim() || default_role,
      team_id: inv.team_id || null,
    }))
    .filter((inv) => inv.email && inv.email.includes('@') && inv.email.includes('.'))

  if (normalizedInvites.length === 0) {
    return jsonError('No valid email addresses found')
  }

  const coachCount = normalizedInvites.filter((inv) => COACH_ROLES.includes(inv.role)).length
  const athleteCount = normalizedInvites.filter((inv) => inv.role === 'athlete').length
  const coachLimit = ORG_COACH_LIMITS[orgTier]
  const athleteLimit = ORG_ATHLETE_LIMITS[orgTier]

  if (coachCount > 0 && coachLimit !== null) {
    const { count } = await supabaseAdmin
      .from('organization_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org_id)
      .in('role', ['coach', 'assistant_coach'])
    if ((count || 0) + coachCount > coachLimit) {
      return jsonError(
        `Your ${formatTierName(orgTier)} plan allows up to ${coachLimit} coaches. Upgrade to add more.`,
        403,
      )
    }
  }

  if (athleteCount > 0 && athleteLimit !== null) {
    const { count } = await supabaseAdmin
      .from('organization_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org_id)
      .eq('role', 'athlete')
    if ((count || 0) + athleteCount > athleteLimit) {
      return jsonError(
        `Your ${formatTierName(orgTier)} plan allows up to ${athleteLimit} athletes. Upgrade to add more.`,
        403,
      )
    }
  }

  const emails = normalizedInvites.map((inv) => inv.email)

  // Batch load existing profiles, memberships, and pending invites
  const [
    { data: existingProfiles },
    { data: existingInviteRows },
    orgResult,
    inviterResult,
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, email').in('email', emails),
    supabaseAdmin
      .from('org_invites')
      .select('invited_email')
      .eq('org_id', org_id)
      .in('status', ['pending', 'awaiting_approval'])
      .in('invited_email', emails),
    supabaseAdmin.from('organizations').select('name').eq('id', org_id).maybeSingle(),
    supabaseAdmin.from('profiles').select('full_name, email').eq('id', session.user.id).maybeSingle(),
  ])

  const profileMap = new Map((existingProfiles || []).map((p) => [p.email, p.id as string]))
  const pendingEmailSet = new Set((existingInviteRows || []).map((inv) => inv.invited_email))
  const orgName = orgResult.data?.name || null
  const inviterName =
    inviterResult.data?.full_name || inviterResult.data?.email || session.user.email || 'Org admin'

  const existingUserIds = Array.from(profileMap.values())
  const { data: existingMemberships } = existingUserIds.length
    ? await supabaseAdmin
        .from('organization_memberships')
        .select('user_id, status')
        .eq('org_id', org_id)
        .in('user_id', existingUserIds)
    : { data: [] }

  const membershipSet = new Set((existingMemberships || []).map((m) => m.user_id))

  const results = {
    sent: 0,
    skipped: 0,
    failed: 0,
    skipped_emails: [] as string[],
    failed_emails: [] as string[],
  }

  await Promise.allSettled(
    normalizedInvites.map(async (inv) => {
      const userId = profileMap.get(inv.email)

      if (userId && membershipSet.has(userId)) {
        results.skipped++
        results.skipped_emails.push(inv.email)
        return
      }

      if (pendingEmailSet.has(inv.email)) {
        results.skipped++
        results.skipped_emails.push(inv.email)
        return
      }

      const { data: inviteRow, error } = await supabaseAdmin
        .from('org_invites')
        .insert({
          org_id,
          team_id: inv.team_id,
          role: inv.role,
          invited_email: inv.email,
          invited_user_id: userId || null,
          invited_by: session.user.id,
          status: 'pending',
        })
        .select('id')
        .single()

      if (error || !inviteRow) {
        results.failed++
        results.failed_emails.push(inv.email)
        return
      }

      if (userId) {
        const { data: prefsRow } = await supabaseAdmin
          .from('profiles')
          .select('notification_prefs')
          .eq('id', userId)
          .maybeSingle()
        if (isPushEnabled(prefsRow?.notification_prefs, 'messages')) {
          await supabaseAdmin
            .from('notifications')
            .insert({
              user_id: userId,
              type: 'org_invite',
              title: 'New team invitation',
              body: 'You have been invited to join an organization.',
              action_url: getInviteDashboardPath(inv.role),
              data: {
                invite_id: inviteRow.id,
                org_id,
                team_id: inv.team_id,
                role: inv.role,
                category: 'Messages',
              },
            })
        }
      }

      await sendOrgInviteEmail({
        toEmail: inv.email,
        inviteId: inviteRow.id,
        orgId: org_id,
        orgName,
        teamId: inv.team_id,
        teamName: null,
        role: inv.role,
        inviterName,
        isNewUser: !userId,
      }).catch(() => null)

      results.sent++
    }),
  )

  return NextResponse.json(results)
}
