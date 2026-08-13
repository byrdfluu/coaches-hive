import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { filterAdminTestRows, shouldShowTestData } from '@/lib/adminTestData'
import { enrichWithWorkspace } from '@/lib/workspaceAdmin'

export const dynamic = 'force-dynamic'

const isStripeIssue = (row: any) => ['Stripe webhook', 'Checkout handoff', 'Billing failure'].includes(String(row.source || ''))

const EXPIRED_THRESHOLD_MS = 25 * 60 * 60 * 1000

async function detectProgramTryoutIssues(): Promise<any[]> {
  const now = Date.now()
  const issues: any[] = []

  const [programRegsResult, tryoutRegsResult, accountingResult, programsResult, tryoutsResult] = await Promise.all([
    supabaseAdmin
      .from('program_registrations')
      .select('id, program_id, status, stripe_checkout_session_id, created_at')
      .not('stripe_checkout_session_id', 'is', null)
      .limit(1000),
    supabaseAdmin
      .from('org_tryout_registrations')
      .select('id, tryout_id, status, stripe_checkout_session_id, stripe_payment_intent_id, registered_at')
      .limit(1000),
    supabaseAdmin
      .from('stripe_connect_payment_accounting')
      .select('stripe_checkout_session_id, stripe_payment_intent_id, platform_fee_cents, livemode, created_at')
      .in('checkout_type', ['mobile_program', 'mobile_tryout'])
      .eq('livemode', true),
    supabaseAdmin
      .from('programs')
      .select('id, name, org_id, capacity, status')
      .not('capacity', 'is', null),
    supabaseAdmin
      .from('org_tryouts')
      .select('id, title, org_id, max_participants, status')
      .not('max_participants', 'is', null),
  ])

  const accountingBySession = new Map<string, any>()
  for (const a of accountingResult.data || []) {
    if (a.stripe_checkout_session_id) accountingBySession.set(a.stripe_checkout_session_id, a)
  }

  // 1. Paid Stripe checkout with pending program registration
  for (const reg of programRegsResult.data || []) {
    if (!reg.stripe_checkout_session_id) continue
    const acct = accountingBySession.get(reg.stripe_checkout_session_id)
    if (!acct) continue
    if (String(reg.status || '') !== 'paid') {
      issues.push({
        event_id: `programs:paid_checkout_pending_reg:${reg.id}`,
        source: 'Checkout handoff',
        event_type: 'Paid program checkout with non-paid registration',
        status: 'mismatch',
        error_detail: `Program registration ${reg.id} has a completed Stripe checkout (${reg.stripe_checkout_session_id}) but registration status is "${reg.status}".`,
        occurred_at: acct.created_at,
        workspace_id: null,
      })
    }
    // Missing platform fee
    if (acct && Number(acct.platform_fee_cents || 0) === 0 && String(reg.status || '') === 'paid') {
      issues.push({
        event_id: `programs:missing_platform_fee:${reg.id}`,
        source: 'Stripe webhook',
        event_type: 'Program payment missing platform fee',
        status: 'missing_fee',
        error_detail: `Program registration ${reg.id} (session ${reg.stripe_checkout_session_id}) has platform_fee_cents = 0.`,
        occurred_at: acct.created_at,
        workspace_id: null,
      })
    }
  }

  // 2. Expired pending program registrations (>25h old, still pending)
  for (const reg of programRegsResult.data || []) {
    if (String(reg.status || '') !== 'pending') continue
    const age = now - new Date(reg.created_at || 0).getTime()
    if (age > EXPIRED_THRESHOLD_MS) {
      issues.push({
        event_id: `programs:expired_pending_reg:${reg.id}`,
        source: 'Checkout handoff',
        event_type: 'Expired pending program checkout',
        status: 'expired',
        error_detail: `Program registration ${reg.id} has been pending for over 25 hours (created ${new Date(reg.created_at).toISOString()}).`,
        occurred_at: reg.created_at,
        workspace_id: null,
      })
    }
  }

  // 3. Over-capacity programs
  const programRegCounts = new Map<string, number>()
  for (const reg of programRegsResult.data || []) {
    if (String(reg.status || '') !== 'paid') continue
    programRegCounts.set(reg.program_id, (programRegCounts.get(reg.program_id) || 0) + 1)
  }
  for (const program of programsResult.data || []) {
    const cap = Number(program.capacity || 0)
    if (cap <= 0) continue
    const paid = programRegCounts.get(program.id) || 0
    if (paid > cap) {
      issues.push({
        event_id: `programs:over_capacity:${program.id}`,
        source: 'Stripe webhook',
        event_type: 'Program over capacity',
        status: 'over_capacity',
        error_detail: `Program "${program.name}" (${program.id}) has ${paid} paid registrations exceeding capacity of ${cap}.`,
        occurred_at: new Date().toISOString(),
        workspace_id: null,
      })
    }
  }

  // 4. Closed program with pending checkouts
  for (const program of programsResult.data || []) {
    if (String(program.status || '') === 'active') continue
    const pendingCount = (programRegsResult.data || []).filter(
      r => r.program_id === program.id && String(r.status || '') === 'pending',
    ).length
    if (pendingCount > 0) {
      issues.push({
        event_id: `programs:closed_with_pending:${program.id}`,
        source: 'Checkout handoff',
        event_type: 'Closed program with active pending checkouts',
        status: 'closed_pending',
        error_detail: `Program "${program.name}" has status "${program.status}" but ${pendingCount} pending registrations remain payable.`,
        occurred_at: new Date().toISOString(),
        workspace_id: null,
      })
    }
  }

  // 5. Paid Stripe checkout with pending tryout registration
  for (const reg of tryoutRegsResult.data || []) {
    const sessionKey = reg.stripe_checkout_session_id
    if (!sessionKey) continue
    const acct = accountingBySession.get(sessionKey)
    if (!acct) continue
    if (String(reg.status || '') !== 'paid') {
      issues.push({
        event_id: `tryouts:paid_checkout_pending_reg:${reg.id}`,
        source: 'Checkout handoff',
        event_type: 'Paid tryout checkout with non-paid registration',
        status: 'mismatch',
        error_detail: `Tryout registration ${reg.id} has a completed Stripe checkout (${sessionKey}) but registration status is "${reg.status}".`,
        occurred_at: acct.created_at,
        workspace_id: null,
      })
    }
  }

  // 6. Paid tryout registrations with no PaymentIntent
  for (const reg of tryoutRegsResult.data || []) {
    if (String(reg.status || '') !== 'paid') continue
    if (!reg.stripe_payment_intent_id) {
      issues.push({
        event_id: `tryouts:paid_no_intent:${reg.id}`,
        source: 'Stripe webhook',
        event_type: 'Paid tryout registration missing PaymentIntent',
        status: 'missing_intent',
        error_detail: `Tryout registration ${reg.id} has status "paid" but no stripe_payment_intent_id recorded.`,
        occurred_at: reg.registered_at || new Date().toISOString(),
        workspace_id: null,
      })
    }
  }

  // 7. Over-capacity tryouts
  const tryoutRegCounts = new Map<string, number>()
  for (const reg of tryoutRegsResult.data || []) {
    if (!['paid', 'pending'].includes(String(reg.status || ''))) continue
    tryoutRegCounts.set(reg.tryout_id, (tryoutRegCounts.get(reg.tryout_id) || 0) + 1)
  }
  for (const tryout of tryoutsResult.data || []) {
    const cap = Number(tryout.max_participants || 0)
    if (cap <= 0) continue
    const occupied = tryoutRegCounts.get(tryout.id) || 0
    if (occupied > cap) {
      issues.push({
        event_id: `tryouts:over_capacity:${tryout.id}`,
        source: 'Stripe webhook',
        event_type: 'Tryout over capacity',
        status: 'over_capacity',
        error_detail: `Tryout "${tryout.title}" (${tryout.id}) has ${occupied} paid/pending registrations exceeding capacity of ${cap}.`,
        occurred_at: new Date().toISOString(),
        workspace_id: null,
      })
    }
  }

  // 8. Closed tryout with pending checkouts
  for (const tryout of tryoutsResult.data || []) {
    if (String(tryout.status || '') === 'open') continue
    const pendingCount = (tryoutRegsResult.data || []).filter(
      r => r.tryout_id === tryout.id && String(r.status || '') === 'pending',
    ).length
    if (pendingCount > 0) {
      issues.push({
        event_id: `tryouts:closed_with_pending:${tryout.id}`,
        source: 'Checkout handoff',
        event_type: 'Closed tryout with active pending checkouts',
        status: 'closed_pending',
        error_detail: `Tryout "${tryout.title}" has status "${tryout.status}" but ${pendingCount} pending registrations remain payable.`,
        occurred_at: new Date().toISOString(),
        workspace_id: null,
      })
    }
  }

  return issues
}

