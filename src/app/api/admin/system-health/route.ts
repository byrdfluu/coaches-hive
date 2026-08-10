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
  if (!body.issue_key || !body.title) return NextResponse.json({ error: 'issue_key and title are required' }, { status: 400 })
  const supabase = await createRouteHandlerClientCompat()
  const status = String(body.status || '').toLowerCase()
  if (!['open','checked','resolved'].includes(status)) return NextResponse.json({ error: 'A valid issue status is required' }, { status: 400 })
  const { error } = await supabase.rpc('admin_set_ops_issue_status', {
    p_issue_key: String(body.issue_key), p_title: String(body.title), p_detail: String(body.detail || ''),
    p_category: String(body.category || 'Operations'), p_status: status, p_note: String(body.note || ''),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, financial_state_changed: false })
}
