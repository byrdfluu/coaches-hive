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
    (supabase as any).rpc('my_session_balances', { p_athlete_id: athlete.profileId, p_as_of: new Date().toISOString() }),
    (supabase as any).rpc('my_session_history', { p_athlete_id: athlete.profileId }),
  ])
  if (balancesError || historyError) return jsonError('Unable to load credits.', 500)
  const activity = (history || []).reduce((summary: Record<string, number>, row: any) => {
    const amount = Math.abs(Number(row.delta || 0))
    const reason = String(row.reason || '')
    if (['purchase', 'renewal', 'grant'].includes(reason)) summary.issued += Math.max(0, Number(row.delta || 0))
    else if (reason === 'booking') summary.spent += amount
    else if (['return', 'timely_cancellation', 'academy_cancellation'].includes(reason)) summary.returned += Math.max(0, Number(row.delta || 0))
    else if (['restoration', 'authorized_restoration'].includes(reason)) summary.restored += Math.max(0, Number(row.delta || 0))
    else if (reason === 'expiration') summary.expired += amount
    return summary
  }, { issued: 0, spent: 0, returned: 0, restored: 0, expired: 0 })
  return NextResponse.json({ athlete_profile_id: athlete.profileId, balances: balances || [], history: history || [], activity }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