export async function GET(request: Request) {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const supabase = await createRouteHandlerClientCompat()
  const [feed, resolutions, billing, programTryoutIssues] = await Promise.all([
    supabase.rpc('admin_system_failure_feed'),
    supabaseAdmin.from('admin_ops_issue_resolutions').select('*').in('category', ['Payments','Stripe webhook','Checkout handoff','Billing failure','Programs','Tryouts']).order('updated_at', { ascending: false }),
    supabaseAdmin.from('platform_subscriptions').select('*').in('status', ['past_due', 'unpaid', 'incomplete', 'incomplete_expired']).order('updated_at', { ascending: false }).limit(200),
    detectProgramTryoutIssues(),
  ])
  if (feed.error) return NextResponse.json({ error: 'Unable to load Stripe reconciliation issues.' }, { status: 503 })

  const current = [
    ...(feed.data || []).filter(isStripeIssue),
    ...programTryoutIssues,
    ...(billing.data || []).map((row:any) => ({
      event_id: `billing:${row.id || row.stripe_subscription_id}`,
      source: 'Billing failure', event_type: row.tier || 'Subscription billing', status: row.status,
      error_detail: 'Stripe subscription requires attention.', occurred_at: row.updated_at, workspace_id: row.workspace_id,
    })),
  ]
  const resolutionMap = new Map((resolutions.data || []).map((row:any) => [row.issue_key, row]))
  const currentKeys = new Set(current.map((row:any) => row.event_id))
  const historical = (resolutions.data || []).filter((row:any) => !currentKeys.has(row.issue_key)).map((row:any) => ({
    event_id: row.issue_key, source: row.category || 'Payments', event_type: row.title,
    status: 'no longer present in live feed', error_detail: row.detail, occurred_at: row.updated_at, workspace_id: null,
  }))
  const classified = await filterAdminTestRows([...current, ...historical], shouldShowTestData(new URL(request.url).searchParams))
  const reviewerIds = Array.from(new Set((resolutions.data || []).flatMap((row:any) => [row.checked_by, row.resolved_by]).filter(Boolean)))
  const { data: reviewers } = reviewerIds.length
    ? await supabaseAdmin.from('profiles').select('id,full_name,email').in('id', reviewerIds)
    : { data: [] }
  const reviewerMap = new Map((reviewers || []).map((row:any) => [row.id, row.full_name || row.email || row.id]))
  const items = (await enrichWithWorkspace(classified.map((row:any) => {
    const review:any = resolutionMap.get(row.event_id) || null
    const reviewStatus = review?.status || 'open'
    const reviewerId = reviewStatus === 'resolved' ? review?.resolved_by : review?.checked_by
    return {
      ...row,
      review_status: reviewStatus,
      review_note: review?.resolution_note || null,
      reviewer_id: reviewerId || null,
      reviewer_name: reviewerId ? reviewerMap.get(reviewerId) || reviewerId : null,
      reviewed_at: reviewStatus === 'resolved' ? review?.resolved_at : review?.checked_at,
      severity: ['failed', 'past_due', 'unpaid', 'incomplete_expired'].includes(String(row.status || '').toLowerCase()) ? 'critical' : 'warning',
    }
  }))).sort((a:any,b:any) => Date.parse(b.occurred_at || '') - Date.parse(a.occurred_at || ''))
  const open = items.filter((row:any) => row.review_status === 'open')
  return NextResponse.json({
    sections: {
      open,
      checked: items.filter((row:any) => row.review_status === 'checked'),
      resolved: items.filter((row:any) => row.review_status === 'resolved'),
    },
    summary: {
      open: open.length,
      critical: open.filter((row:any) => row.severity === 'critical').length,
      warning: open.filter((row:any) => row.severity === 'warning').length,
      checked: items.filter((row:any) => row.review_status === 'checked').length,
      resolved: items.filter((row:any) => row.review_status === 'resolved').length,
    },
    authority: 'Operational review only. Stripe and backend webhooks remain authoritative.',
  })
}

export async function POST(request: Request) {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))
  const status = String(body.status || '').toLowerCase()
  if (!body.issue_key || !body.title || !['open','checked','resolved'].includes(status)) {
    return NextResponse.json({ error: 'issue_key, title, and a valid status are required.' }, { status: 400 })
  }
  const note = String(body.note || '').trim()
  if (!note) return NextResponse.json({ error: 'An admin review note is required.' }, { status: 400 })
  const supabase = await createRouteHandlerClientCompat()
  const { error } = await supabase.rpc('admin_set_ops_issue_status', {
    p_issue_key: String(body.issue_key), p_title: String(body.title), p_detail: String(body.detail || ''),
    p_category: 'Payments', p_status: status, p_note: note,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, status, financial_state_changed: false, webhook_authority_preserved: true })
}
