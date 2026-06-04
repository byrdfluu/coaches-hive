import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { getAdminConfig, setAdminConfig } from '@/lib/adminConfig'
import { buildOperationsSummary, getOperationsConfig } from '@/lib/operations'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

type CountMap = Record<string, number>

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

const asArray = <T = Record<string, unknown>>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : []

const safeCount = async (
  table: string,
  apply?: (query: any) => any,
) => {
  try {
    const baseQuery = supabaseAdmin.from(table).select('id', { count: 'exact', head: true })
    const query = apply ? apply(baseQuery) : baseQuery
    const { count, error } = await query
    if (error) return 0
    return count || 0
  } catch {
    return 0
  }
}

const safeRows = async <T = Record<string, unknown>>(
  table: string,
  columns: string,
  apply?: (query: any) => any,
) => {
  try {
    const baseQuery = supabaseAdmin.from(table).select(columns)
    const query = apply ? apply(baseQuery) : baseQuery
    const { data, error } = await query
    if (error) return [] as T[]
    return (data || []) as T[]
  } catch {
    return [] as T[]
  }
}

const OPEN_VERIFICATION_STATUSES = new Set(['pending', 'submitted', 'needs_review', 'flagged'])
const VIEWABLE_ADMIN_BADGES = new Set([
  '/admin/support',
  '/admin/operations',
  '/admin/uptime',
  '/admin/payouts',
  '/admin/disputes',
  '/admin/orders',
  '/admin/verifications',
  '/admin/reviews',
  '/admin/guardian-approvals',
  '/admin/guardian-links',
  '/admin/waivers',
  '/admin/coaches',
  '/admin/orgs',
  '/admin/automations',
  '/admin/retention',
  '/admin/settings',
])

type AdminBadgeViewsConfig = {
  views?: Record<string, Record<string, { last_seen_at?: string | null; seen_count?: number | null }>>
}

const isAfter = (value: string | null | undefined, threshold: string | null) => {
  if (!threshold) return true
  if (!value) return false
  const parsedValue = Date.parse(value)
  const parsedThreshold = Date.parse(threshold)
  if (!Number.isFinite(parsedValue) || !Number.isFinite(parsedThreshold)) return true
  return parsedValue > parsedThreshold
}

const latestTimestamp = (...values: Array<string | null | undefined>) => {
  let latest: string | null = null
  let latestMs = Number.NEGATIVE_INFINITY
  values.forEach((value) => {
    if (!value) return
    const parsed = Date.parse(value)
    if (!Number.isFinite(parsed)) return
    if (parsed > latestMs) {
      latestMs = parsed
      latest = value
    }
  })
  return latest
}

const countOpenVerificationRows = async (lastSeenAt: string | null) => {
  const [profiles, orgs] = await Promise.all([
    safeRows<{
      id: string
      verification_status?: string | null
      verification_submitted_at?: string | null
      verification_reviewed_at?: string | null
      created_at?: string | null
    }>(
      'profiles',
      'id, verification_status, verification_submitted_at, verification_reviewed_at, created_at',
      (query) => query.in('role', ['coach', 'assistant_coach']).limit(2000),
    ),
    safeRows<{
      id: string
      verification_status?: string | null
      updated_at?: string | null
      created_at?: string | null
    }>(
      'organizations',
      'id, verification_status, updated_at, created_at',
      (query) => query.limit(2000),
    ),
  ])

  const profileCount = profiles.filter((row) => {
    const status = String(row.verification_status || 'pending').toLowerCase()
    const activityAt = latestTimestamp(row.verification_submitted_at, row.verification_reviewed_at, row.created_at)
    return OPEN_VERIFICATION_STATUSES.has(status) && isAfter(activityAt, lastSeenAt)
  }).length
  const orgCount = orgs.filter((row) => {
    const status = String(row.verification_status || 'pending').toLowerCase()
    const activityAt = latestTimestamp(row.updated_at, row.created_at)
    return OPEN_VERIFICATION_STATUSES.has(status) && isAfter(activityAt, lastSeenAt)
  }).length

  return profileCount + orgCount
}

const countWaiverGaps = async () => {
  const waivers = await safeRows<{ id: string }>(
    'org_waivers',
    'id',
    (query) => query.eq('is_active', true).limit(2000),
  )
  if (waivers.length === 0) return 0

  const waiverIds = waivers.map((row) => row.id).filter(Boolean)
  const signatures = await safeRows<{ waiver_id?: string | null }>(
    'waiver_signatures',
    'waiver_id',
    (query) => query.in('waiver_id', waiverIds).limit(5000),
  )
  const signedWaiverIds = new Set(signatures.map((row) => row.waiver_id).filter(Boolean))
  return waiverIds.filter((id) => !signedWaiverIds.has(id)).length
}

