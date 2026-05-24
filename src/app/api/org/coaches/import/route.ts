import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isPushEnabled } from '@/lib/notificationPrefs'
import { getInviteDashboardPath, sendOrgInviteEmail } from '@/lib/inviteDelivery'
import {
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

const VALID_COACH_ROLES = ['coach', 'assistant_coach', 'head_coach']

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) return jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => ({}))
  const { org_id, coaches } = body || {}

  if (!org_id || !Array.isArray(coaches) || coaches.length === 0) {
    return jsonError('org_id and coaches are required')
  }

  if (coaches.length > 200) return jsonError('Maximum 200 coaches per batch')

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

  const normalized = (
    coaches as Array<{
      email?: string
      full_name?: string
      sport?: string
      team_id?: string
      role?: string
    }>
  )
    .map((c) => ({
      email: String(c.email || '').trim().toLowerCase(),
      full_name: String(c.full_name || '').trim(),
      sport: String(c.sport || '').trim(),
      team_id: c.team_id || null,
      role: VALID_COACH_ROLES.includes(String(c.role || '')) ? String(c.role) : 'coach',
    }))
    .filter((c) => c.email && c.email.includes('@') && c.email.includes('.'))

  if (normalized.length === 0) return jsonError('No valid email addresses found')

  const coachLimit = ORG_COACH_LIMITS[orgTier]
  if (coachLimit !== null) {
    const { count } = await supabaseAdmin
      .from('organization_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org_id)
      .in('role', ['coach', 'assistant_coach', 'head_coach'])
    if ((count || 0) + normalized.length > coachLimit) {
      return jsonError(
        `Your ${formatTierName(orgTier)} plan allows up to ${coachLimit} coaches. Upgrade to add more.`,
        403,
      )
    }
  }

  const emails = normalized.map((c) => c.email)

  const [
    { data: existingProfiles },
    { data: existingInviteRows },
    orgResult,
    inviterResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, notification_prefs')
      .in('email', emails),
    supabaseAdmin
      .from('org_invites')
      .select('invited_email')
      .eq('org_id', org_id)
      .in('status', ['pending', 'awaiting_approval'])
      .in('invited_email', emails),
    supabaseAdmin.from('organizations').select('name').eq('id', org_id).maybeSingle(),
    supabaseAdmin.from('profiles').select('full_name, email').eq('id', session.user.id).maybeSingle(),
  ])

  const profileMap = new Map(
    (existingProfiles || []).map((p) => [p.email as string, p as { id: string; email: string; full_name: string | null; notification_prefs: unknown }]),
  )
  const pendingEmailSet = new Set((existingInviteRows || []).map((inv: any) => inv.invited_email as string))
  const orgName = orgResult.data?.name || null
  const inviterName =
    inviterResult.data?.full_name || inviterResult.data?.email || session.user.email || 'Org admin'

  const existingUserIds = Array.from(profileMap.values()).map((p) => p.id)
  const { data: existingMemberships } = existingUserIds.length
    ? await supabaseAdmin
        .from('organization_memberships')
        .select('user_id')
        .eq('org_id', org_id)
        .in('user_id', existingUserIds)
    : { data: [] }

  const membershipSet = new Set((existingMemberships || []).map((m: any) => m.user_id as string))

  const results = {
    sent: 0,
    skipped: 0,
    failed: 0,
    skipped_emails: [] as string[],
    failed_emails: [] as string[],
  }

  await Promise.allSettled(
    normalized.map(async (c) => {
      const existingProfile = profileMap.get(c.email)
      const userId = existingProfile?.id

      if (userId && membershipSet.has(userId)) {
        results.skipped++
        results.skipped_emails.push(c.email)
        return
      }

      if (pendingEmailSet.has(c.email)) {
        results.skipped++
        results.skipped_emails.push(c.email)
        return
      }

      const { data: inviteRow, error } = await supabaseAdmin
        .from('org_invites')
        .insert({
          org_id,
          team_id: c.team_id,
          role: c.role,
          invited_email: c.email,
          invited_user_id: userId || null,
          invited_by: session.user.id,
          status: 'pending',
        })
        .select('id')
        .single()

      if (error || !inviteRow) {
        results.failed++
        results.failed_emails.push(c.email)
        return
      }

      if (userId) {
        // Back-fill name/sport on existing profile if not already set
        const profileUpdates: Record<string, string> = {}
        if (c.full_name && !existingProfile?.full_name) profileUpdates.full_name = c.full_name
        if (c.sport) profileUpdates.sport = c.sport
        if (Object.keys(profileUpdates).length > 0) {
          await supabaseAdmin
            .from('profiles')
            .update(profileUpdates)
            .eq('id', userId)
            .then(() => null, () => null)
        }

        if (isPushEnabled(existingProfile?.notification_prefs, 'messages')) {
          await supabaseAdmin.from('notifications').insert({
            user_id: userId,
            type: 'org_invite',
            title: 'New team invitation',
            body: 'You have been invited to join an organization as a coach.',
            action_url: getInviteDashboardPath(c.role),
            data: {
              invite_id: inviteRow.id,
              org_id,
              team_id: c.team_id,
              role: c.role,
              category: 'Messages',
            },
          })
        }
      }

      await sendOrgInviteEmail({
        toEmail: c.email,
        inviteId: inviteRow.id,
        orgId: org_id,
        orgName,
        teamId: c.team_id,
        teamName: null,
        role: c.role,
        inviterName,
        isNewUser: !userId,
      }).catch(() => null)

      results.sent++
    }),
  )

  return NextResponse.json(results)
}