import { NextRequest, NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const athleteId = session.user.id
  const metricLabel = req.nextUrl.searchParams.get('metric_label')

  let query = supabaseAdmin
    .from('athlete_metric_snapshots')
    .select('id, metric_label, value, unit, recorded_at, source, notes, created_at')
    .eq('athlete_id', athleteId)
    .order('recorded_at', { ascending: true })

  if (metricLabel) {
    query = query.eq('metric_label', metricLabel)
  }

  const { data, error: dbError } = await query
  if (dbError) return jsonError(dbError.message, 500)

  const grouped: Record<string, typeof data> = {}
  for (const row of data || []) {
    if (!grouped[row.metric_label]) grouped[row.metric_label] = []
    grouped[row.metric_label]!.push(row)
  }

  return NextResponse.json({ snapshots: data || [], grouped })
}

export async function POST(req: NextRequest) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const athleteId = session.user.id
  const body = await req.json().catch(() => ({}))
  const { metric_label, value, unit, recorded_at, notes } = body

  if (!metric_label?.trim() || !value?.toString().trim()) {
    return jsonError('metric_label and value are required', 400)
  }

  const { data: snapshot, error: insertError } = await supabaseAdmin
    .from('athlete_metric_snapshots')
    .insert({
      athlete_id: athleteId,
      coach_id: null,
      metric_label: metric_label.trim(),
      value: value.toString().trim(),
      unit: unit?.trim() || null,
      recorded_at: recorded_at || new Date().toISOString().split('T')[0],
      source: 'athlete_self',
      notes: notes?.trim() || null,
    })
    .select()
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  // Sync to athlete_metrics current-value table
  await supabaseAdmin
    .from('athlete_metrics')
    .upsert({
      athlete_id: athleteId,
      label: metric_label.trim(),
      value: value.toString().trim(),
      unit: unit?.trim() || null,
    }, { onConflict: 'athlete_id,label' })

  return NextResponse.json({ snapshot })
}
