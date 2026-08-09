import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import { toCsv } from '@/lib/exportUtils'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'

export const dynamic = 'force-dynamic'
const datasets: Record<string, { table: string, order: string }> = {
  payment_accounting: { table: 'stripe_connect_payment_accounting', order: 'created_at' },
  platform_fees: { table: 'stripe_connect_payment_accounting', order: 'created_at' },
  subscriptions: { table: 'platform_subscriptions', order: 'updated_at' },
  refunds: { table: 'payment_refund_requests', order: 'requested_at' },
  audit_logs: { table: 'admin_audit_log', order: 'created_at' },
  workspace_reconciliation: { table: 'workspace_reconciliation_queue', order: 'created_at' },
}

export async function POST(request: Request) {
  const auth = await requireSuperadminApi(); if (auth.error || !auth.user) return auth.error
  const body = await request.json().catch(() => ({})), dataset = String(body.dataset || '')
  if (![...Object.keys(datasets), 'waiver_document_proofs', 'organization_engagement'].includes(dataset)) return NextResponse.json({ error: 'Unsupported export dataset' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('admin_export_jobs').insert({ requested_by: auth.user.id, dataset, filters: body.filters || {} }).select().single()
  if (error) return NextResponse.json({ error: 'Deploy 20260808051000_superadmin_export_jobs.sql first.' }, { status: 503 })
  await logAdminAction({ action: 'admin.export.created', actorId: auth.user.id, actorEmail: auth.user.email, targetType: 'admin_export_job', targetId: data.id, metadata: { dataset, filters: body.filters || {}, expires_at: data.expires_at } })
  return NextResponse.json({ job: data, download_url: `/api/admin/exports?job_id=${data.id}` })
}

export async function GET(request: Request) {
  const auth = await requireSuperadminApi(); if (auth.error || !auth.user) return auth.error
  const jobId = new URL(request.url).searchParams.get('job_id')
  if (!jobId) return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
  const { data: job } = await supabaseAdmin.from('admin_export_jobs').select('*').eq('id', jobId).eq('requested_by', auth.user.id).maybeSingle()
  if (!job) return NextResponse.json({ error: 'Export not found' }, { status: 404 })
  if (Date.parse(job.expires_at) <= Date.now()) { await supabaseAdmin.from('admin_export_jobs').update({ status: 'expired' }).eq('id', job.id); return NextResponse.json({ error: 'Export expired' }, { status: 410 }) }
  let rows: any[] = []
  if (job.dataset === 'organization_engagement') {
    const supabase = await createRouteHandlerClientCompat(); const { data } = await supabase.rpc('admin_organization_engagement'); rows = data || []
  } else if (job.dataset === 'waiver_document_proofs') {
    const [waivers, documents] = await Promise.all([supabaseAdmin.from('coach_waiver_assignments').select('*').limit(5000), supabaseAdmin.from('org_document_completions').select('*').limit(5000)])
    rows = [...(waivers.data || []).map((r: any) => ({ proof_type: 'waiver', ...r })), ...(documents.data || []).map((r: any) => ({ proof_type: 'document', ...r }))]
  } else {
    const config = datasets[job.dataset]; let offset = 0
    while (offset < 25000) {
      let query: any = supabaseAdmin.from(config.table).select('*').order(config.order, { ascending: false }).range(offset, offset + 999)
      const filters = job.filters || {}; if (filters.workspace_id) query = query.eq('workspace_id', filters.workspace_id)
      if (filters.from) query = query.gte(config.order, `${filters.from}T00:00:00.000Z`); if (filters.to) query = query.lte(config.order, `${filters.to}T23:59:59.999Z`)
      const { data, error } = await query; if (error) return NextResponse.json({ error: 'Export query failed' }, { status: 500 })
      rows.push(...(data || [])); if (!data || data.length < 1000) break; offset += 1000
    }
  }
  if (job.dataset === 'platform_fees') rows = rows.map((r: any) => ({ id: r.id, workspace_id: r.workspace_id, checkout_type: r.checkout_type, platform_fee_cents: r.platform_fee_cents, fee_rate: r.fee_rate, created_at: r.created_at, stripe_payment_intent_id: r.stripe_payment_intent_id }))
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const csv = toCsv([columns, ...rows.map((r) => columns.map((c) => typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c]))])
  await logAdminAction({ action: 'admin.export.downloaded', actorId: auth.user.id, actorEmail: auth.user.email, targetType: 'admin_export_job', targetId: job.id, metadata: { dataset: job.dataset, row_count: rows.length } })
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${job.dataset}-${new Date().toISOString().slice(0,10)}.csv"`, 'Cache-Control': 'private, no-store' } })
}
