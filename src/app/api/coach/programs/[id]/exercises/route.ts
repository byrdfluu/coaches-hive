import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const { id } = await params

  const { data: program } = await supabaseAdmin
    .from('coach_programs')
    .select('id')
    .eq('id', id)
    .eq('coach_id', session.user.id)
    .maybeSingle()

  if (!program) return jsonError('Program not found.', 404)

  const body = await request.json().catch(() => null)
  const exerciseId = typeof body?.exercise_id === 'string' ? body.exercise_id.trim() : ''
  if (!exerciseId) return jsonError('exercise_id is required.', 400)

  const { data: exercise } = await supabaseAdmin
    .from('coach_exercises')
    .select('id')
    .eq('id', exerciseId)
    .eq('coach_id', session.user.id)
    .maybeSingle()

  if (!exercise) return jsonError('Exercise not found.', 404)

  const { data: existing } = await supabaseAdmin
    .from('coach_program_exercises')
    .select('position')
    .eq('program_id', id)
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition = typeof body?.position === 'number'
    ? body.position
    : ((existing?.[0] as any)?.position ?? -1) + 1

  const { data, error: insertError } = await supabaseAdmin
    .from('coach_program_exercises')
    .insert({
      program_id: id,
      exercise_id: exerciseId,
      coach_id: session.user.id,
      position: nextPosition,
      sets: body?.sets ?? null,
      reps: body?.reps ?? null,
      rest_seconds: body?.rest_seconds ?? null,
      notes: body?.notes ?? null,
    })
    .select()
    .single()

  if (insertError) {
    if (insertError.code === '23505') return jsonError('This exercise is already in the program.', 409)
    return jsonError(insertError.message, 500)
  }

  return NextResponse.json({ entry: data }, { status: 201 })
}
