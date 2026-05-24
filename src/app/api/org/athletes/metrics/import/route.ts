import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isOrgPlanActive, normalizeOrgStatus } from '@/lib/planRules'

export const dynamic = 'force-dynamic'

const ORG_STAFF_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'coach',
  'assistant_coach',
  'head_coach',
] as const

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) return jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => ({}))
  const { org_id, rows } = body || {}

  if (!org_id || !Array.isArray(rows) || rows.length === 0) {
    return jsonError('org_id and rows are required')
  }

  if (rows.length > 500) return jsonError('Maximum 500 rows per import')

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role, status')
    .eq('org_id', org_id)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (
    !membership ||
    membership.status === 'suspended' ||
    !ORG_STAFF_ROLES.includes(membership.role as (typeof ORG_STAFF_ROLES)[number])
  ) {
    return jsonError('Forbidden', 403)
  }

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('plan_status')
    .eq('org_id', org_id)
    .maybeSingle()

  if (!isOrgPlanActive(normalizeOrgStatus(orgSettings?.plan_status))) {
    return jsonError('Billing inactive.', 403)
  }

  const validRows = (
    rows as Array<{
      athlete_email?: string
      metric_label?: string
      value?: string | number
      unit?: string
      recorded_at?: string
    }>
  )
    .map((r) => ({
      athlete_email: String(r.athlete_email || '').trim().toLowerCase(),
      metric_label: String(r.metric_label || '').trim(),
      value: String(r.value ?? '').trim(),
      unit: r.unit?.trim() || null,
      recorded_at: r.recorded_at || new Date().toISOString().split('T')[0],
    }))
    .filter((r) => r.athlete_email && r.athlete_email.includes('@') && r.metric_label && r.value)

  if (validRows.length === 0) {
    return jsonError('No valid rows — each row needs athlete_email, metric_label, and value')
  }

  // Load all athlete members of this org with their profile emails
  const { data: orgAthleteMembers } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', org_id)
    .eq('role', 'athlete')

  const orgAthleteIds = (orgAthleteMembers || []).map((m: any) => m.user_id as string).filter(Boolean)

  if (orgAthleteIds.length === 0) {
    return jsonError('No athletes found in this organization', 400)
  }

  const athleteEmails = Array.from(new Set(validRows.map((r) => r.athlete_email)))

  const { data: athleteProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id, email')
    .in('id', orgAthleteIds)
    .in('email', athleteEmails)

  const athleteEmailMap = new Map<string, string>(
    (athleteProfiles || [])
      .filter((p: any) => p.email && p.id)
      .map((p: any) => [p.email as string, p.id as string]),
  )

  const inserts = validRows
    .filter((r) => athleteEmailMap.has(r.athlete_email))
    .map((r) => ({
      athlete_id: athleteEmailMap.get(r.athlete_email)!,
      coach_id: session.user.id,
      metric_label: r.metric_label,
      value: r.value,
      unit: r.unit,
      recorded_at: r.recorded_at,
      source: 'import' as const,
    }))

  const skipped = validRows.length - inserts.length

  if (inserts.length === 0) {
    return jsonError(
      'No athletes matched — make sure athlete emails belong to registered org members',
      400,
    )
  }

  const { error: insertError } = await supabaseAdmin
    .from('athlete_metric_snapshots')
    .insert(inserts)

  if (insertError) return jsonError(insertError.message, 500)

  // Upsert latest value per athlete+label into athlete_metrics
  const latestByKey: Record<string, (typeof inserts)[0]> = {}
  for (const row of inserts) {
    const key = `${row.athlete_id}:${row.metric_label}`
    const existing = latestByKey[key]
    if (!existing || row.recorded_at > existing.recorded_at) {
      latestByKey[key] = row
    }
  }

  await supabaseAdmin.from('athlete_metrics').upsert(
    Object.values(latestByKey).map((r) => ({
      athlete_id: r.athlete_id,
      label: r.metric_label,
      value: r.value,
      unit: r.unit,
    })),
    { onConflict: 'athlete_id,label' },
  )

  return NextResponse.json({ imported: inserts.length, skipped })
}