import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; exerciseId: string } }
) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  if (!body) return jsonError('Invalid request body.', 400)

  const updates: Record<string, unknown> = {}
  if (typeof body.position === 'number') updates.position = body.position
  if ('sets' in body) updates.sets = body.sets ?? null
  if ('reps' in body) updates.reps = body.reps ?? null
  if ('rest_seconds' in body) updates.rest_seconds = body.rest_seconds ?? null
  if ('notes' in body) updates.notes = body.notes ?? null

  const { data, error: updateError } = await supabaseAdmin
    .from('coach_program_exercises')
    .update(updates)
    .eq('program_id', params.id)
    .eq('exercise_id', params.exerciseId)
    .eq('coach_id', session.user.id)
    .select()
    .single()

  if (updateError) return jsonError(updateError.message, 500)

  return NextResponse.json({ entry: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; exerciseId: string } }
) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const { error: deleteError } = await supabaseAdmin
    .from('coach_program_exercises')
    .delete()
    .eq('program_id', params.id)
    .eq('exercise_id', params.exerciseId)
    .eq('coach_id', session.user.id)

  if (deleteError) return jsonError(deleteError.message, 500)

  return NextResponse.json({ ok: true })
}
