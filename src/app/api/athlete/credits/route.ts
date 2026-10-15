import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { session, supabase, error } = await getSessionRole(['athlete'])
  if (error || !session) return error
  const requested = new URL(request.url).searchParams.get('athlete_profile_id')
    || String(session.user.user_metadata?.selected_athlete_profile_id || '')
  const athlete = await resolveAuthorizedAthleteContext(session.user.id, requested)
  if (!athlete) return jsonError('Athlete profile not found or access denied.', 404)
  const [{ data: balances, error: balancesError }, { data: history, error: historyError }] = await Promise.all([
    (supabase as any).rpc('my_credit_balances', { p_athlete_id: athlete.profileId, p_as_of: new Date().toISOString() }),
    (supabase as any).rpc('my_credit_history', { p_athlete_id: athlete.profileId }),
  ])
  if (balancesError || historyError) return jsonError('Unable to load credits.', 500)
  return NextResponse.json({ athlete_profile_id: athlete.profileId, balances: balances || [], history: history || [] }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
