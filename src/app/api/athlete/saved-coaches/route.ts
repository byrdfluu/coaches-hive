import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

async function loadSavedCoachIds(athleteId: string) {
  const { data, error } = await supabaseAdmin
    .from('athlete_saved_coaches')
    .select('coach_id')
    .eq('athlete_id', athleteId)

  if (error) {
    return { savedCoachIds: null, error }
  }

  return {
    savedCoachIds: (data || []).map((row: { coach_id: string }) => row.coach_id),
    error: null,
  }
}

export async function GET() {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { savedCoachIds, error: dbError } = await loadSavedCoachIds(session.user.id)

  if (dbError) return jsonError('Failed to load saved coaches', 500)

  return NextResponse.json({ saved_coach_ids: savedCoachIds || [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const coachId = typeof body?.coach_id === 'string' ? body.coach_id.trim() : null
  if (!coachId) return jsonError('coach_id is required', 400)

  // Check if already saved
  const { data: existing } = await supabaseAdmin
    .from('athlete_saved_coaches')
    .select('id')
    .eq('athlete_id', session.user.id)
    .eq('coach_id', coachId)
    .maybeSingle()

  if (existing) {
    // Unsave
    const { error: deleteError } = await supabaseAdmin
      .from('athlete_saved_coaches')
      .delete()
      .eq('athlete_id', session.user.id)
      .eq('coach_id', coachId)

    if (deleteError) return jsonError('Failed to remove saved coach', 500)

    const { savedCoachIds, error: reloadError } = await loadSavedCoachIds(session.user.id)
    if (reloadError) return jsonError('Saved coach was removed, but reload failed', 500)

    return NextResponse.json({ saved: false, saved_coach_ids: savedCoachIds || [] })
  }

  // Save
  const { error: insertError } = await supabaseAdmin
    .from('athlete_saved_coaches')
    .insert({ athlete_id: session.user.id, coach_id: coachId })

  if (insertError) return jsonError('Failed to save coach', 500)

  const { savedCoachIds, error: reloadError } = await loadSavedCoachIds(session.user.id)
  if (reloadError) return jsonError('Coach was saved, but reload failed', 500)

  return NextResponse.json({ saved: true, saved_coach_ids: savedCoachIds || [] })
}
