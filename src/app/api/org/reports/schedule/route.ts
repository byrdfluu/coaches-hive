import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveActiveOrganizationId } from '@/lib/activeOrganization'
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

function nextDeliveryAt(cadence: string, dayOfWeek: number, dayOfMonth: number, timeOfDay: string) {
  const [hours, minutes] = timeOfDay.split(':').map((value) => Number(value) || 0)
  const next = new Date()
  next.setSeconds(0, 0)
  next.setHours(hours, minutes, 0, 0)
  if (cadence === 'monthly') {
    next.setDate(Math.max(1, Math.min(28, dayOfMonth)))
    if (next.getTime() <= Date.now()) next.setMonth(next.getMonth() + 1)
  } else {
    const daysAhead = (dayOfWeek - next.getDay() + 7) % 7
    next.setDate(next.getDate() + daysAhead)
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 7)
  }
  return next.toISOString()
}

export async function GET() {
  const { session, error } = await getSessionRole(ALLOWED_ROLES)
  if (error || !session) return error

  const activeOrgId = await resolveActiveOrganizationId(session.user.id)
  const membership = activeOrgId ? { org_id: activeOrgId } : null

  if (!membership?.org_id) {
    return jsonError('Organization not found', 404)
  }

  const { data: schedule } = await supabaseAdmin
    .from('org_report_schedules')
    .select('id, org_id, enabled, cadence, day_of_week, day_of_month, time_of_day, recipients, saved_report_id, season_id, next_delivery_at, is_active')
    .eq('org_id', membership.org_id)
    .maybeSingle()

  return NextResponse.json(schedule || {})
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ALLOWED_ROLES)
  if (error || !session) return error

  const activeOrgId = await resolveActiveOrganizationId(session.user.id)
  const membership = activeOrgId ? { org_id: activeOrgId } : null

  if (!membership?.org_id) {
    return jsonError('Organization not found', 404)
  }

  const body = await request.json().catch(() => ({}))
  const cadence = body.cadence === 'monthly' ? 'monthly' : 'weekly'
  const dayOfWeek = Math.max(0, Math.min(6, Number(body.dayOfWeek ?? 1)))
  const dayOfMonth = Math.max(1, Math.min(28, Number(body.dayOfMonth ?? 1)))
  const timeOfDay = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.timeOfDay || ''))
    ? String(body.timeOfDay)
    : '09:00'
  const reportName = String(body.name || 'Automated organization report').trim().slice(0, 120)
  const reportType = ['overview', 'attendance', 'financial', 'registrations', 'programs', 'compliance', 'people']
    .includes(String(body.reportType || '').toLowerCase())
    ? String(body.reportType).toLowerCase()
    : 'overview'
  const filters = body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)
    ? body.filters
    : {}
  const seasonId = typeof body.seasonId === 'string' && body.seasonId ? body.seasonId : null

  const { data: existingSchedule } = await supabaseAdmin
    .from('org_report_schedules')
    .select('saved_report_id')
    .eq('org_id', membership.org_id)
    .maybeSingle()

  let savedReportId = existingSchedule?.saved_report_id || null
  if (savedReportId) {
    const { error: savedUpdateError } = await supabaseAdmin
      .from('org_saved_reports')
      .update({ name: reportName, report_type: reportType, filters, season_id: seasonId })
      .eq('id', savedReportId)
      .eq('org_id', membership.org_id)
    if (savedUpdateError) return jsonError('Unable to update the scheduled report', 500)
  } else {
    const { data: savedReport, error: savedInsertError } = await supabaseAdmin
      .from('org_saved_reports')
      .insert({
        org_id: membership.org_id,
        created_by: session.user.id,
        name: reportName,
        report_type: reportType,
        filters,
        season_id: seasonId,
      })
      .select('id')
      .single()
    if (savedInsertError || !savedReport) return jsonError('Unable to create the scheduled report', 500)
    savedReportId = savedReport.id
  }

  const payload = {
    org_id: membership.org_id,
    created_by: session.user.id,
    saved_report_id: savedReportId,
    season_id: seasonId,
    enabled: Boolean(body.enabled),
    is_active: Boolean(body.enabled),
    cadence,
    day_of_week: dayOfWeek,
    day_of_month: dayOfMonth,
    time_of_day: timeOfDay,
    recipients: Array.isArray(body.recipients) ? body.recipients : [],
    next_delivery_at: body.enabled ? nextDeliveryAt(cadence, dayOfWeek, dayOfMonth, timeOfDay) : null,
  }

  const { data, error: upsertError } = await supabaseAdmin
    .from('org_report_schedules')
    .upsert(payload, { onConflict: 'org_id' })
    .select('id, org_id, enabled, cadence, day_of_week, day_of_month, time_of_day, recipients, saved_report_id, season_id, next_delivery_at, is_active')
    .maybeSingle()

  if (upsertError) {
    return jsonError('Unable to save schedule', 500)
  }

  return NextResponse.json(data)
}