const countCoachIssues = async () => {
  const [coachRows, productRows, failedPayouts] = await Promise.all([
    safeRows<{ id: string; verification_status?: string | null; stripe_account_id?: string | null }>(
      'profiles',
      'id, verification_status, stripe_account_id',
      (query) => query.in('role', ['coach', 'assistant_coach']).limit(2000),
    ),
    safeRows<{ coach_id?: string | null; status?: string | null }>(
      'products',
      'coach_id, status',
      (query) => query.not('coach_id', 'is', null).eq('status', 'published').limit(2000),
    ),
    safeCount('coach_payouts', (query) => query.eq('status', 'failed')),
  ])

  const coachById = new Map(coachRows.map((row) => [row.id, row]))
  const coachesWithPublishedProducts = new Set(
    productRows.map((row) => row.coach_id).filter(Boolean) as string[],
  )
  const pendingVerification = coachRows.filter((row) => {
    const status = String(row.verification_status || '').toLowerCase()
    return ['pending', 'submitted', 'needs_review'].includes(status)
  }).length
  const missingStripeWithProducts = Array.from(coachesWithPublishedProducts).filter((coachId) => {
    const coach = coachById.get(coachId)
    return !String(coach?.stripe_account_id || '').trim()
  }).length

  return pendingVerification + missingStripeWithProducts + failedPayouts
}

const countOrgIssues = async () => {
  const [orgRows, orgSettingsRows, orgProducts] = await Promise.all([
    safeRows<{ id: string; status?: string | null; verification_status?: string | null }>(
      'organizations',
      'id, status, verification_status',
      (query) => query.limit(2000),
    ),
    safeRows<{ org_id?: string | null; stripe_account_id?: string | null }>(
      'org_settings',
      'org_id, stripe_account_id',
      (query) => query.limit(2000),
    ),
    safeRows<{ org_id?: string | null; status?: string | null }>(
      'products',
      'org_id, status',
      (query) => query.not('org_id', 'is', null).eq('status', 'published').limit(2000),
    ),
  ])

  const settingsByOrg = new Map(orgSettingsRows.map((row) => [row.org_id, row]))
  const orgsWithPublishedProducts = new Set(orgProducts.map((row) => row.org_id).filter(Boolean) as string[])
  const pendingOrgs = orgRows.filter((row) => {
    const status = String(row.status || '').toLowerCase()
    const verification = String(row.verification_status || '').toLowerCase()
    return status === 'pending' || ['pending', 'submitted', 'needs_review'].includes(verification)
  }).length
  const missingStripeWithProducts = Array.from(orgsWithPublishedProducts).filter((orgId) => {
    const settings = settingsByOrg.get(orgId)
    return !String(settings?.stripe_account_id || '').trim()
  }).length

  return pendingOrgs + missingStripeWithProducts
}

const countAutomationIssues = async () => {
  const config = await getAdminConfig<{
    onboardingFlows?: Array<{ status?: string | null }>
    retentionAutomations?: Array<{ status?: string | null }>
  }>('automations')
  const flows = [
    ...asArray<{ status?: string | null }>(config?.onboardingFlows),
    ...asArray<{ status?: string | null }>(config?.retentionAutomations),
  ]
  return flows.filter((flow) => {
    const status = String(flow.status || 'active').toLowerCase()
    return ['failed', 'paused', 'inactive', 'needs_attention'].includes(status)
  }).length
}

const countRetentionIssues = async () => {
  const [disabledPolicies, backupRows] = await Promise.all([
    safeCount('data_retention_policies', (query) => query.eq('enabled', false)),
    safeRows<{ status?: string | null }>(
      'backup_policies',
      'status',
      (query) => query.order('updated_at', { ascending: false }).limit(1),
    ),
  ])
  const backupStatus = String(backupRows[0]?.status || '').toLowerCase()
  const backupIssue = backupStatus && !['verified', 'active', 'healthy'].includes(backupStatus) ? 1 : 0
  return disabledPolicies + backupIssue
}

const countSettingsIssues = () => {
  const requiredChecks = [
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    Boolean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET),
    Boolean(process.env.POSTMARK_SERVER_TOKEN && process.env.POSTMARK_FROM_EMAIL),
  ]
  return requiredChecks.filter((ok) => !ok).length
}

