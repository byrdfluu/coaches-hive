import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ORG_MARKETPLACE_FEE } from '@/lib/orgPricing'
import { FeeTier, getFeePercentage, resolveProductCategory } from '@/lib/platformFees'
import { resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) {
    return jsonError('Forbidden', 403)
  }

  const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
  if (usersError) {
    return jsonError(usersError.message)
  }

  const users = usersData.users || []
  const athleteUserIds = new Set<string>()
  const coachUserIds = new Set<string>()
  const orgUserIds = new Set<string>()
  const counts = users.reduce(
    (acc, user) => {
      const userRole = String(user.user_metadata?.role || 'unknown').toLowerCase()
      acc.total += 1
      if (userRole === 'coach') {
        acc.coaches += 1
        coachUserIds.add(user.id)
      }
      if (userRole === 'athlete') {
        acc.athletes += 1
        athleteUserIds.add(user.id)
      }
      if (
        userRole.includes('org') ||
        ['club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director', 'team_manager'].includes(
          userRole
        )
      ) {
        acc.orgUsers += 1
        orgUserIds.add(user.id)
      }
      return acc
    },
    { total: 0, coaches: 0, athletes: 0, orgUsers: 0 }
  )

  const { count: orgCount } = await supabaseAdmin
    .from('organizations')
    .select('id', { count: 'exact', head: true })

  // Scope revenue metrics to the current calendar year
  const currentYear = new Date().getUTCFullYear()
  const yearStart = new Date(Date.UTC(currentYear, 0, 1)).toISOString()
  const yearEnd = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999)).toISOString()

  const { count: orderCount, data: orderRows } = await supabaseAdmin
    .from('orders')
    .select('amount, total, price, refund_status, product_id, coach_id, org_id, athlete_id, created_at', { count: 'exact' })
    .gte('created_at', yearStart)
    .lte('created_at', yearEnd)

  // payment_receipts is the authoritative source for completed transactions —
  // orders.amount may be null if the orders table had a schema gap at insert time
  const { data: receiptRows } = await supabaseAdmin
    .from('payment_receipts')
    .select('amount, metadata, created_at, payee_id, org_id')
    .eq('status', 'paid')
    .gte('created_at', yearStart)
    .lte('created_at', yearEnd)

  const { count: disputeCount } = await supabaseAdmin
    .from('order_disputes')
    .select('id', { count: 'exact', head: true })

  const { data: sessionRows } = await supabaseAdmin
    .from('sessions')
    .select('athlete_id, coach_id, start_time')

  const { data: productCoachRows } = await supabaseAdmin
    .from('products')
    .select('coach_id')

  const { data: orgTeamRows } = await supabaseAdmin
    .from('org_teams')
    .select('org_id')

  const { data: orgFeeRows } = await supabaseAdmin
    .from('org_fees')
    .select('org_id, created_at')

  const { data: coachPlanRows } = await supabaseAdmin
    .from('coach_plans')
    .select('coach_id')

  const { data: connectedOrgRows } = await supabaseAdmin
    .from('org_settings')
    .select('org_id, stripe_account_id')
    .not('stripe_account_id', 'is', null)

  // Prefer payment_receipts for gross revenue — more reliably populated than orders.amount
  const receiptsGross = (receiptRows || []).reduce((sum, r) => {
    const v = Number(r.amount ?? 0)
    return sum + (Number.isFinite(v) ? v : 0)
  }, 0)
  const ordersGross = (orderRows || []).reduce((sum, order) => {
    const value = Number(order.amount ?? order.total ?? order.price ?? 0)
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0)
  const grossRevenue = receiptsGross > 0 ? receiptsGross : ordersGross

  const refundCount = (orderRows || []).filter(
    (order) => String(order.refund_status || '').toLowerCase() === 'refunded'
  ).length

  const { count: sessionCount } = await supabaseAdmin
    .from('sessions')
    .select('id', { count: 'exact', head: true })

  const productIds = Array.from(new Set((orderRows || []).map((row) => row.product_id).filter(Boolean)))
  const coachIds = Array.from(new Set((orderRows || []).map((row) => row.coach_id).filter(Boolean)))

  const { data: productRows } = productIds.length
    ? await supabaseAdmin
        .from('products')
        .select('id, type, category, org_id')
        .in('id', productIds)
    : { data: [] }

  const { data: planRows } = coachIds.length
    ? await supabaseAdmin
        .from('coach_plans')
        .select('coach_id, tier')
        .in('coach_id', coachIds)
    : { data: [] }

  const { data: feeRuleRows } = await supabaseAdmin
    .from('platform_fee_rules')
    .select('tier, category, percentage')
    .eq('active', true)

  const productMap = (productRows || []).reduce<Record<string, { type?: string | null; category?: string | null; org_id?: string | null }>>(
    (acc, row) => {
      acc[row.id] = row
      return acc
    },
    {}
  )
  const tierMap = (planRows || []).reduce<Record<string, FeeTier>>((acc, row) => {
    acc[row.coach_id] = (row.tier as FeeTier) || 'starter'
    return acc
  }, {})

  // Prefer platform_fee from payment_receipts metadata — pre-computed at checkout time
  const receiptsPlatformFee = (receiptRows || []).reduce((sum, r) => {
    const meta = r.metadata as Record<string, unknown> | null
    const fee = Number(meta?.platform_fee ?? 0)
    return sum + (Number.isFinite(fee) ? fee : 0)
  }, 0)

  const marketplaceRevenueFromOrders = (orderRows || []).reduce((sum, order) => {
    const amount = Number(order.amount ?? order.total ?? order.price ?? 0)
    if (!Number.isFinite(amount)) return sum
    const product = order.product_id ? productMap[order.product_id] : null
    const isOrgProduct = Boolean(product?.org_id)
    if (isOrgProduct) {
      return sum + amount * (ORG_MARKETPLACE_FEE / 100)
    }
    const tier = order.coach_id ? tierMap[order.coach_id] || 'starter' : 'starter'
    const category = resolveProductCategory(product?.type || product?.category)
    const percent = getFeePercentage(tier, category, feeRuleRows || [])
    return sum + amount * (percent / 100)
  }, 0)

  const marketplaceRevenue = receiptsPlatformFee > 0 ? receiptsPlatformFee : marketplaceRevenueFromOrders

  const { data: feeAssignments } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('status, fee_id, athlete_id')
    .eq('status', 'paid')

  const feeIds = Array.from(new Set((feeAssignments || []).map((row) => row.fee_id).filter(Boolean)))
  const { data: feeRows } = feeIds.length
    ? await supabaseAdmin
        .from('org_fees')
        .select('id, amount_cents')
        .in('id', feeIds)
    : { data: [] }

  const feeMap = (feeRows || []).reduce<Record<string, number>>((acc, row) => {
    acc[row.id] = Number(row.amount_cents || 0) / 100
    return acc
  }, {})
  const orgFeesRevenue = (feeAssignments || []).reduce((sum, row) => {
    return sum + (feeMap[row.fee_id] || 0)
  }, 0)

  const sessionRowsSafe = (sessionRows || []) as Array<{ athlete_id?: string | null; coach_id?: string | null; start_time?: string | null }>
  const orderRowsSafe = (orderRows || []) as Array<{ athlete_id?: string | null; coach_id?: string | null; org_id?: string | null; created_at?: string | null }>
  const productCoachIds = new Set((productCoachRows || []).map((row) => row.coach_id).filter(Boolean))
  const orgTeamIds = new Set((orgTeamRows || []).map((row) => row.org_id).filter(Boolean))
  const orgFeeOrgIds = new Set((orgFeeRows || []).map((row) => row.org_id).filter(Boolean))
  const connectedOrgIds = new Set((connectedOrgRows || []).map((row) => row.org_id).filter(Boolean))

  const activatedAthletes = new Set(
    [
      ...sessionRowsSafe.map((row) => row.athlete_id),
      ...orderRowsSafe.map((row) => row.athlete_id),
    ].filter(Boolean),
  )
  const activatedCoaches = new Set(
    [
      ...sessionRowsSafe.map((row) => row.coach_id),
      ...orderRowsSafe.map((row) => row.coach_id),
      ...Array.from(productCoachIds),
    ].filter(Boolean),
  )
  const activatedOrgs = new Set(
    [
      ...orderRowsSafe.map((row) => row.org_id),
      ...Array.from(orgTeamIds),
      ...Array.from(orgFeeOrgIds),
    ].filter(Boolean),
  )

  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const activeAthletes7 = new Set(
    [
      ...sessionRowsSafe.filter((row) => row.start_time && row.start_time >= since7).map((row) => row.athlete_id),
      ...orderRowsSafe.filter((row) => row.created_at && row.created_at >= since7).map((row) => row.athlete_id),
    ].filter(Boolean),
  )
  const activeAthletes30 = new Set(
    [
      ...sessionRowsSafe.filter((row) => row.start_time && row.start_time >= since30).map((row) => row.athlete_id),
      ...orderRowsSafe.filter((row) => row.created_at && row.created_at >= since30).map((row) => row.athlete_id),
    ].filter(Boolean),
  )
  const activeCoaches7 = new Set(
    [
      ...sessionRowsSafe.filter((row) => row.start_time && row.start_time >= since7).map((row) => row.coach_id),
      ...orderRowsSafe.filter((row) => row.created_at && row.created_at >= since7).map((row) => row.coach_id),
    ].filter(Boolean),
  )
  const activeCoaches30 = new Set(
    [
      ...sessionRowsSafe.filter((row) => row.start_time && row.start_time >= since30).map((row) => row.coach_id),
      ...orderRowsSafe.filter((row) => row.created_at && row.created_at >= since30).map((row) => row.coach_id),
    ].filter(Boolean),
  )
  const activeOrgs7 = new Set(
    [
      ...orderRowsSafe.filter((row) => row.created_at && row.created_at >= since7).map((row) => row.org_id),
      ...(orgFeeRows || []).filter((row) => row.created_at && row.created_at >= since7).map((row) => row.org_id),
    ].filter(Boolean),
  )
  const activeOrgs30 = new Set(
    [
      ...orderRowsSafe.filter((row) => row.created_at && row.created_at >= since30).map((row) => row.org_id),
      ...(orgFeeRows || []).filter((row) => row.created_at && row.created_at >= since30).map((row) => row.org_id),
    ].filter(Boolean),
  )

  const paidAthleteIds = new Set((feeAssignments || []).map((row) => row.athlete_id).filter(Boolean))
  const convertedAthletes = new Set(
    [...orderRowsSafe.map((row) => row.athlete_id), ...Array.from(paidAthleteIds)].filter(Boolean),
  )
  const convertedCoaches = new Set((coachPlanRows || []).map((row) => row.coach_id).filter(Boolean))

  const toRate = (value: number, total: number) => (total ? Math.round((value / total) * 1000) / 10 : 0)

  return NextResponse.json({
    users: counts,
    orgs: orgCount || 0,
    orders: orderCount || 0,
    disputes: disputeCount || 0,
    grossRevenue,
    refunds: refundCount,
    sessions: sessionCount || 0,
    platformRevenue: marketplaceRevenue + orgFeesRevenue,
    activation: {
      athletes: {
        total: counts.athletes,
        activated: activatedAthletes.size,
        rate: toRate(activatedAthletes.size, counts.athletes),
      },
      coaches: {
        total: counts.coaches,
        activated: activatedCoaches.size,
        rate: toRate(activatedCoaches.size, counts.coaches),
      },
      orgs: {
        total: orgCount || 0,
        activated: activatedOrgs.size,
        rate: toRate(activatedOrgs.size, orgCount || 0),
      },
    },
    retention: {
      days7: {
        athletes: { active: activeAthletes7.size, rate: toRate(activeAthletes7.size, counts.athletes) },
        coaches: { active: activeCoaches7.size, rate: toRate(activeCoaches7.size, counts.coaches) },
        orgs: { active: activeOrgs7.size, rate: toRate(activeOrgs7.size, orgCount || 0) },
      },
      days30: {
        athletes: { active: activeAthletes30.size, rate: toRate(activeAthletes30.size, counts.athletes) },
        coaches: { active: activeCoaches30.size, rate: toRate(activeCoaches30.size, counts.coaches) },
        orgs: { active: activeOrgs30.size, rate: toRate(activeOrgs30.size, orgCount || 0) },
      },
    },
    conversion: {
      athletes: {
        total: counts.athletes,
        converted: convertedAthletes.size,
        rate: toRate(convertedAthletes.size, counts.athletes),
      },
      coaches: {
        total: counts.coaches,
        converted: convertedCoaches.size,
        rate: toRate(convertedCoaches.size, counts.coaches),
      },
      orgs: {
        total: orgCount || 0,
        converted: connectedOrgIds.size,
        rate: toRate(connectedOrgIds.size, orgCount || 0),
      },
    },
  })
}
