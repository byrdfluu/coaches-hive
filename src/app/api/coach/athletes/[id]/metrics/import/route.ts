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

  if (!isAdmin) {
    const { data: link } = await supabaseAdmin
      .from('coach_athlete_links')
      .select('id')
      .eq('coach_id', coachId)
      .eq('athlete_id', athleteId)
      .maybeSingle()
    if (!link) return jsonError('No access to this athlete', 403)
  }

  const body = await req.json().catch(() => ({}))
  const rows: Array<{ metric_label: string; value: string; unit?: string; recorded_at?: string }> = body?.rows || []

  if (!Array.isArray(rows) || rows.length === 0) return jsonError('No rows provided', 400)
  if (rows.length > 500) return jsonError('Max 500 rows per import', 400)

  const valid = rows.filter((r) => r.metric_label?.trim() && r.value?.toString().trim())
  if (valid.length === 0) return jsonError('No valid rows — each row needs metric_label and value', 400)

  const inserts = valid.map((r) => ({
    athlete_id: athleteId,
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

  await supabaseAdmin.from('athlete_metrics').upsert(
    Object.values(latestByLabel).map((r) => ({
      athlete_id: athleteId,
      label: r.metric_label,
      value: r.value,
      unit: r.unit,
    })),
    { onConflict: 'athlete_id,label' }
  )

  return NextResponse.json({ imported: valid.length, skipped: rows.length - valid.length })
}
