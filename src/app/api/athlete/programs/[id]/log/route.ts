import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { id } = await params

  const { data, error: fetchError } = await supabaseAdmin
    .from('athlete_exercise_logs')
    .select('id, exercise_id, logged_at, sets_data, notes')
    .eq('program_id', id)
    .eq('athlete_id', session.user.id)
    .order('logged_at', { ascending: false })

  if (fetchError) return jsonError(fetchError.message, 500)

  const byExercise: Record<string, any[]> = {}
  for (const row of (data ?? []) as any[]) {
    if (!byExercise[row.exercise_id]) byExercise[row.exercise_id] = []
    byExercise[row.exercise_id].push(row)
  }

  return NextResponse.json({ logs: byExercise })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { id } = await params
  const athleteId = session.user.id

  const { data: program } = await supabaseAdmin
    .from('coach_programs')
    .select('coach_id, product_id')
    .eq('id', id)
    .maybeSingle()

  if (!program?.product_id) return jsonError('Program not found.', 404)

  const { count } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', program.product_id)
    .eq('athlete_id', athleteId)
    .in('status', ['paid', 'active', 'approved'])

  if ((count ?? 0) === 0) return jsonError('Access denied.', 403)

  const body = await request.json().catch(() => null)
  const exerciseId = typeof body?.exercise_id === 'string' ? body.exercise_id.trim() : ''
  if (!exerciseId) return jsonError('exercise_id is required.', 400)

  const { data: cpe } = await supabaseAdmin
    .from('coach_program_exercises')
    .select('id')
    .eq('program_id', id)
    .eq('exercise_id', exerciseId)
    .maybeSingle()

  if (!cpe) return jsonError('Exercise not found in this program.', 404)

  const { data, error: insertError } = await supabaseAdmin
    .from('athlete_exercise_logs')
    .insert({
      athlete_id: athleteId,
      program_id: id,
      exercise_id: exerciseId,
      coach_id: program.coach_id,
      sets_data: Array.isArray(body?.sets_data) ? body.sets_data : [],
      notes: body?.notes ?? null,
    })
    .select()
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  return NextResponse.json({ log: data }, { status: 201 })
}
