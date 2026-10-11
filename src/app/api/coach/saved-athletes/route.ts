import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const authenticateCoach = () => getSessionRole(['coach'])

export async function GET(request: Request) {
  const { session, error } = await authenticateCoach()
  if (error || !session) return error
  const athleteId = new URL(request.url).searchParams.get('athlete_id')?.trim()
  let query = supabaseAdmin
    .from('coach_saved_athletes')
    .select('id,athlete_id,created_at,athlete_profiles(id,owner_user_id,full_name,avatar_url,sport,grade_level,status)')
    .eq('coach_id', session.user.id)
    .order('created_at', { ascending: false })
  if (athleteId) query = query.eq('athlete_id', athleteId)
  const { data, error: loadError } = await query
  if (loadError) return jsonError('Unable to load saved athletes', 500)
  return NextResponse.json({ items: data || [] })
}

export async function POST(request: Request) {
  const { session, error } = await authenticateCoach()
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const athleteId = typeof body?.athlete_id === 'string' ? body.athlete_id.trim() : ''
  if (!athleteId) return jsonError('athlete_id is required')
  const { data: athlete } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id')
    .eq('id', athleteId)
    .eq('status', 'active')
    .maybeSingle()
  if (!athlete) return jsonError('Athlete not found', 404)
  const { data, error: saveError } = await supabaseAdmin
    .from('coach_saved_athletes')
    .upsert({ coach_id: session.user.id, athlete_id: athleteId }, { onConflict: 'coach_id,athlete_id' })
    .select('id,athlete_id,created_at')
    .single()
  if (saveError) return jsonError('Unable to save athlete', 500)
  return NextResponse.json({ item: data }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { session, error } = await authenticateCoach()
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const athleteId = typeof body?.athlete_id === 'string' ? body.athlete_id.trim() : ''
  if (!athleteId) return jsonError('athlete_id is required')
  const { error: deleteError } = await supabaseAdmin
    .from('coach_saved_athletes')
    .delete()
    .eq('coach_id', session.user.id)
    .eq('athlete_id', athleteId)
  if (deleteError) return jsonError('Unable to remove saved athlete', 500)
  return NextResponse.json({ ok: true })
}
