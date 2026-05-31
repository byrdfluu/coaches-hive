import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { EXERCISE_TRACKING_FIELD_TYPES } from '@/lib/programConstants'

export const dynamic = 'force-dynamic'

const validateTrackingFields = (fields: unknown): string[] => {
  if (!Array.isArray(fields) || fields.length === 0) return ['Reps']
  const allowed = new Set<string>(EXERCISE_TRACKING_FIELD_TYPES)
  const valid = fields.filter((f) => typeof f === 'string' && (allowed.has(f) || f.trim().length > 0))
  return valid.length > 0 ? valid : ['Reps']
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const { id } = await params

  const { data, error: fetchError } = await supabaseAdmin
    .from('coach_exercises')
    .select('*')
    .eq('id', id)
    .eq('coach_id', session.user.id)
    .maybeSingle()

  if (fetchError) return jsonError(fetchError.message, 500)
  if (!data) return jsonError('Exercise not found.', 404)

  return NextResponse.json({ exercise: data })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const { id } = await params

  const { data: existing } = await supabaseAdmin
    .from('coach_exercises')
    .select('id')
    .eq('id', id)
    .eq('coach_id', session.user.id)
    .maybeSingle()

  if (!existing) return jsonError('Exercise not found.', 404)

  const body = await request.json().catch(() => null)
  if (!body) return jsonError('Invalid request body.', 400)

  const updates: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if ('category' in body) updates.category = body.category || null
  if ('modality' in body) updates.modality = body.modality || null
  if ('muscle_group' in body) updates.muscle_group = body.muscle_group || null
  if ('movement_pattern' in body) updates.movement_pattern = body.movement_pattern || null
  if ('instructions' in body) updates.instructions = body.instructions || null
  if ('video_url' in body) updates.video_url = body.video_url || null
  if ('tracking_fields' in body) updates.tracking_fields = validateTrackingFields(body.tracking_fields)
  if ('photo_paths' in body) updates.photo_paths = Array.isArray(body.photo_paths) ? body.photo_paths : []
  if ('thumbnail_path' in body) updates.thumbnail_path = body.thumbnail_path || null

  const { data, error: updateError } = await supabaseAdmin
    .from('coach_exercises')
    .update(updates)
    .eq('id', id)
    .eq('coach_id', session.user.id)
    .select()
    .single()

  if (updateError) return jsonError(updateError.message, 500)

  return NextResponse.json({ exercise: data })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const { id } = await params

  const { data: usages } = await supabaseAdmin
    .from('coach_program_exercises')
    .select('program_id, coach_programs!inner(title, status)')
    .eq('exercise_id', id)
    .eq('coach_id', session.user.id)

  const activeUsages = (usages || []).filter(
    (u: any) => u.coach_programs?.status === 'active'
  )

  if (activeUsages.length > 0) {
    const titles = activeUsages.map((u: any) => u.coach_programs?.title).filter(Boolean).join(', ')
    return jsonError(
      `This exercise is used in active program(s): ${titles}. Deactivate those programs first.`,
      409
    )
  }

  const { error: deleteError } = await supabaseAdmin
    .from('coach_exercises')
    .delete()
    .eq('id', id)
    .eq('coach_id', session.user.id)

  if (deleteError) return jsonError(deleteError.message, 500)

  return NextResponse.json({ ok: true })
}
