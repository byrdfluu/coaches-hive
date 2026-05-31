import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const { data: program, error: fetchError } = await supabaseAdmin
    .from('coach_programs')
    .select('*')
    .eq('id', params.id)
    .eq('coach_id', session.user.id)
    .maybeSingle()

  if (fetchError) return jsonError(fetchError.message, 500)
  if (!program) return jsonError('Program not found.', 404)

  const { data: cpeRows } = await supabaseAdmin
    .from('coach_program_exercises')
    .select('id, position, sets, reps, rest_seconds, notes, exercise_id, coach_exercises!inner(id, name, category, modality, muscle_group, movement_pattern, instructions, video_url, tracking_fields, photo_paths, thumbnail_path)')
    .eq('program_id', params.id)
    .eq('coach_id', session.user.id)
    .order('position', { ascending: true })

  const exercises = (cpeRows ?? []).map((row: any) => ({
    cpe_id: row.id,
    exercise_id: row.exercise_id,
    position: row.position,
    sets: row.sets,
    reps: row.reps,
    rest_seconds: row.rest_seconds,
    notes: row.notes,
    ...row.coach_exercises,
  }))

  return NextResponse.json({ program, exercises })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const { data: existing } = await supabaseAdmin
    .from('coach_programs')
    .select('id')
    .eq('id', params.id)
    .eq('coach_id', session.user.id)
    .maybeSingle()

  if (!existing) return jsonError('Program not found.', 404)

  const body = await request.json().catch(() => null)
  if (!body) return jsonError('Invalid request body.', 400)

  const updates: Record<string, unknown> = {}
  if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim()
  if ('description' in body) updates.description = body.description || null
  if ('duration_label' in body) updates.duration_label = body.duration_label || null
  if ('status' in body && ['draft', 'active', 'inactive'].includes(body.status)) updates.status = body.status
  if ('product_id' in body) updates.product_id = body.product_id || null
  if ('thumbnail_path' in body) updates.thumbnail_path = body.thumbnail_path || null

  const { data, error: updateError } = await supabaseAdmin
    .from('coach_programs')
    .update(updates)
    .eq('id', params.id)
    .eq('coach_id', session.user.id)
    .select()
    .single()

  if (updateError) return jsonError(updateError.message, 500)

  return NextResponse.json({ program: data })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  // Check for paid orders linked to this program's product
  const { data: program } = await supabaseAdmin
    .from('coach_programs')
    .select('product_id')
    .eq('id', params.id)
    .eq('coach_id', session.user.id)
    .maybeSingle()

  if (!program) return jsonError('Program not found.', 404)

  if (program.product_id) {
    const { count } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', program.product_id)
      .in('status', ['paid', 'active', 'approved'])

    if ((count ?? 0) > 0) {
      // Soft delete — athletes have paid for this
      await supabaseAdmin
        .from('coach_programs')
        .update({ status: 'inactive' })
        .eq('id', params.id)
        .eq('coach_id', session.user.id)
      return NextResponse.json({ ok: true, soft_deleted: true })
    }
  }

  const { error: deleteError } = await supabaseAdmin
    .from('coach_programs')
    .delete()
    .eq('id', params.id)
    .eq('coach_id', session.user.id)

  if (deleteError) return jsonError(deleteError.message, 500)

  return NextResponse.json({ ok: true })
}
