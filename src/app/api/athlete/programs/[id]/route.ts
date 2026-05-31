import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { id } = await params
  const athleteId = session.user.id

  const { data: program, error: fetchError } = await supabaseAdmin
    .from('coach_programs')
    .select('id, title, description, status, duration_label, thumbnail_path, coach_id, product_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return jsonError(fetchError.message, 500)
  if (!program) return jsonError('Program not found.', 404)

  if (!program.product_id) return jsonError('This program is not available.', 403)

  const { count } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', program.product_id)
    .eq('athlete_id', athleteId)
    .in('status', ['paid', 'active', 'approved'])

  if ((count ?? 0) === 0) return jsonError('Access denied.', 403)

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', program.coach_id)
    .maybeSingle()

  const { data: cpeRows } = await supabaseAdmin
    .from('coach_program_exercises')
    .select('id, position, sets, reps, rest_seconds, notes, exercise_id, coach_exercises!inner(id, name, category, modality, muscle_group, movement_pattern, instructions, video_url, tracking_fields, photo_paths, thumbnail_path)')
    .eq('program_id', id)
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

  return NextResponse.json({
    program: {
      ...program,
      coach_name: profile?.full_name ?? '',
    },
    exercises,
  })
}
