import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { isActiveCoachProductStatus } from '@/lib/coachMarketplaceStatus'

export const dynamic = 'force-dynamic'

const COACH_ROLES = new Set(['coach', 'assistant_coach'])

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireAdmin = async () => {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { error: jsonError('Unauthorized', 401), session: null as any }
  }

  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) {
    return { error: jsonError('Forbidden', 403), session: null as any }
  }

  return { error: null, session }
}

const toMoney = (value: unknown) => {
  const amount = Number(value ?? NaN)
  return Number.isFinite(amount) ? amount : 0
}

const getMissingOrdersColumn = (message?: string | null) => {
  const value = String(message || '')
  const schemaCacheMatch = value.match(/could not find the '([^']+)' column of 'orders' in the schema cache/i)
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1]

  const postgresMatch =
    value.match(/column\s+["']?orders["']?\.["']?([a-z_]+)["']?\s+does not exist/i)
    || value.match(/column\s+["']?([a-z_]+)["']?\s+of relation\s+["']?orders["']?\s+does not exist/i)
  return postgresMatch?.[1] || null
}

const loadOrdersByCoachIdsCompat = async (coachIds: string[]) => {
  let selectColumns = [
    'id',
    'coach_id',
    'athlete_id',
    'org_id',
    'product_id',
    'amount',
    'total',
    'price',
    'status',
    'refund_status',
    'created_at',
  ]
  let lastResult: any = { data: [], error: null }

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const result = await supabaseAdmin
      .from('orders')
      .select(selectColumns.join(', '))
      .in('coach_id', coachIds)
      .limit(20000)

    lastResult = result
    const missingColumn = getMissingOrdersColumn(result.error?.message)
    if (!result.error || !missingColumn) {
      return result
    }

    selectColumns = selectColumns.filter((column) => column !== missingColumn)
  }

  return lastResult
}

const listAllAuthUsers = async () => {
  const users: Array<any> = []

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) {
      return { users: [], error }
    }

    const pageUsers = data.users || []
    users.push(...pageUsers)
    if (pageUsers.length < 200) break
  }

  return { users, error: null as any }
}

const normalizeVerificationStatus = (value?: string | null) => {
  const status = String(value || '').trim().toLowerCase()
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  if (status === 'pending') return 'Pending'
  return 'Not submitted'
}

