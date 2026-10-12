import { NextRequest, NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const COACH_ROLES = ['coach', 'assistant_coach', 'admin', 'superadmin']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(COACH_ROLES)
  if (error || !session) return error

  const { id: athleteId } = await params
  const coachId = session.user.id
  const isAdmin = ['admin', 'superadmin'].includes(session.user.user_metadata?.role)
  const body = await req.json().catch(() => ({}))
  const requestedProfileId = typeof body?.athlete_profile_id === 'string' && body.athlete_profile_id.trim()
    ? body.athlete_profile_id.trim()
    : req.nextUrl.searchParams.get('athlete_profile_id')?.trim() || null
  const { data: athleteProfile } = requestedProfileId
    ? await supabaseAdmin.from('athlete_profiles').select('id').eq('id', requestedProfileId).eq('owner_user_id', athleteId).maybeSingle()
    : await supabaseAdmin.from('athlete_profiles').select('id').eq('owner_user_id', athleteId).eq('is_primary', true).limit(1).maybeSingle()
  if (requestedProfileId && !athleteProfile) return jsonError('Athlete profile not found', 404)

  if (!isAdmin) {
    const { data: link } = await supabaseAdmin
      .from('coach_athlete_links')
      .select('id')
      .eq('coach_id', coachId)
      .in('athlete_id', [athleteId, athleteProfile?.id].filter((value): value is string => Boolean(value)))
      .limit(1)
      .maybeSingle()
    if (!link) return jsonError('No access to this athlete', 403)
  }

  const rows: Array<{ metric_label: string; value: string; unit?: string; recorded_at?: string }> = body?.rows || []

  if (!Array.isArray(rows) || rows.length === 0) return jsonError('No rows provided', 400)
  if (rows.length > 500) return jsonError('Max 500 rows per import', 400)

  const valid = rows.filter((r) => r.metric_label?.trim() && r.value?.toString().trim())
  if (valid.length === 0) return jsonError('No valid rows — each row needs metric_label and value', 400)

  const inserts = valid.map((r) => ({
    athlete_id: athleteId,
    athlete_profile_id: athleteProfile?.id || null,
    coach_id: coachId,
    metric_label: r.metric_label.trim(),
    value: r.value.toString().trim(),
    unit: r.unit?.trim() || null,
    recorded_at: r.recorded_at || new Date().toISOString().split('T')[0],
    source: 'import' as const,
  }))

  const { error: insertError } = await supabaseAdmin
    .from('athlete_metric_snapshots')
    .insert(inserts)

  if (insertError) return jsonError(insertError.message, 500)

  // Upsert latest value per label into athlete_metrics
  const latestByLabel: Record<string, typeof inserts[0]> = {}
  for (const row of inserts) {
    const existing = latestByLabel[row.metric_label]
    if (!existing || row.recorded_at > existing.recorded_at) {
      latestByLabel[row.metric_label] = row
    }
  }

  const currentValues = Object.values(latestByLabel).map((r) => ({
      athlete_id: athleteId,
      athlete_profile_id: athleteProfile?.id || null,
      label: r.metric_label,
      value: r.value,
      unit: r.unit,
  }))
  let existingQuery = supabaseAdmin
    .from('athlete_metrics')
    .select('id,label')
    .eq('athlete_id', athleteId)
    .in('label', currentValues.map((row) => row.label))
  existingQuery = athleteProfile?.id
    ? existingQuery.eq('athlete_profile_id', athleteProfile.id)
    : existingQuery.is('athlete_profile_id', null)
  const { data: existingRows, error: existingError } = await existingQuery
  if (existingError) return jsonError(existingError.message, 500)
  const existingByLabel = new Map((existingRows || []).map((row) => [row.label, row.id]))
  const results = await Promise.all(currentValues.map((row) => {
    const id = existingByLabel.get(row.label)
    return id
      ? supabaseAdmin.from('athlete_metrics').update(row).eq('id', id)
      : supabaseAdmin.from('athlete_metrics').insert(row)
  }))
  const currentError = results.find((result) => result.error)?.error
  if (currentError) return jsonError(currentError.message, 500)

  return NextResponse.json({ imported: valid.length, skipped: rows.length - valid.length })
}
