import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { filterAdminTestRows, shouldShowTestData } from '@/lib/adminTestData'
import { enrichWithWorkspace } from '@/lib/workspaceAdmin'

export const dynamic = 'force-dynamic'

const isStripeIssue = (row: any) => ['Stripe webhook', 'Checkout handoff', 'Billing failure'].includes(String(row.source || ''))

export async function GET(request: Request) {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const supabase = await createRouteHandlerClientCompat()
  const [feed, resolutions, billing] = await Promise.all([
    supabase.rpc('admin_system_failure_feed'),
    supabaseAdmin.from('admin_ops_issue_resolutions').select('*').in('category', ['Payments','Stripe webhook','Checkout handoff','Billing failure']).order('updated_at', { ascending: false }),
    supabaseAdmin.from('platform_subscriptions').select('*').in('status', ['past_due', 'unpaid', 'incomplete', 'incomplete_expired']).order('updated_at', { ascending: false }).limit(200),
  ])
  if (feed.error) return NextResponse.json({ error: 'Unable to load Stripe reconciliation issues.' }, { status: 503 })

  const current = [
    ...(feed.data || []).filter(isStripeIssue),
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
