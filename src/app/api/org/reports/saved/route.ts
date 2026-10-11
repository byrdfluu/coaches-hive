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

const REPORT_TYPES = new Set([
  'overview',
  'attendance',
  'financial',
  'registrations',
  'programs',
  'compliance',
  'people',
])

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
    .from('org_saved_reports')
    .select('id, name, report_type, filters, season_id, created_by, created_at, updated_at')
    .eq('org_id', context.orgId)
    .order('updated_at', { ascending: false })

  if (error) return jsonError('Unable to load saved reports', 500)
  return NextResponse.json({ reports: data || [] })
}

export async function POST(request: Request) {
  const context = await getRequestContext()
  if ('response' in context) return context.response

  const body = await request.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const reportType = String(body.report_type || body.reportType || '').trim().toLowerCase()
  const seasonId = body.season_id || body.seasonId || null
  const filters = body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)
    ? body.filters
    : {}

  if (!name || name.length > 120) return jsonError('Enter a report name of 120 characters or fewer', 400)
  if (!REPORT_TYPES.has(reportType)) return jsonError('Choose a valid report type', 400)
  if (seasonId !== null && typeof seasonId !== 'string') return jsonError('Invalid season', 400)

  const { data, error } = await supabaseAdmin
    .from('org_saved_reports')
    .insert({
      org_id: context.orgId,
      created_by: context.session.user.id,
      name,
      report_type: reportType,
      filters,
      season_id: seasonId,
    })
    .select('id, name, report_type, filters, season_id, created_by, created_at, updated_at')
    .single()

  if (error) return jsonError('Unable to save report', 500)
  return NextResponse.json({ report: data }, { status: 201 })
}

export async function DELETE(request: Request) {
  const context = await getRequestContext()
  if ('response' in context) return context.response

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return jsonError('Report id is required', 400)

  const { data, error } = await supabaseAdmin
    .from('org_saved_reports')
    .delete()
    .eq('id', id)
    .eq('org_id', context.orgId)
    .select('id')
    .maybeSingle()

  if (error) return jsonError('Unable to delete saved report', 500)
  if (!data) return jsonError('Saved report not found', 404)
  return NextResponse.json({ deleted: true })
}
