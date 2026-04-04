import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
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

export async function GET() {
  const { session, error } = await getSessionRole(ALLOWED_ROLES)
  if (error || !session) return error

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!membership?.org_id) {
    return jsonError('Organization not found', 404)
  }

  const { data: schedule } = await supabaseAdmin
    .from('org_report_schedules')
    .select('id, org_id, enabled, cadence, day_of_week, day_of_month, time_of_day, recipients')
    .eq('org_id', membership.org_id)
    .maybeSingle()

  return NextResponse.json(schedule || {})
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ALLOWED_ROLES)
  if (error || !session) return error

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!membership?.org_id) {
    return jsonError('Organization not found', 404)
  }

  const body = await request.json().catch(() => ({}))
  const payload = {
    org_id: membership.org_id,
    enabled: Boolean(body.enabled),
    cadence: body.cadence === 'monthly' ? 'monthly' : 'weekly',
    day_of_week: Number(body.dayOfWeek ?? 1),
    day_of_month: Number(body.dayOfMonth ?? 1),
    time_of_day: String(body.timeOfDay || '09:00'),
    recipients: Array.isArray(body.recipients) ? body.recipients : [],
  }

  const { data, error: upsertError } = await supabaseAdmin
    .from('org_report_schedules')
    .upsert(payload, { onConflict: 'org_id' })
    .select('id, org_id, enabled, cadence, day_of_week, day_of_month, time_of_day, recipients')
    .maybeSingle()

  if (upsertError) {
    return jsonError('Unable to save schedule', 500)
  }

  return NextResponse.json(data)
}
