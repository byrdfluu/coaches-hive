import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const resolveRequest = async (request: Request, body?: Record<string, unknown>) => {
  const auth = await getSessionRole(['athlete'])
  if (auth.error || !auth.session) return { ...auth, athlete: null, profileId: '' }
  const url = new URL(request.url)
  const profileId = String(
    body?.athlete_profile_id
      || url.searchParams.get('athlete_profile_id')
      || auth.session.user.user_metadata?.selected_athlete_profile_id
      || '',
  ).trim()
  const athlete = await resolveAuthorizedAthleteContext(auth.session.user.id, profileId)
  return { ...auth, athlete, profileId }
}

export async function GET(request: Request) {
  const { session, error, athlete } = await resolveRequest(request)
  if (error || !session) return error
  if (!athlete) return jsonError('Athlete profile not found or access denied.', 404)

  const { data, error: queryError } = await supabaseAdmin
    .from('athlete_saved_programs')
    .select('program_id,created_at')
    .eq('athlete_id', athlete.profileId)
    .order('created_at', { ascending: false })
  if (queryError) return jsonError('Unable to load saved programs.', 500)
  return NextResponse.json({ program_ids: (data || []).map((row) => row.program_id) })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const { session, supabase, error, athlete } = await resolveRequest(request, body)
  if (error || !session) return error
  if (!athlete) return jsonError('Athlete profile not found or access denied.', 404)
  const programId = String(body.program_id || '').trim()
  if (!programId) return jsonError('Program is required.')

  const { data: visible, error: visibilityError } = await supabase.rpc('is_org_program_visible', {
    target_program_id: programId,
    target_athlete_id: athlete.profileId,
  })
  if (visibilityError || visible !== true) return jsonError('Program is unavailable.', 404)

  const { error: insertError } = await supabaseAdmin
    .from('athlete_saved_programs')
    .upsert({ athlete_id: athlete.profileId, program_id: programId }, { onConflict: 'athlete_id,program_id' })
  if (insertError) return jsonError('Unable to save program.', 500)
  return NextResponse.json({ saved: true, program_id: programId })
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const { session, error, athlete } = await resolveRequest(request, body)
  if (error || !session) return error
  if (!athlete) return jsonError('Athlete profile not found or access denied.', 404)
  const programId = String(body.program_id || '').trim()
  if (!programId) return jsonError('Program is required.')

  const { error: deleteError } = await supabaseAdmin
    .from('athlete_saved_programs')
    .delete()
    .eq('athlete_id', athlete.profileId)
    .eq('program_id', programId)
  if (deleteError) return jsonError('Unable to remove saved program.', 500)
  return NextResponse.json({ saved: false, program_id: programId })
}
