import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveActiveCoachContext } from '@/lib/activeCoachContext'
import { resolveAuthorizedCoachAthleteProfileIds } from '@/lib/authorizedCoachAthletes'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error
  const coachId = session.user.id
  const [context, athleteIds] = await Promise.all([resolveActiveCoachContext(coachId), resolveAuthorizedCoachAthleteProfileIds(coachId)])
  if (!athleteIds.length) return NextResponse.json({ athletes: [], totals: { charged_cents: 0, paid_cents: 0, owed_cents: 0 }, context }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  const { data: profiles, error: profileError } = await supabaseAdmin.from('athlete_profiles').select('id,full_name,avatar_url').in('id', athleteIds).eq('status', 'active')
  if (profileError) return jsonError('Unable to load athlete payment records.', 500)
  let assignments: Array<{ athlete_id: string; amount?: number | string | null; status?: string | null }> = []
  if (context.organizationId) {
    const result = await supabaseAdmin.from('org_fee_assignments').select('athlete_id,amount,status').eq('org_id', context.organizationId).in('athlete_id', athleteIds)
    if (result.error) return jsonError('Unable to load organization balances.', 500)
    assignments = result.data || []
  } else {
    const result = await supabaseAdmin.from('coach_fee_assignments').select('athlete_id,amount,status').eq('coach_id', coachId).in('athlete_id', athleteIds)
    if (result.error) return jsonError('Unable to load coach balances.', 500)
    assignments = result.data || []
  }
  const athletes = (profiles || []).map((profile) => {
    const rows = assignments.filter((assignment) => assignment.athlete_id === profile.id)
    const chargedCents = rows.reduce((sum, row) => sum + Math.round(Number(row.amount || 0) * 100), 0)
    const paidCents = rows.filter((row) => row.status === 'paid').reduce((sum, row) => sum + Math.round(Number(row.amount || 0) * 100), 0)
    return { id: profile.id, name: profile.full_name || 'Athlete', avatar_url: profile.avatar_url || null, charged_cents: chargedCents, paid_cents: paidCents, owed_cents: Math.max(0, chargedCents - paidCents) }
  }).sort((a, b) => b.owed_cents - a.owed_cents)
  const totals = athletes.reduce((sum, athlete) => ({ charged_cents: sum.charged_cents + athlete.charged_cents, paid_cents: sum.paid_cents + athlete.paid_cents, owed_cents: sum.owed_cents + athlete.owed_cents }), { charged_cents: 0, paid_cents: 0, owed_cents: 0 })
  return NextResponse.json({ athletes, totals, context }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
