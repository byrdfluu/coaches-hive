import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveActiveOrganizationId } from '@/lib/activeOrganization'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
]
const METRICS = new Set([
  'attendance_rate',
  'payment_completion',
  'outstanding_balance',
  'missing_paperwork',
  'registrations',
  'program_capacity',
  'active_athletes',
])
const COMPARISONS = new Set(['below', 'above', 'equals'])

async function getRequestContext() {
  const { session, error } = await getSessionRole(ALLOWED_ROLES)
  if (error || !session) return { response: error }
  const orgId = await resolveActiveOrganizationId(session.user.id)
  if (!orgId) return { response: jsonError('Organization not found', 404) }
  return { session, orgId }
}

export async function GET() {
  const context = await getRequestContext()
  if ('response' in context) return context.response

  const { data, error } = await supabaseAdmin
    .from('org_report_alerts')
    .select('id, metric, comparison, threshold, is_active, last_triggered_at, created_by, created_at, updated_at')
    .eq('org_id', context.orgId)
    .order('updated_at', { ascending: false })

  if (error) return jsonError('Unable to load report alerts', 500)
  return NextResponse.json({ alerts: data || [] })
}

export async function POST(request: Request) {
  const context = await getRequestContext()
  if ('response' in context) return context.response

  const body = await request.json().catch(() => ({}))
  const metric = String(body.metric || '').trim().toLowerCase()
  const comparison = String(body.comparison || '').trim().toLowerCase()
  const threshold = Number(body.threshold)

  if (!METRICS.has(metric)) return jsonError('Choose a valid alert metric', 400)
  if (!COMPARISONS.has(comparison)) return jsonError('Choose a valid alert comparison', 400)
  if (!Number.isFinite(threshold) || threshold < 0) return jsonError('Enter a valid threshold', 400)

  const { data, error } = await supabaseAdmin
    .from('org_report_alerts')
    .insert({
      org_id: context.orgId,
      created_by: context.session.user.id,
      metric,
      comparison,
      threshold,
      is_active: body.is_active !== false,
    })
    .select('id, metric, comparison, threshold, is_active, last_triggered_at, created_by, created_at, updated_at')
    .single()

  if (error) return jsonError('Unable to create report alert', 500)
  return NextResponse.json({ alert: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const context = await getRequestContext()
  if ('response' in context) return context.response

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!id || typeof body.is_active !== 'boolean') return jsonError('Alert id and active state are required', 400)

  const { data, error } = await supabaseAdmin
    .from('org_report_alerts')
    .update({ is_active: body.is_active })
    .eq('id', id)
    .eq('org_id', context.orgId)
    .select('id, metric, comparison, threshold, is_active, last_triggered_at, created_by, created_at, updated_at')
    .maybeSingle()

  if (error) return jsonError('Unable to update report alert', 500)
  if (!data) return jsonError('Report alert not found', 404)
  return NextResponse.json({ alert: data })
}

export async function DELETE(request: Request) {
  const context = await getRequestContext()
  if ('response' in context) return context.response

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return jsonError('Alert id is required', 400)

  const { data, error } = await supabaseAdmin
    .from('org_report_alerts')
    .delete()
    .eq('id', id)
    .eq('org_id', context.orgId)
    .select('id')
    .maybeSingle()

  if (error) return jsonError('Unable to delete report alert', 500)
  if (!data) return jsonError('Report alert not found', 404)
  return NextResponse.json({ deleted: true })
}
