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

const parseMonth = (value: string | null) => {
  if (!value) return null
  const [year, month] = value.split('-').map((part) => Number(part))
  if (!year || !month || month < 1 || month > 12) return null
  return { year, month }
}

const toDayKey = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

const toHourIndex = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.getUTCHours()
}

const toMoney = (...values: Array<number | string | null | undefined>) => {
  for (const value of values) {
    const amount = Number(value ?? NaN)
    if (Number.isFinite(amount)) return amount
  }
  return 0
}

const roundTenth = (value: number) => Math.round(value * 10) / 10

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (adminAccess.teamRole !== 'finance' && adminAccess.teamRole !== 'superadmin') {
    return jsonError('Forbidden', 403)
  }

  const url = new URL(request.url)
  const monthParam = parseMonth(url.searchParams.get('month'))
  const now = new Date()
  const year = monthParam?.year ?? now.getUTCFullYear()
  const monthIndex = (monthParam?.month ?? now.getUTCMonth() + 1) - 1
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999))
  const monthLabel = `${year}-${String(monthIndex + 1).padStart(2, '0')}`

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, amount, total, price, created_at, coach_id, athlete_id, org_id, product_id, refund_status')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())

  const orderRows = orders || []
  const productIds = Array.from(new Set(orderRows.map((row) => row.product_id).filter(Boolean)))
  const orderCoachIds = Array.from(new Set(orderRows.map((row) => row.coach_id).filter(Boolean)))

  const { data: productRows } = productIds.length
    ? await supabaseAdmin
        .from('products')
        .select('id, type, category, org_id')
        .in('id', productIds)
    : { data: [] }

  const { data: planRows } = orderCoachIds.length
    ? await supabaseAdmin
        .from('coach_plans')
        .select('coach_id, tier')
        .in('coach_id', orderCoachIds)
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

  const dayTotals: Record<string, number> = {}
  const hourTotals = Array.from({ length: 24 }, () => 0)
  const coachTotals: Record<string, number> = {}
  const orgTotals: Record<string, number> = {}
  const athleteTotals: Record<string, number> = {}

  const addRevenue = (
    dayKey: string | null,
    hourIndex: number | null,
    amount: number,
    coachId?: string | null,
    orgId?: string | null,
    athleteId?: string | null
  ) => {
    if (dayKey) {
      dayTotals[dayKey] = (dayTotals[dayKey] || 0) + amount
    }
    if (hourIndex !== null) {
      hourTotals[hourIndex] = (hourTotals[hourIndex] || 0) + amount
    }
    if (coachId) {
      coachTotals[coachId] = (coachTotals[coachId] || 0) + amount
    }
    if (orgId) {
      orgTotals[orgId] = (orgTotals[orgId] || 0) + amount
    }
    if (athleteId) {
      athleteTotals[athleteId] = (athleteTotals[athleteId] || 0) + amount
    }
  }

  let marketplaceRevenue = 0
  let grossMarketplaceSales = 0
  let refundTotal = 0

  orderRows.forEach((order) => {
    const amount = Number(order.amount ?? order.total ?? order.price ?? 0)
    if (!Number.isFinite(amount)) return
    grossMarketplaceSales += amount
    if (String(order.refund_status || '').toLowerCase() === 'refunded') {
      refundTotal += amount
    }
    const product = order.product_id ? productMap[order.product_id] : null
    const isOrgProduct = Boolean(product?.org_id)
    let feePercent = ORG_MARKETPLACE_FEE
    if (!isOrgProduct) {
      const tier = order.coach_id ? tierMap[order.coach_id] || 'starter' : 'starter'
      const category = resolveProductCategory(product?.type || product?.category)
      feePercent = getFeePercentage(tier, category, feeRuleRows || [])
    }
    const revenue = amount * (feePercent / 100)
    if (!Number.isFinite(revenue)) return
    marketplaceRevenue += revenue
    addRevenue(toDayKey(order.created_at), toHourIndex(order.created_at), revenue, order.coach_id, order.org_id, order.athlete_id)
  })

  const { data: feeAssignments } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('fee_id, athlete_id, status, paid_at, created_at')
    .eq('status', 'paid')
    .gte('paid_at', start.toISOString())
    .lte('paid_at', end.toISOString())

  const feeIds = Array.from(new Set((feeAssignments || []).map((row) => row.fee_id).filter(Boolean)))
  const { data: feeRows } = feeIds.length
    ? await supabaseAdmin
        .from('org_fees')
        .select('id, org_id, amount_cents')
        .in('id', feeIds)
    : { data: [] }

  const feeMap = (feeRows || []).reduce<Record<string, { org_id?: string | null; amount: number }>>((acc, row) => {
    acc[row.id] = { org_id: row.org_id, amount: Number(row.amount_cents || 0) / 100 }
    return acc
  }, {})

  let orgFeesRevenue = 0
  ;(feeAssignments || []).forEach((assignment) => {
    const fee = feeMap[assignment.fee_id]
    if (!fee) return
    const amount = fee.amount
    if (!Number.isFinite(amount)) return
    orgFeesRevenue += amount
    const timestamp = assignment.paid_at || assignment.created_at
    const dayKey = toDayKey(timestamp)
    const hourIndex = toHourIndex(timestamp)
    addRevenue(dayKey, hourIndex, amount, null, fee.org_id, assignment.athlete_id)
  })

  const { data: sessionPaymentRows } = await supabaseAdmin
    .from('session_payments')
    .select('coach_id, org_id, athlete_id, platform_fee, paid_at')
    .eq('status', 'paid')
    .gte('paid_at', start.toISOString())
    .lte('paid_at', end.toISOString())

  let sessionFeesRevenue = 0
  const sessionFeesByCoach: Record<string, number> = {}
  const sessionFeesByOrg: Record<string, number> = {}
  const sessionCountByCoach: Record<string, number> = {}
  const sessionCountByOrg: Record<string, number> = {}

  ;(sessionPaymentRows || []).forEach((row) => {
    const fee = Number(row.platform_fee || 0)
    if (!Number.isFinite(fee) || fee <= 0) return
    sessionFeesRevenue += fee
    addRevenue(toDayKey(row.paid_at), toHourIndex(row.paid_at), fee, row.coach_id, row.org_id, row.athlete_id)
    if (row.coach_id) {
      sessionFeesByCoach[row.coach_id] = (sessionFeesByCoach[row.coach_id] || 0) + fee
      sessionCountByCoach[row.coach_id] = (sessionCountByCoach[row.coach_id] || 0) + 1
    }
    if (row.org_id) {
      sessionFeesByOrg[row.org_id] = (sessionFeesByOrg[row.org_id] || 0) + fee
      sessionCountByOrg[row.org_id] = (sessionCountByOrg[row.org_id] || 0) + 1
    }
  })

  const orgIds = Array.from(new Set(Object.keys(orgTotals)))
  const athleteIds = Array.from(new Set(Object.keys(athleteTotals)))
  const allCoachIds = Array.from(new Set(Object.keys(coachTotals)))

  const { data: orgRows } = orgIds.length
    ? await supabaseAdmin
        .from('org_settings')
        .select('org_id, org_name')
        .in('org_id', orgIds)
    : { data: [] }

  const { data: profileRows } = athleteIds.length || allCoachIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(new Set([...athleteIds, ...allCoachIds])))
    : { data: [] }

  const orgNameMap = (orgRows || []).reduce<Record<string, string>>((acc, row) => {
    acc[row.org_id] = row.org_name || 'Organization'
    return acc
  }, {})

  const profileMap = (profileRows || []).reduce<Record<string, { name: string; email: string }>>((acc, row) => {
    acc[row.id] = { name: row.full_name || row.email || 'Member', email: row.email || '' }
    return acc
  }, {})

  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, index + 1))
    const key = date.toISOString().slice(0, 10)
    return { date: key, total: dayTotals[key] || 0 }
  })

  const hours = hourTotals.map((total, hour) => ({ hour, total }))

  const toBreakdown = (totals: Record<string, number>, nameMap: (id: string) => string) => {
    return Object.entries(totals)
      .map(([id, revenue]) => ({ id, name: nameMap(id), revenue }))
      .sort((a, b) => b.revenue - a.revenue)
  }

  const toCoachBreakdown = (totals: Record<string, number>) => {
    return Object.entries(totals)
      .map(([id, revenue]) => ({
        id,
        name: profileMap[id]?.name || 'Coach',
        revenue,
        sessionFees: sessionFeesByCoach[id] || 0,
        marketplaceFees: revenue - (sessionFeesByCoach[id] || 0),
        sessionCount: sessionCountByCoach[id] || 0,
        tier: tierMap[id] || 'starter',
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }

  const toOrgBreakdown = (totals: Record<string, number>) => {
    return Object.entries(totals)
      .map(([id, revenue]) => ({
        id,
        name: orgNameMap[id] || 'Organization',
        revenue,
        sessionFees: sessionFeesByOrg[id] || 0,
        marketplaceFees: revenue - (sessionFeesByOrg[id] || 0),
        sessionCount: sessionCountByOrg[id] || 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }

  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const churnCurrentStartMs = nowMs - 30 * 24 * 60 * 60 * 1000
  const churnPreviousStartMs = nowMs - 60 * 24 * 60 * 60 * 1000
  const riskCurrentStartMs = nowMs - 14 * 24 * 60 * 60 * 1000
  const riskPreviousStartMs = nowMs - 28 * 24 * 60 * 60 * 1000
  const churnCurrentStartIso = new Date(churnCurrentStartMs).toISOString()
  const churnPreviousStartIso = new Date(churnPreviousStartMs).toISOString()

  const previousWindowRevenueByOrg: Record<string, number> = {}
  const currentWindowRevenueByOrg: Record<string, number> = {}
  const riskPreviousRevenueByOrg: Record<string, number> = {}
  const riskCurrentRevenueByOrg: Record<string, number> = {}

  const applyOrgRevenue = (orgId: string | null | undefined, timestamp: string | null | undefined, amount: number) => {
    if (!orgId || !timestamp || !Number.isFinite(amount) || amount <= 0) return
    const ts = new Date(timestamp).getTime()
    if (!Number.isFinite(ts)) return
    if (ts >= churnPreviousStartMs && ts < churnCurrentStartMs) {
      previousWindowRevenueByOrg[orgId] = (previousWindowRevenueByOrg[orgId] || 0) + amount
    } else if (ts >= churnCurrentStartMs && ts <= nowMs) {
      currentWindowRevenueByOrg[orgId] = (currentWindowRevenueByOrg[orgId] || 0) + amount
    }

    if (ts >= riskPreviousStartMs && ts < riskCurrentStartMs) {
      riskPreviousRevenueByOrg[orgId] = (riskPreviousRevenueByOrg[orgId] || 0) + amount
    } else if (ts >= riskCurrentStartMs && ts <= nowMs) {
      riskCurrentRevenueByOrg[orgId] = (riskCurrentRevenueByOrg[orgId] || 0) + amount
    }
  }

  const { data: churnOrders } = await supabaseAdmin
    .from('orders')
    .select('org_id, created_at, amount, total, price, refund_status')
    .not('org_id', 'is', null)
    .gte('created_at', churnPreviousStartIso)
    .lte('created_at', nowIso)

  ;(churnOrders || []).forEach((order: any) => {
    const grossAmount = toMoney(order.amount, order.total, order.price)
    if (!Number.isFinite(grossAmount) || grossAmount <= 0) return
    const isRefunded = String(order.refund_status || '').toLowerCase() === 'refunded'
    if (isRefunded) return
    const platformRevenue = grossAmount * (ORG_MARKETPLACE_FEE / 100)
    applyOrgRevenue(order.org_id, order.created_at, platformRevenue)
  })

  const { data: churnFeeAssignments } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('fee_id, paid_at, created_at, status')
    .eq('status', 'paid')
    .gte('paid_at', churnPreviousStartIso)
    .lte('paid_at', nowIso)

  const churnFeeIds = Array.from(new Set((churnFeeAssignments || []).map((row: any) => row.fee_id).filter(Boolean)))
  const { data: churnFees } = churnFeeIds.length
    ? await supabaseAdmin
        .from('org_fees')
        .select('id, org_id, amount_cents')
        .in('id', churnFeeIds)
    : { data: [] }

  const churnFeeMap = (churnFees || []).reduce<Record<string, { org_id?: string | null; amount: number }>>((acc, row: any) => {
    acc[row.id] = { org_id: row.org_id, amount: Number(row.amount_cents || 0) / 100 }
    return acc
  }, {})

  ;(churnFeeAssignments || []).forEach((assignment: any) => {
    const fee = churnFeeMap[assignment.fee_id]
    if (!fee) return
    const timestamp = assignment.paid_at || assignment.created_at
    applyOrgRevenue(fee.org_id || null, timestamp, fee.amount)
  })

  const previousActiveOrgIds = Object.entries(previousWindowRevenueByOrg)
    .filter(([, revenue]) => Number.isFinite(revenue) && revenue > 0)
    .map(([id]) => id)
  const currentActiveOrgIds = new Set(
    Object.entries(currentWindowRevenueByOrg)
      .filter(([, revenue]) => Number.isFinite(revenue) && revenue > 0)
      .map(([id]) => id),
  )
  const churnedOrgCount = previousActiveOrgIds.filter((id) => !currentActiveOrgIds.has(id)).length

  const previousCohortRevenue = previousActiveOrgIds.reduce(
    (sum, orgId) => sum + (previousWindowRevenueByOrg[orgId] || 0),
    0,
  )
  const currentCohortRevenue = previousActiveOrgIds.reduce(
    (sum, orgId) => sum + (currentWindowRevenueByOrg[orgId] || 0),
    0,
  )

  const logoChurnRate = previousActiveOrgIds.length
    ? roundTenth((churnedOrgCount / previousActiveOrgIds.length) * 100)
    : 0
  const revenueChurnRate = previousCohortRevenue
    ? roundTenth((Math.max(0, previousCohortRevenue - currentCohortRevenue) / previousCohortRevenue) * 100)
    : 0
  const netRevenueRetention = previousCohortRevenue
    ? roundTenth((currentCohortRevenue / previousCohortRevenue) * 100)
    : 0

  const atRiskOrgIds = new Set<string>()
  Array.from(
    new Set([...Object.keys(riskPreviousRevenueByOrg), ...Object.keys(riskCurrentRevenueByOrg)]),
  ).forEach((orgId) => {
    const previousRevenue = riskPreviousRevenueByOrg[orgId] || 0
    const currentRevenue = riskCurrentRevenueByOrg[orgId] || 0
    if (previousRevenue > 0 && currentRevenue < previousRevenue * 0.5) {
      atRiskOrgIds.add(orgId)
    }
  })

  const alerts: Array<{ id: string; title: string; detail: string; severity: 'High' | 'Medium' | 'Low' }> = []
  const dayAgoIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()

  const { data: refundRows } = await supabaseAdmin
    .from('orders')
    .select('id, refund_status, refunded_at, updated_at, created_at')
    .eq('refund_status', 'refunded')
    .gte('updated_at', dayAgoIso)

  const refunds24h = (refundRows || []).filter((row: any) => {
    const ts = row.refunded_at || row.updated_at || row.created_at
    if (!ts) return false
    return new Date(ts).getTime() >= nowMs - 24 * 60 * 60 * 1000
  }).length

  if (refunds24h >= 3) {
    alerts.push({
      id: 'refund-spike',
      title: 'Marketplace refunds spike',
      detail: `${refunds24h} refunds in the last 24 hours`,
      severity: 'High',
    })
  }

  const { data: overdueFees } = await supabaseAdmin
    .from('org_fees')
    .select('id, due_date, org_id')
    .lt('due_date', new Date().toISOString())

  const overdueFeeIds = (overdueFees || []).map((row: any) => row.id).filter(Boolean)
  const overdueOrgByFeeId = (overdueFees || []).reduce<Record<string, string>>((acc, row: any) => {
    if (row?.id && row?.org_id) acc[row.id] = row.org_id
    return acc
  }, {})
  let overdueAssignments = 0
  if (overdueFeeIds.length) {
    const { data: overdueRows } = await supabaseAdmin
      .from('org_fee_assignments')
      .select('id, fee_id, status')
      .in('fee_id', overdueFeeIds)
      .eq('status', 'unpaid')
    overdueAssignments = overdueRows?.length || 0
    ;(overdueRows || []).forEach((row: any) => {
      const orgId = overdueOrgByFeeId[row.fee_id]
      if (orgId) atRiskOrgIds.add(orgId)
    })
  }

  if (overdueAssignments > 0) {
    alerts.push({
      id: 'org-overdue',
      title: 'Org fees past due',
      detail: `${overdueAssignments} unpaid fees are past the due date`,
      severity: 'Medium',
    })
  }

  const { data: coachRows } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'coach')

  const coachIds = (coachRows || []).map((row: any) => row.id).filter(Boolean)
  let inactiveCoaches = 0
  if (coachIds.length) {
    const sinceIso = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: sessionRows } = await supabaseAdmin
      .from('sessions')
      .select('coach_id')
      .gte('start_time', sinceIso)
    const activeCoachIds = new Set((sessionRows || []).map((row: any) => row.coach_id).filter(Boolean))
    inactiveCoaches = coachIds.length - activeCoachIds.size
  }

  if (inactiveCoaches >= 5) {
    alerts.push({
      id: 'coach-inactive',
      title: 'Coaches inactive',
      detail: `${inactiveCoaches} coaches have no sessions in the last 30 days`,
      severity: 'Low',
    })
  }

  return NextResponse.json({
    month: monthLabel,
    totals: {
      platform: marketplaceRevenue + orgFeesRevenue + sessionFeesRevenue,
      marketplace: marketplaceRevenue,
      orgFees: orgFeesRevenue,
      sessionFees: sessionFeesRevenue,
    },
    sources: {
      marketplaceFees: marketplaceRevenue,
      orgFees: orgFeesRevenue,
      grossMarketplaceSales,
      refunds: refundTotal,
      sessionFees: sessionFeesRevenue,
    },
    days,
    hours,
    byCoach: toCoachBreakdown(coachTotals),
    byOrg: toOrgBreakdown(orgTotals),
    byAthlete: toBreakdown(athleteTotals, (id) => profileMap[id]?.name || 'Athlete'),
    churn: {
      logoChurnRate,
      revenueChurnRate,
      netRevenueRetention,
      atRiskOrgs: atRiskOrgIds.size,
      windowDays: 30,
      riskWindowDays: 14,
    },
    alerts,
  })
}