const formatCoachTier = (value?: string | null) => {
  const tier = String(value || '').trim().toLowerCase()
  if (!tier) return 'No plan'
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

const resolveCoachPlanTier = ({
  rowTier,
  profileTier,
}: {
  rowTier?: string | null
  profileTier?: string | null
}) => String(rowTier || profileTier || '').trim() || null

type ReceiptRecord = {
  id: string
  order_id?: string | null
  payee_id?: string | null
  amount?: number | string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
}

type OrderRecord = {
  id: string
  coach_id?: string | null
  athlete_id?: string | null
  org_id?: string | null
  product_id?: string | null
  amount?: number | string | null
  total?: number | string | null
  price?: number | string | null
  status?: string | null
  refund_status?: string | null
  created_at?: string | null
}

type PayoutRecord = {
  id: string
  coach_id?: string | null
  amount?: number | string | null
  status?: string | null
  created_at?: string | null
  paid_at?: string | null
  scheduled_for?: string | null
}

const normalizeHeardFrom = (value?: string | null) => {
  const raw = String(value || '').trim()
  return raw || 'Not captured'
}

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const { users: authUsers, error: authError } = await listAllAuthUsers()
  if (authError) {
    return jsonError(authError.message, 500)
  }

  const coachAuthUsers = authUsers.filter((user) => {
    const role = String(user.user_metadata?.role || '').trim().toLowerCase()
    return COACH_ROLES.has(role)
  })

  const { data: coachProfiles, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, role, full_name, email, created_at, verification_status, verification_submitted_at, stripe_account_id, bank_last4, heard_from, plan_tier, subscription_status',
    )
    .in('role', Array.from(COACH_ROLES))
    .order('created_at', { ascending: false })
    .limit(2000)

  if (profileError) {
    return jsonError(profileError.message, 500)
  }

  const profileMap = new Map(
    ((coachProfiles || []) as Array<Record<string, any>>).map((profile) => [String(profile.id), profile]),
  )

  const coachIds = Array.from(
    new Set([
      ...coachAuthUsers.map((user) => String(user.id)),
      ...((coachProfiles || []) as Array<Record<string, any>>).map((profile) => String(profile.id)),
    ]),
  )

  const [
    plansResult,
    membershipsResult,
    linksResult,
    productsResult,
    sessionsResult,
    sessionPaymentsResult,
    participantResult,
    payoutsResult,
    reviewsResult,
    receiptsResult,
    ordersResult,
  ] = await Promise.all([
    coachIds.length
      ? supabaseAdmin.from('coach_plans').select('coach_id, tier').in('coach_id', coachIds)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? supabaseAdmin.from('organization_memberships').select('user_id, org_id').in('user_id', coachIds)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? supabaseAdmin
          .from('coach_athlete_links')
          .select('coach_id, athlete_id, status')
          .in('coach_id', coachIds)
          .eq('status', 'active')
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? supabaseAdmin.from('products').select('coach_id, status').in('coach_id', coachIds)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? supabaseAdmin
          .from('sessions')
          .select('coach_id, start_time')
          .in('coach_id', coachIds)
          .limit(20000)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? supabaseAdmin
          .from('session_payments')
          .select('coach_id, amount, status, paid_at, created_at')
          .in('coach_id', coachIds)
          .limit(20000)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? supabaseAdmin
          .from('thread_participants')
          .select('thread_id, user_id')
          .in('user_id', coachIds)
          .limit(20000)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? supabaseAdmin
          .from('coach_payouts')
          .select('id, coach_id, amount, status, created_at, paid_at, scheduled_for')
          .in('coach_id', coachIds)
          .limit(10000)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? supabaseAdmin
          .from('coach_reviews')
          .select('coach_id, rating, created_at')
          .in('coach_id', coachIds)
          .limit(20000)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? supabaseAdmin
          .from('payment_receipts')
          .select('id, order_id, payee_id, amount, status, metadata, created_at')
          .in('payee_id', coachIds)
          .not('order_id', 'is', null)
          .limit(20000)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? loadOrdersByCoachIdsCompat(coachIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const queryErrors = [
    plansResult.error,
    membershipsResult.error,
    linksResult.error,
    productsResult.error,
    sessionsResult.error,
    sessionPaymentsResult.error,
    participantResult.error,
    payoutsResult.error,
    reviewsResult.error,
    receiptsResult.error,
    ordersResult.error,
  ].filter(Boolean)

  if (queryErrors.length > 0) {
    return jsonError(String(queryErrors[0]?.message || 'Unable to load coaches.'), 500)
  }

  const planMap = new Map(
    ((plansResult.data || []) as Array<{ coach_id: string; tier?: string | null }>).map((row) => [
      row.coach_id,
      row.tier || null,
    ]),
  )

  const orgCountByCoach = new Map<string, Set<string>>()
  ;((membershipsResult.data || []) as Array<{ user_id?: string | null; org_id?: string | null }>).forEach((row) => {
    if (!row.user_id || !row.org_id) return
    const set = orgCountByCoach.get(row.user_id) || new Set<string>()
    set.add(row.org_id)
    orgCountByCoach.set(row.user_id, set)
  })

  const athleteCountByCoach = new Map<string, Set<string>>()
  ;((linksResult.data || []) as Array<{ coach_id?: string | null; athlete_id?: string | null }>).forEach((row) => {
    if (!row.coach_id || !row.athlete_id) return
    const set = athleteCountByCoach.get(row.coach_id) || new Set<string>()
    set.add(row.athlete_id)
    athleteCountByCoach.set(row.coach_id, set)
  })

  const activeListingsByCoach = new Map<string, number>()
  ;((productsResult.data || []) as Array<{ coach_id?: string | null; status?: string | null }>).forEach((row) => {
    if (!row.coach_id || !isActiveCoachProductStatus(row.status)) return
    activeListingsByCoach.set(row.coach_id, (activeListingsByCoach.get(row.coach_id) || 0) + 1)
  })

  const sessionsByCoach = new Map<string, Array<{ start_time?: string | null }>>()
  ;((sessionsResult.data || []) as Array<{ coach_id?: string | null; start_time?: string | null }>).forEach((row) => {
    if (!row.coach_id) return
    const existing = sessionsByCoach.get(row.coach_id) || []
    existing.push({ start_time: row.start_time || null })
    sessionsByCoach.set(row.coach_id, existing)
  })

  const sessionRevenueByCoach = new Map<string, number>()
  ;((sessionPaymentsResult.data || []) as Array<{ coach_id?: string | null; amount?: number | string | null; status?: string | null }>).forEach((row) => {
    if (!row.coach_id) return
    if (String(row.status || '').toLowerCase() !== 'paid') return
    sessionRevenueByCoach.set(row.coach_id, (sessionRevenueByCoach.get(row.coach_id) || 0) + toMoney(row.amount))
  })

  const coachIdsByThread = new Map<string, string[]>()
  ;((participantResult.data || []) as Array<{ thread_id?: string | null; user_id?: string | null }>).forEach((row) => {
    if (!row.thread_id || !row.user_id) return
    const existing = coachIdsByThread.get(row.thread_id) || []
    existing.push(row.user_id)
    coachIdsByThread.set(row.thread_id, existing)
  })

  const threadIds = Array.from(coachIdsByThread.keys())
  const messagesResult = threadIds.length
    ? await supabaseAdmin
        .from('messages')
        .select('thread_id, created_at')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: false })
        .limit(20000)
    : { data: [], error: null }

  if (messagesResult.error) {
    return jsonError(messagesResult.error.message, 500)
  }

  const lastMessageAtByCoach = new Map<string, string>()
  ;((messagesResult.data || []) as Array<{ thread_id?: string | null; created_at?: string | null }>).forEach((row) => {
    const createdAt = row.created_at || null
    if (!row.thread_id || !createdAt) return
    const coachesForThread = coachIdsByThread.get(row.thread_id) || []
    coachesForThread.forEach((coachId) => {
      const existing = lastMessageAtByCoach.get(coachId)
      if (!existing || new Date(createdAt).getTime() > new Date(existing).getTime()) {
        lastMessageAtByCoach.set(coachId, createdAt)
      }
    })
  })

  const payoutStatsByCoach = new Map<string, {
    total_count: number
    paid_count: number
    scheduled_count: number
    failed_count: number
    total_paid: number
    last_paid_at?: string | null
  }>()
  ;((payoutsResult.data || []) as PayoutRecord[]).forEach((row) => {
    if (!row.coach_id) return
    const existing = payoutStatsByCoach.get(row.coach_id) || {
      total_count: 0,
      paid_count: 0,
      scheduled_count: 0,
      failed_count: 0,
      total_paid: 0,
      last_paid_at: null,
    }
    const status = String(row.status || '').toLowerCase()
    existing.total_count += 1
    if (status === 'paid') {
      existing.paid_count += 1
      existing.total_paid += toMoney(row.amount)
      if (!existing.last_paid_at || new Date(String(row.paid_at || row.created_at || '')).getTime() > new Date(String(existing.last_paid_at)).getTime()) {
        existing.last_paid_at = row.paid_at || row.created_at || null
      }
    } else if (status === 'failed') {
      existing.failed_count += 1
    } else {
      existing.scheduled_count += 1
    }
    payoutStatsByCoach.set(row.coach_id, existing)
  })

  const reviewStatsByCoach = new Map<string, { count: number; average_rating: number }>()
  ;((reviewsResult.data || []) as Array<{ coach_id?: string | null; rating?: number | string | null }>).forEach((row) => {
    if (!row.coach_id) return
    const rating = Number(row.rating ?? NaN)
    if (!Number.isFinite(rating)) return
    const existing = reviewStatsByCoach.get(row.coach_id) || { count: 0, average_rating: 0 }
    const nextCount = existing.count + 1
    existing.average_rating = ((existing.average_rating * existing.count) + rating) / nextCount
    existing.count = nextCount
    reviewStatsByCoach.set(row.coach_id, existing)
  })

  const marketplaceRevenueByCoach = new Map<string, number>()
  const marketplaceSalesCountByCoach = new Map<string, number>()
  const lastMarketplaceSaleAtByCoach = new Map<string, string>()
  ;((receiptsResult.data || []) as ReceiptRecord[]).forEach((row) => {
    if (!row.payee_id) return
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : null
    const source = String(metadata?.source || '').toLowerCase()
    if (source && source !== 'marketplace') return
    marketplaceRevenueByCoach.set(row.payee_id, (marketplaceRevenueByCoach.get(row.payee_id) || 0) + toMoney(row.amount))
    marketplaceSalesCountByCoach.set(row.payee_id, (marketplaceSalesCountByCoach.get(row.payee_id) || 0) + 1)
    if (row.created_at) {
      const existing = lastMarketplaceSaleAtByCoach.get(row.payee_id)
      if (!existing || new Date(row.created_at).getTime() > new Date(existing).getTime()) {
        lastMarketplaceSaleAtByCoach.set(row.payee_id, row.created_at)
      }
    }
  })

  const orderRows = ((ordersResult.data || []) as unknown as OrderRecord[])
  const coachDisputes = orderRows
    .filter((row) => {
      const status = String(row.status || '').toLowerCase()
      const refundStatus = String(row.refund_status || '').toLowerCase()
      return status.includes('disput') || refundStatus === 'refunded' || refundStatus === 'disputed'
    })
    .map((row) => ({
      case_id: String(row.id),
      coach_id: String(row.coach_id || ''),
      amount: toMoney(row.amount ?? row.total ?? row.price),
      status: String(row.refund_status || row.status || 'issue'),
      created_at: row.created_at || null,
    }))

  const orgIds = Array.from(new Set(
    ((membershipsResult.data || []) as Array<{ org_id?: string | null }>).map((row) => row.org_id).filter(Boolean) as string[],
  ))
  const { data: orgRows, error: orgError } = orgIds.length
    ? await supabaseAdmin
        .from('org_settings')
        .select('org_id, org_name')
        .in('org_id', orgIds)
    : { data: [], error: null }

  if (orgError) {
    return jsonError(orgError.message, 500)
  }

  const orgNameMap = new Map(
    ((orgRows || []) as Array<{ org_id: string; org_name?: string | null }>).map((row) => [
      row.org_id,
      row.org_name || 'Organization',
    ]),
  )

  const orgNamesByCoach = new Map<string, string[]>()
  ;((membershipsResult.data || []) as Array<{ user_id?: string | null; org_id?: string | null }>).forEach((row) => {
    if (!row.user_id || !row.org_id) return
    const orgName = orgNameMap.get(row.org_id) || 'Organization'
    const existing = new Set(orgNamesByCoach.get(row.user_id) || [])
    existing.add(orgName)
    orgNamesByCoach.set(row.user_id, Array.from(existing).sort((a, b) => a.localeCompare(b)))
  })

  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()

  const rows = coachIds
    .map((coachId) => {
      const authUser = coachAuthUsers.find((user) => String(user.id) === coachId) || null
      const profile = profileMap.get(coachId) || null
      const role = String(profile?.role || authUser?.user_metadata?.role || 'coach').toLowerCase()
      const sessions = sessionsByCoach.get(coachId) || []
      const sessionsThisMonth = sessions.filter((session) => {
        const date = session.start_time ? new Date(session.start_time) : null
        return Boolean(date && !Number.isNaN(date.getTime()) && date.getMonth() === month && date.getFullYear() === year)
      }).length
      const lastSessionAt = sessions
        .map((session) => session.start_time)
        .filter(Boolean)
        .sort((a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime())[0] || null
      const sessionRevenue = Math.round((sessionRevenueByCoach.get(coachId) || 0) * 100) / 100
      const marketplaceRevenue = Math.round((marketplaceRevenueByCoach.get(coachId) || 0) * 100) / 100
      const name =
        String(profile?.full_name || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || profile?.email || authUser?.email || 'Coach').trim()
      const email = String(profile?.email || authUser?.email || '').trim()
      const payoutStats = payoutStatsByCoach.get(coachId) || {
        total_count: 0,
        paid_count: 0,
        scheduled_count: 0,
        failed_count: 0,
        total_paid: 0,
        last_paid_at: null,
      }
      const reviewStats = reviewStatsByCoach.get(coachId) || { count: 0, average_rating: 0 }
      const orgNames = orgNamesByCoach.get(coachId) || []

      return {
        id: coachId,
        name,
        email,
        heard_from: normalizeHeardFrom(profile?.heard_from),
        role,
        status: authUser?.user_metadata?.suspended ? 'Suspended' : 'Active',
        created_at: profile?.created_at || null,
        verification_status: normalizeVerificationStatus(profile?.verification_status),
        verification_submitted_at: profile?.verification_submitted_at || null,
        plan_tier: formatCoachTier(
          resolveCoachPlanTier({
            rowTier: planMap.get(coachId),
            profileTier: profile?.plan_tier,
          }),
        ),
        stripe_connected: Boolean(String(profile?.stripe_account_id || '').trim()),
        bank_last4: String(profile?.bank_last4 || '').trim() || null,
        athlete_count: (athleteCountByCoach.get(coachId) || new Set()).size,
        org_count: (orgCountByCoach.get(coachId) || new Set()).size,
        org_names: orgNames,
        active_listings: activeListingsByCoach.get(coachId) || 0,
        sessions: {
          total: sessions.length,
          this_month: sessionsThisMonth,
          last_session_at: lastSessionAt,
        },
        revenue: {
          session_gross: sessionRevenue,
          marketplace_gross: marketplaceRevenue,
          total_gross: Math.round((sessionRevenue + marketplaceRevenue) * 100) / 100,
        },
        marketplace: {
          sales_count: marketplaceSalesCountByCoach.get(coachId) || 0,
          last_sale_at: lastMarketplaceSaleAtByCoach.get(coachId) || null,
        },
        reviews: {
          count: reviewStats.count,
          average_rating: reviewStats.count > 0 ? Math.round(reviewStats.average_rating * 10) / 10 : 0,
        },
        messaging: {
          last_message_at: lastMessageAtByCoach.get(coachId) || null,
        },
        payouts: {
          total_count: payoutStats.total_count,
          failed_count: payoutStats.failed_count,
          paid_count: payoutStats.paid_count,
          scheduled_count: payoutStats.scheduled_count,
          total_paid: Math.round(payoutStats.total_paid * 100) / 100,
          last_paid_at: payoutStats.last_paid_at || null,
        },
      }
    })
    .filter((row) => COACH_ROLES.has(row.role))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))

  return NextResponse.json({
    coaches: rows,
    disputes: coachDisputes,
    payout_issues: rows.flatMap((coach) => {
      const items: Array<{ coach_id: string; issue: string; action: string }> = []
      if (!coach.stripe_connected) {
        items.push({ coach_id: coach.id, issue: 'Stripe not connected', action: 'Open payouts' })
      }
      if (coach.payouts.scheduled_count > 0 && !coach.stripe_connected) {
        items.push({ coach_id: coach.id, issue: `${coach.payouts.scheduled_count} payout${coach.payouts.scheduled_count === 1 ? '' : 's'} blocked by Stripe setup`, action: 'Open payouts' })
      }
      if (coach.payouts.failed_count > 0) {
        items.push({ coach_id: coach.id, issue: `${coach.payouts.failed_count} failed payout${coach.payouts.failed_count === 1 ? '' : 's'}`, action: 'Open payouts' })
      }
      return items
    }),
  })
}
