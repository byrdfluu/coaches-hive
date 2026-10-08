import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { enrichWithWorkspace } from '@/lib/workspaceAdmin'
import { filterAdminTestRows, shouldShowTestData } from '@/lib/adminTestData'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireSuperadminApi(); if (auth.error) return auth.error
  const supabase = await createRouteHandlerClientCompat()
  const [feed, resolutions, apple, billing, support] = await Promise.all([
    supabase.rpc('admin_system_failure_feed'),
    supabaseAdmin.from('admin_ops_issue_resolutions').select('*'),
    supabaseAdmin.from('app_store_server_notifications').select('*').in('status', ['failed', 'processing']).order('created_at', { ascending: false }).limit(200),
    supabaseAdmin.from('platform_subscriptions').select('*').in('status', ['past_due', 'unpaid', 'incomplete', 'incomplete_expired']).order('updated_at', { ascending: false }).limit(200),
    supabaseAdmin.from('support_tickets').select('*').in('status', ['open', 'in_progress']).order('created_at', { ascending: false }).limit(200),
  ])
  if (feed.error) return NextResponse.json({ error: 'Deploy the superadmin insights migration first.' }, { status: 503 })
  const extra = [
    ...(apple.data || []).map((r: any) => ({ event_id: `apple:${r.notification_uuid}`, source: 'Apple notification', event_type: r.notification_type, status: r.status, error_detail: r.last_error, occurred_at: r.created_at, workspace_id: r.workspace_id })),
    ...(billing.data || []).map((r: any) => ({ event_id: `billing:${r.id || r.stripe_subscription_id}`, source: 'Billing failure', event_type: r.tier, status: r.status, error_detail: null, occurred_at: r.updated_at, workspace_id: r.workspace_id })),
    ...(support.data || []).map((r: any) => ({ event_id: `support:${r.id}`, source: 'Support', event_type: r.subject, status: r.priority || r.status, error_detail: r.description, occurred_at: r.created_at, workspace_id: r.workspace_id })),
  ]
  const resolutionMap = new Map((resolutions.data || []).map((r: any) => [r.issue_key, r]))
  const items = await filterAdminTestRows([...(feed.data || []), ...extra].map((r: any) => ({ ...r, resolution: resolutionMap.get(r.event_id) || null })).sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)), shouldShowTestData(new URL(request.url).searchParams))
  return NextResponse.json({ items: await enrichWithWorkspace(items), summary: { open: items.filter(i => !i.resolution || i.resolution.status === 'open').length, checked: items.filter(i => i.resolution?.status === 'checked').length, resolved: items.filter(i => i.resolution?.status === 'resolved').length } })
}

export async function POST(request: Request) {
  const auth = await requireSuperadminApi(); if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))
  const supabase = await createRouteHandlerClientCompat()
  const status = String(body.status || '').toLowerCase()
  if (!['open','checked','resolved'].includes(status)) return NextResponse.json({ error: 'A valid issue status is required' }, { status: 400 })

  const requestedIssues = Array.isArray(body.issues)
    ? body.issues
    : body.issue_key && body.title
      ? [body]
      : []
  if (!requestedIssues.length || requestedIssues.length > 500) {
    return NextResponse.json({ error: 'Provide between 1 and 500 issues.' }, { status: 400 })
  }

  const issues = requestedIssues.map((issue: any) => ({
    issue_key: String(issue?.issue_key || '').trim(),
    title: String(issue?.title || '').trim(),
    detail: String(issue?.detail || ''),
    category: String(issue?.category || 'Operations'),
  }))
  if (issues.some((issue: any) => !issue.issue_key || !issue.title)) {
    return NextResponse.json({ error: 'Every issue requires an issue_key and title.' }, { status: 400 })
  }

  const note = String(body.note || '').trim()
  if (!note) return NextResponse.json({ error: 'A review note is required.' }, { status: 400 })

  const failures: string[] = []
  for (let index = 0; index < issues.length; index += 20) {
    const batch = issues.slice(index, index + 20)
    const results = await Promise.all(batch.map((issue: { issue_key: string; title: string; detail: string; category: string }) => supabase.rpc('admin_set_ops_issue_status', {
      p_issue_key: issue.issue_key,
      p_title: issue.title,
      p_detail: issue.detail,
      p_category: issue.category,
      p_status: status,
      p_note: note,
    })))
    results.forEach((result, resultIndex) => {
      if (result.error) failures.push(batch[resultIndex].issue_key)
    })
  }
  if (failures.length) {
    return NextResponse.json({ error: `Unable to update ${failures.length} issue${failures.length === 1 ? '' : 's'}.`, failed_issue_keys: failures }, { status: 400 })
  }
  return NextResponse.json({ ok: true, updated: issues.length, financial_state_changed: false })
}
