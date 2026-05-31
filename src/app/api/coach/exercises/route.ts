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

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() ?? ''

  let query = supabaseAdmin
    .from('coach_exercises')
    .select('id, coach_id, name, category, modality, muscle_group, movement_pattern, instructions, video_url, tracking_fields, photo_paths, thumbnail_path, created_at, updated_at')
    .eq('coach_id', session.user.id)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data, error: fetchError } = await query
  if (fetchError) return jsonError(fetchError.message, 500)

  return NextResponse.json({ exercises: data ?? [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  if (!body) return jsonError('Invalid request body.', 400)

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return jsonError('Exercise name is required.', 400)

  const { data, error: insertError } = await supabaseAdmin
    .from('coach_exercises')
    .insert({
      coach_id: session.user.id,
      name,
      category: body.category || null,
      modality: body.modality || null,
      muscle_group: body.muscle_group || null,
      movement_pattern: body.movement_pattern || null,
      instructions: body.instructions || null,
      video_url: body.video_url || null,
      tracking_fields: validateTrackingFields(body.tracking_fields),
      photo_paths: Array.isArray(body.photo_paths) ? body.photo_paths : [],
      thumbnail_path: body.thumbnail_path || null,
    })
    .select()
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  return NextResponse.json({ exercise: data }, { status: 201 })
}
