import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { shouldShowTestData } from '@/lib/adminTestData'

export const dynamic = 'force-dynamic'

const toCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [
    headers.join(','),
    ...rows.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(',')),
  ].join('\n')
}

export async function GET(request: Request) {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error

  const url = new URL(request.url)
  const orgIdFilter = url.searchParams.get('org_id') || null
  const statusFilter = url.searchParams.get('status') || null
  const format = url.searchParams.get('format') || null
  const showTest = shouldShowTestData(url.searchParams)

  let tryoutsQuery = supabaseAdmin
    .from('org_tryouts')
    .select('id, org_id, title, status, price, max_participants, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (orgIdFilter) tryoutsQuery = tryoutsQuery.eq('org_id', orgIdFilter)
  if (statusFilter) tryoutsQuery = tryoutsQuery.eq('status', statusFilter)

  const { data: tryouts, error: tryoutsError } = await tryoutsQuery
  if (tryoutsError) return NextResponse.json({ error: 'Failed to load tryouts' }, { status: 500 })

  if (!tryouts?.length) {
    return NextResponse.json({ tryouts: [], total: 0, summary: { total: 0, open: 0, with_issues: 0, total_gross_cents: 0, total_platform_fee_cents: 0, total_net_cents: 0 } })
  }

  const tryoutIds = tryouts.map(t => t.id)
  const orgIds = Array.from(new Set(tryouts.map(t => t.org_id).filter(Boolean)))

  const [regsResult, accountingResult, orgsResult] = await Promise.all([
    supabaseAdmin
      .from('org_tryout_registrations')
      .select('id, tryout_id, status, stripe_checkout_session_id, stripe_payment_intent_id, athlete_profile_id, owner_user_id, registered_at')
      .in('tryout_id', tryoutIds),
    supabaseAdmin
      .from('stripe_connect_payment_accounting')
      .select('stripe_checkout_session_id, stripe_payment_intent_id, gross_amount_cents, platform_fee_cents, net_amount_cents, platform_fee_rate, livemode, connected_account_destination')
      .eq('checkout_type', 'mobile_tryout'),
    orgIds.length
      ? supabaseAdmin.from('org_settings').select('org_id, org_name').in('org_id', orgIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const orgNameMap = (orgsResult.data || []).reduce<Record<string, string>>((acc, row) => {
    acc[row.org_id] = row.org_name || 'Organization'
    return acc
  }, {})

  const regsByTryout = (regsResult.data || []).reduce<Record<string, any[]>>((acc, r) => {
    if (!acc[r.tryout_id]) acc[r.tryout_id] = []
    acc[r.tryout_id].push(r)
    return acc
  }, {})

  // Index by both checkout session (from accounting) and payment intent (on registration row)
  const accountingBySession = (accountingResult.data || []).reduce<Record<string, any>>((acc, a) => {
    if (a.stripe_checkout_session_id) acc[a.stripe_checkout_session_id] = a
    return acc
  }, {})
  const accountingByIntent = (accountingResult.data || []).reduce<Record<string, any>>((acc, a) => {
    if (a.stripe_payment_intent_id) acc[a.stripe_payment_intent_id] = a
    return acc
  }, {})

  const now = Date.now()
  const EXPIRED_THRESHOLD_MS = 25 * 60 * 60 * 1000

  const result = tryouts.map(tryout => {
    const regs = regsByTryout[tryout.id] || []

    const statusCounts = regs.reduce<Record<string, number>>((acc, r) => {
      const s = String(r.status || 'unknown')
      acc[s] = (acc[s] || 0) + 1
      return acc
    }, {})

    let grossCents = 0
    let platformFeeCents = 0
    let netCents = 0
    const checkoutSessionIds: string[] = []
    const paymentIntentIds: string[] = []

    regs.forEach((r: any) => {
      // Look up accounting by session first, then by payment intent
      const a = (r.stripe_checkout_session_id && accountingBySession[r.stripe_checkout_session_id])
        || (r.stripe_payment_intent_id && accountingByIntent[r.stripe_payment_intent_id])
        || null
      if (!a) return
      if (!showTest && !a.livemode) return
      grossCents += Number(a.gross_amount_cents || 0)
      platformFeeCents += Number(a.platform_fee_cents || 0)
      netCents += Number(a.net_amount_cents || 0)
      if (r.stripe_checkout_session_id && !checkoutSessionIds.includes(r.stripe_checkout_session_id)) {
        checkoutSessionIds.push(r.stripe_checkout_session_id)
      }
      const intentId = a.stripe_payment_intent_id || r.stripe_payment_intent_id
      if (intentId && !paymentIntentIds.includes(intentId)) paymentIntentIds.push(intentId)
    })

    const maxParticipants = Number(tryout.max_participants || 0)
    const paidCount = statusCounts['paid'] || 0
    const pendingCount = statusCounts['pending'] || 0
    const waitlistedCount = statusCounts['waitlisted'] || 0
    const issues: string[] = []

    // Capacity: count pending + paid as "occupying" a spot
    const occupiedCount = paidCount + pendingCount
    if (maxParticipants > 0 && occupiedCount > maxParticipants) issues.push('over_capacity')

    if (String(tryout.status || '') !== 'open' && pendingCount > 0) {
      issues.push('closed_with_pending_checkout')
    }

    const hasExpiredPending = regs.some(
      (r: any) => String(r.status || '') === 'pending' && now - new Date(r.registered_at || 0).getTime() > EXPIRED_THRESHOLD_MS,
    )
    if (hasExpiredPending) issues.push('expired_pending_checkout')

    const hasMissingPlatformFee = regs.some((r: any) => {
      if (String(r.status || '') !== 'paid') return false
      const a = (r.stripe_checkout_session_id && accountingBySession[r.stripe_checkout_session_id])
        || (r.stripe_payment_intent_id && accountingByIntent[r.stripe_payment_intent_id])
      return a && Number(a.platform_fee_cents || 0) === 0
    })
    if (hasMissingPlatformFee) issues.push('missing_platform_fee')

    const hasPaidCheckoutPendingReg = regs.some((r: any) => {
      if (String(r.status || '') === 'paid') return false
      const a = (r.stripe_checkout_session_id && accountingBySession[r.stripe_checkout_session_id])
        || (r.stripe_payment_intent_id && accountingByIntent[r.stripe_payment_intent_id])
      return Boolean(a)
    })
    if (hasPaidCheckoutPendingReg) issues.push('paid_checkout_pending_registration')

    // Paid registrations without any payment intent ID
    const hasPaidWithoutIntent = regs.some(
      (r: any) => String(r.status || '') === 'paid' && !r.stripe_payment_intent_id,
    )
    if (hasPaidWithoutIntent) issues.push('paid_registration_no_payment_intent')

    // Duplicate paid for same athlete
    const paidByAthlete = new Map<string, number>()
    regs.filter((r: any) => String(r.status || '') === 'paid').forEach((r: any) => {
      if (!r.athlete_profile_id) return
      paidByAthlete.set(r.athlete_profile_id, (paidByAthlete.get(r.athlete_profile_id) || 0) + 1)
    })
    if (Array.from(paidByAthlete.values()).some(c => c > 1)) issues.push('duplicate_paid_registration')

    return {
      id: tryout.id,
      org_id: tryout.org_id,
      org_name: orgNameMap[tryout.org_id] || 'Unknown',
      title: tryout.title || 'Untitled Tryout',
      status: tryout.status,
      price: tryout.price,
      max_participants: tryout.max_participants,
      created_at: tryout.created_at,
      registrations: {
        total: regs.length,
        paid: paidCount,
        pending: pendingCount,
        waitlisted: waitlistedCount,
        canceled: statusCounts['canceled'] || 0,
        expired: statusCounts['expired'] || 0,
        refunded: statusCounts['refunded'] || 0,
        remaining_spots: maxParticipants > 0 ? Math.max(0, maxParticipants - occupiedCount) : null,
      },
      financials: {
        gross_cents: grossCents,
        platform_fee_cents: platformFeeCents,
        net_cents: netCents,
      },
      stripe: {
        checkout_session_ids: checkoutSessionIds.slice(0, 10),
        payment_intent_ids: paymentIntentIds.slice(0, 10),
      },
      issues,
    }
  })

  if (format === 'csv') {
    const flat = result.map(t => ({
      id: t.id,
      org_name: t.org_name,
      title: t.title,
      status: t.status || '',
      price: t.price ?? '',
      max_participants: t.max_participants ?? '',
      total_registrations: t.registrations.total,
      paid_registrations: t.registrations.paid,
      pending_registrations: t.registrations.pending,
      waitlisted_registrations: t.registrations.waitlisted,
      canceled_registrations: t.registrations.canceled,
      refunded_registrations: t.registrations.refunded,
      remaining_spots: t.registrations.remaining_spots ?? '',
      gross_dollars: (t.financials.gross_cents / 100).toFixed(2),
      platform_fee_dollars: (t.financials.platform_fee_cents / 100).toFixed(2),
      net_dollars: (t.financials.net_cents / 100).toFixed(2),
      issues: t.issues.join('|'),
      created_at: t.created_at || '',
    }))
    return new Response(toCsv(flat), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="tryouts-export.csv"',
      },
    })
  }

  return NextResponse.json({
    tryouts: result,
    total: result.length,
    summary: {
      total: result.length,
      open: result.filter(t => String(t.status || '') === 'open').length,
      with_issues: result.filter(t => t.issues.length > 0).length,
      total_gross_cents: result.reduce((s, t) => s + t.financials.gross_cents, 0),
      total_platform_fee_cents: result.reduce((s, t) => s + t.financials.platform_fee_cents, 0),
      total_net_cents: result.reduce((s, t) => s + t.financials.net_cents, 0),
    },
  })
}
