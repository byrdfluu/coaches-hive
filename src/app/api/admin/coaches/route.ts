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
      'id, role, full_name, email, created_at, verification_status, verification_submitted_at, stripe_account_id, bank_last4',
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
    messagesResult,
    payoutsResult,
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
          .from('messages')
          .select('sender_id, created_at')
          .in('sender_id', coachIds)
          .order('created_at', { ascending: false })
          .limit(20000)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? supabaseAdmin
          .from('coach_payouts')
          .select('id, coach_id, amount, status, created_at')
          .in('coach_id', coachIds)
          .eq('status', 'failed')
          .limit(5000)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? supabaseAdmin
          .from('orders')
          .select('id, coach_id, amount, total, price, status, refund_status, created_at')
          .in('coach_id', coachIds)
          .limit(20000)
      : Promise.resolve({ data: [], error: null }),
  ])

  const queryErrors = [
    plansResult.error,
    membershipsResult.error,
    linksResult.error,
    productsResult.error,
    sessionsResult.error,
    sessionPaymentsResult.error,
    messagesResult.error,
    payoutsResult.error,
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

  const lastMessageAtByCoach = new Map<string, string>()
  ;((messagesResult.data || []) as Array<{ sender_id?: string | null; created_at?: string | null }>).forEach((row) => {
    if (!row.sender_id || !row.created_at) return
    if (!lastMessageAtByCoach.has(row.sender_id)) {
      lastMessageAtByCoach.set(row.sender_id, row.created_at)
    }
  })

  const failedPayoutsByCoach = new Map<string, Array<{ id: string; amount: number; created_at?: string | null }>>()
  ;((payoutsResult.data || []) as Array<{ id: string; coach_id?: string | null; amount?: number | string | null; created_at?: string | null }>).forEach((row) => {
    if (!row.coach_id) return
    const existing = failedPayoutsByCoach.get(row.coach_id) || []
    existing.push({
      id: row.id,
      amount: toMoney(row.amount),
      created_at: row.created_at || null,
    })
    failedPayoutsByCoach.set(row.coach_id, existing)
  })

  const coachDisputes = ((ordersResult.data || []) as Array<Record<string, any>>)
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

  const marketplaceRevenueByCoach = new Map<string, number>()
  ;((ordersResult.data || []) as Array<Record<string, any>>).forEach((row) => {
    if (!row.coach_id) return
    const status = String(row.status || '').toLowerCase()
    if (status === 'failed') return
    marketplaceRevenueByCoach.set(
      row.coach_id,
      (marketplaceRevenueByCoach.get(row.coach_id) || 0) + toMoney(row.amount ?? row.total ?? row.price),
    )
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
      const failedPayouts = failedPayoutsByCoach.get(coachId) || []

      return {
        id: coachId,
        name,
        email,
        role,
        status: authUser?.user_metadata?.suspended ? 'Suspended' : 'Active',
        created_at: profile?.created_at || null,
        verification_status: normalizeVerificationStatus(profile?.verification_status),
        verification_submitted_at: profile?.verification_submitted_at || null,
        plan_tier: formatCoachTier(planMap.get(coachId)),
        stripe_connected: Boolean(String(profile?.stripe_account_id || '').trim()),
        bank_last4: String(profile?.bank_last4 || '').trim() || null,
        athlete_count: (athleteCountByCoach.get(coachId) || new Set()).size,
        org_count: (orgCountByCoach.get(coachId) || new Set()).size,
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
        messaging: {
          last_message_at: lastMessageAtByCoach.get(coachId) || null,
        },
        payouts: {
          failed_count: failedPayouts.length,
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
      if (coach.payouts.failed_count > 0) {
        items.push({ coach_id: coach.id, issue: `${coach.payouts.failed_count} failed payout${coach.payouts.failed_count === 1 ? '' : 's'}`, action: 'Open payouts' })
      }
      return items
    }),
  })
}
