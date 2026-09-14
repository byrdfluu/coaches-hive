import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAuthorizedCoachAthleteProfileIds } from '@/lib/authorizedCoachAthletes'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const athleteIds = await resolveAuthorizedCoachAthleteProfileIds(session.user.id)
  if (!athleteIds.length) return NextResponse.json({ reviews: [] }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  const { data, error: dbError } = await supabaseAdmin
    .from('coach_reviews')
    .select('id, athlete_id, reviewer_name, rating, body, status, coach_response, coach_response_at, created_at')
    .eq('coach_id', session.user.id)
    .in('athlete_id', athleteIds)
    .order('created_at', { ascending: false })

  if (dbError) return jsonError(dbError.message, 500)
  return NextResponse.json({ reviews: data || [] }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
