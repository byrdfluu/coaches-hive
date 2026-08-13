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
  const typeFilter = url.searchParams.get('type') || null
  const format = url.searchParams.get('format') || null
  const showTest = shouldShowTestData(url.searchParams)

  let programsQuery = supabaseAdmin
    .from('programs')
    .select('id, org_id, name, type, price, capacity, status, workspace_id, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (orgIdFilter) programsQuery = programsQuery.eq('org_id', orgIdFilter)
  if (statusFilter) programsQuery = programsQuery.eq('status', statusFilter)
  if (typeFilter) programsQuery = programsQuery.eq('type', typeFilter)

  const { data: programs, error: programsError } = await programsQuery
  if (programsError) return NextResponse.json({ error: 'Failed to load programs' }, { status: 500 })

  if (!programs?.length) {
    return NextResponse.json({ programs: [], total: 0, summary: { total: 0, active: 0, with_issues: 0, total_gross_cents: 0, total_platform_fee_cents: 0, total_net_cents: 0 } })
  }

  const programIds = programs.map(p => p.id)
  const orgIds = Array.from(new Set(programs.map(p => p.org_id).filter(Boolean)))

  const [regsResult, accountingResult, orgsResult, targetsResult] = await Promise.all([
    supabaseAdmin
      .from('program_registrations')
      .select('id, program_id, status, stripe_checkout_session_id, athlete_profile_id, owner_user_id, created_at')
      .in('program_id', programIds),
    supabaseAdmin
      .from('stripe_connect_payment_accounting')
      .select('stripe_checkout_session_id, stripe_payment_intent_id, gross_amount_cents, platform_fee_cents, net_amount_cents, platform_fee_rate, livemode, connected_account_destination')
      .eq('checkout_type', 'mobile_program'),
    orgIds.length
      ? supabaseAdmin.from('org_settings').select('org_id, org_name').in('org_id', orgIds)
      : Promise.resolve({ data: [] as any[] }),
    supabaseAdmin
      .from('org_program_targets')
      .select('program_id, target_type, team_id, athlete_id')
      .in('program_id', programIds),
  ])

  const orgNameMap = (orgsResult.data || []).reduce<Record<string, string>>((acc, row) => {
    acc[row.org_id] = row.org_name || 'Organization'
    return acc
  }, {})

  const regsByProgram = (regsResult.data || []).reduce<Record<string, any[]>>((acc, r) => {
    if (!acc[r.program_id]) acc[r.program_id] = []
    acc[r.program_id].push(r)
    return acc
  }, {})

  const accountingBySession = (accountingResult.data || []).reduce<Record<string, any>>((acc, a) => {
    if (a.stripe_checkout_session_id) acc[a.stripe_checkout_session_id] = a
    return acc
  }, {})

  const targetsByProgram = (targetsResult.data || []).reduce<Record<string, any[]>>((acc, t) => {
    if (!acc[t.program_id]) acc[t.program_id] = []
    acc[t.program_id].push(t)
    return acc
  }, {})

  const now = Date.now()
  const EXPIRED_THRESHOLD_MS = 25 * 60 * 60 * 1000

  const result = programs.map(program => {
    const regs = regsByProgram[program.id] || []

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
      if (!r.stripe_checkout_session_id) return
      const a = accountingBySession[r.stripe_checkout_session_id]
      if (!a) return
      if (!showTest && !a.livemode) return
      grossCents += Number(a.gross_amount_cents || 0)
      platformFeeCents += Number(a.platform_fee_cents || 0)
      netCents += Number(a.net_amount_cents || 0)
      if (!checkoutSessionIds.includes(r.stripe_checkout_session_id)) {
        checkoutSessionIds.push(r.stripe_checkout_session_id)
      }
      if (a.stripe_payment_intent_id && !paymentIntentIds.includes(a.stripe_payment_intent_id)) {
        paymentIntentIds.push(a.stripe_payment_intent_id)
      }
    })

    const programTargets = targetsByProgram[program.id] || []
    const targetAudience =
      programTargets.length === 0 || programTargets.some((t: any) => t.target_type === 'organization')
        ? 'entire_organization'
        : programTargets.some((t: any) => t.target_type === 'team')
          ? 'selected_teams'
          : 'selected_athletes'

    const capacity = Number(program.capacity || 0)
    const paidCount = statusCounts['paid'] || 0
    const pendingCount = statusCounts['pending'] || 0
    const issues: string[] = []

    if (capacity > 0 && paidCount > capacity) issues.push('over_capacity')

    if (String(program.status || '') !== 'active' && pendingCount > 0) {
      issues.push('closed_with_pending_checkout')
    }

    const hasExpiredPending = regs.some(
      (r: any) => String(r.status || '') === 'pending' && now - new Date(r.created_at || 0).getTime() > EXPIRED_THRESHOLD_MS,
    )
    if (hasExpiredPending) issues.push('expired_pending_checkout')

    const hasMissingPlatformFee = regs.some((r: any) => {
      if (String(r.status || '') !== 'paid' || !r.stripe_checkout_session_id) return false
      const a = accountingBySession[r.stripe_checkout_session_id]
      return a && Number(a.platform_fee_cents || 0) === 0
    })
    if (hasMissingPlatformFee) issues.push('missing_platform_fee')

    const hasPaidCheckoutPendingReg = regs.some(
      (r: any) => String(r.status || '') !== 'paid' && r.stripe_checkout_session_id && Boolean(accountingBySession[r.stripe_checkout_session_id]),
    )
    if (hasPaidCheckoutPendingReg) issues.push('paid_checkout_pending_registration')

    const paidByAthlete = new Map<string, number>()
    regs.filter((r: any) => String(r.status || '') === 'paid').forEach((r: any) => {
      if (!r.athlete_profile_id) return
      paidByAthlete.set(r.athlete_profile_id, (paidByAthlete.get(r.athlete_profile_id) || 0) + 1)
    })
    if (Array.from(paidByAthlete.values()).some(c => c > 1)) issues.push('duplicate_paid_registration')

    return {
      id: program.id,
      org_id: program.org_id,
      org_name: orgNameMap[program.org_id] || 'Unknown',
      name: program.name || 'Untitled',
      type: program.type,
      status: program.status,
      price: program.price,
      capacity: program.capacity,
      workspace_id: program.workspace_id,
      created_at: program.created_at,
      target_audience: targetAudience,
      target_count: programTargets.length,
      registrations: {
        total: regs.length,
        paid: paidCount,
        pending: pendingCount,
        canceled: statusCounts['canceled'] || 0,
        waitlisted: statusCounts['waitlisted'] || 0,
        expired: statusCounts['expired'] || 0,
        remaining_spots: capacity > 0 ? Math.max(0, capacity - paidCount) : null,
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
    const flat = result.map(p => ({
      id: p.id,
      org_name: p.org_name,
      name: p.name,
      type: p.type || '',
      status: p.status || '',
      price: p.price ?? '',
      capacity: p.capacity ?? '',
      target_audience: p.target_audience,
      total_registrations: p.registrations.total,
      paid_registrations: p.registrations.paid,
      pending_registrations: p.registrations.pending,
      canceled_registrations: p.registrations.canceled,
      waitlisted_registrations: p.registrations.waitlisted,
      remaining_spots: p.registrations.remaining_spots ?? '',
      gross_dollars: (p.financials.gross_cents / 100).toFixed(2),
      platform_fee_dollars: (p.financials.platform_fee_cents / 100).toFixed(2),
      net_dollars: (p.financials.net_cents / 100).toFixed(2),
      issues: p.issues.join('|'),
      created_at: p.created_at || '',
    }))
    return new Response(toCsv(flat), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="programs-export.csv"',
      },
    })
  }

  return NextResponse.json({
    programs: result,
    total: result.length,
    summary: {
      total: result.length,
      active: result.filter(p => String(p.status || '') === 'active').length,
      with_issues: result.filter(p => p.issues.length > 0).length,
      total_gross_cents: result.reduce((s, p) => s + p.financials.gross_cents, 0),
      total_platform_fee_cents: result.reduce((s, p) => s + p.financials.platform_fee_cents, 0),
      total_net_cents: result.reduce((s, p) => s + p.financials.net_cents, 0),
    },
  })
}