export async function GET() {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return jsonError('Unauthorized', 401)
  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) return jsonError('Forbidden', 403)

  const [operationsConfig, payoutOps, securityConfig, uptimeConfig, badgeViewsConfig] = await Promise.all([
    getOperationsConfig(),
    getAdminConfig<{
      hold_payout_ids?: string[]
      reconciliation?: { mismatch_count?: number }
    }>('payout_ops'),
    getAdminConfig<{ pending_payout_approvals?: unknown[] }>('security'),
    getAdminConfig<{
      sentry?: { open_issue_count?: number | null }
    }>('uptime'),
    getAdminConfig<AdminBadgeViewsConfig>('notification_badges'),
  ])
  const operationsSummary = buildOperationsSummary(operationsConfig)
  const badgeViews = badgeViewsConfig?.views?.[session.user.id] || {}
  const verificationLastSeenAt = badgeViews['/admin/verifications']?.last_seen_at || null

  const [
    support,
    failedPayouts,
    refundRequests,
    disputedOrders,
    ordersActionRequired,
    verifications,
    reviews,
    guardianApprovals,
    pendingGuardianInvites,
    pendingGuardianLinks,
    waiverGaps,
    coaches,
    orgs,
    automations,
    retention,
  ] = await Promise.all([
    safeCount('support_tickets', (query) => query.in('status', ['open', 'pending'])),
    safeCount('coach_payouts', (query) => query.eq('status', 'failed')),
    safeCount('order_refund_requests', (query) => query.in('status', ['requested', 'pending', 'open'])),
    safeCount('orders', (query) => query.or('status.eq.disputed,refund_status.eq.disputed')),
    safeCount('orders', (query) =>
      query.or('fulfillment_status.eq.unfulfilled,refund_status.eq.requested,refund_status.eq.pending,status.eq.disputed'),
    ),
    countOpenVerificationRows(verificationLastSeenAt),
    safeCount('coach_reviews', (query) => query.eq('status', 'pending')),
    safeCount('guardian_approvals', (query) => query.eq('status', 'pending')),
    safeCount('guardian_invites', (query) => query.eq('status', 'pending')),
    safeCount('guardian_athlete_links', (query) => query.eq('status', 'pending')),
    countWaiverGaps(),
    countCoachIssues(),
    countOrgIssues(),
    countAutomationIssues(),
    countRetentionIssues(),
  ])

  const payoutHoldCount = Array.isArray(payoutOps?.hold_payout_ids) ? payoutOps.hold_payout_ids.length : 0
  const payoutApprovalCount = Array.isArray(securityConfig?.pending_payout_approvals)
    ? securityConfig.pending_payout_approvals.length
    : 0
  const payoutMismatchCount = Number(payoutOps?.reconciliation?.mismatch_count || 0)
  const uptimeSentryOpenIssues = Math.max(0, Number(uptimeConfig?.sentry?.open_issue_count || 0))

  const rawCounts: CountMap = {
    '/admin/support': support,
    '/admin/operations':
      operationsSummary.failed_tasks
      + operationsSummary.dead_letter_tasks
      + operationsSummary.overdue_tasks
      + operationsSummary.controls_needing_attention
      + operationsSummary.lifecycle_needing_attention
      + operationsSummary.open_incidents,
    '/admin/uptime': uptimeSentryOpenIssues + operationsSummary.open_incidents,
    '/admin/payouts': failedPayouts + payoutHoldCount + payoutApprovalCount + payoutMismatchCount,
    '/admin/disputes': refundRequests + disputedOrders,
    '/admin/orders': ordersActionRequired,
    '/admin/verifications': verifications,
    '/admin/reviews': reviews,
    '/admin/guardian-approvals': guardianApprovals,
    '/admin/guardian-links': pendingGuardianInvites + pendingGuardianLinks,
    '/admin/waivers': waiverGaps,
    '/admin/coaches': coaches,
    '/admin/orgs': orgs,
    '/admin/automations': automations,
    '/admin/retention': retention,
    '/admin/settings': countSettingsIssues(),
  }

  const counts = Object.fromEntries(
    Object.entries(rawCounts).map(([href, count]) => {
      const normalizedCount = Math.max(0, Number(count) || 0)
      if (href === '/admin/verifications') {
        return [href, normalizedCount]
      }

      const seenCount = Math.max(0, Number(badgeViews[href]?.seen_count || 0))
      if (badgeViews[href]?.last_seen_at && normalizedCount <= seenCount) {
        return [href, 0]
      }
      if (badgeViews[href]?.last_seen_at && normalizedCount > seenCount) {
        return [href, normalizedCount - seenCount]
      }
      return [href, normalizedCount]
    }),
  ) as CountMap

  const total = Object.values(counts).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0)
  return NextResponse.json({ counts, total, generated_at: new Date().toISOString() })
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return jsonError('Unauthorized', 401)
  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) return jsonError('Forbidden', 403)

  const payload = await request.json().catch(() => ({}))
  const href = String(payload?.href || '').trim()
  if (!VIEWABLE_ADMIN_BADGES.has(href)) {
    return jsonError('Unsupported notification badge')
  }
  const seenCount = Math.max(0, Math.floor(Number(payload?.count || 0)))

  const current = (await getAdminConfig<AdminBadgeViewsConfig>('notification_badges')) || {}
  const views = current.views || {}
  const userViews = views[session.user.id] || {}
  const lastSeenAt = new Date().toISOString()

  await setAdminConfig('notification_badges', {
    ...current,
    views: {
      ...views,
      [session.user.id]: {
        ...userViews,
        [href]: { last_seen_at: lastSeenAt, seen_count: seenCount },
      },
    },
  })

  return NextResponse.json({
    ok: true,
    href,
    last_seen_at: lastSeenAt,
    seen_count: seenCount,
  })
}
