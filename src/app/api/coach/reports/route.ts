import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveActiveCoachContext } from '@/lib/activeCoachContext'
import { resolveAuthorizedCoachAthleteProfileIds } from '@/lib/authorizedCoachAthletes'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET() {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const coachId = session.user.id
  const [context, athleteProfileIds] = await Promise.all([
    resolveActiveCoachContext(coachId),
    resolveAuthorizedCoachAthleteProfileIds(coachId),
  ])

  if (!athleteProfileIds.length) {
    return NextResponse.json({ sessions: [], orders: [], payouts: [], links: [], reviews: [], athletes: [], context }, { headers: noStore })
  }

  const { data: athletes, error: athleteError } = await supabaseAdmin
    .from('athlete_profiles')
    .select('id,owner_user_id,full_name')
    .in('id', athleteProfileIds)
    .eq('status', 'active')
  if (athleteError) return jsonError('Unable to load the selected coach roster.', 500)

  const exactProfileIds = (athletes || []).map((athlete) => athlete.id)
  const athleteOwnerIds = (athletes || []).map((athlete) => athlete.owner_user_id).filter(Boolean)
  const sessionAthleteIds = Array.from(new Set([...exactProfileIds, ...athleteOwnerIds]))

  let sessionsQuery = supabaseAdmin
    .from('sessions')
    .select('id,start_time,end_time,status,session_type,attendance_status,athlete_id,duration_minutes,price,price_cents')
    .eq('coach_id', coachId)
  if (context.organizationId) sessionsQuery = sessionsQuery.eq('org_id', context.organizationId)
  if (context.teamId) sessionsQuery = sessionsQuery.eq('team_id', context.teamId)
  if (sessionAthleteIds.length) sessionsQuery = sessionsQuery.in('athlete_id', sessionAthleteIds)

  let ordersQuery = supabaseAdmin
    .from('orders')
    .select('id,created_at,amount,total,price,amount_cents')
    .eq('coach_id', coachId)
  if (context.workspaceId) ordersQuery = ordersQuery.eq('workspace_id', context.workspaceId)
  else ordersQuery = ordersQuery.is('workspace_id', null)

  const [sessionsResult, ordersResult, reviewsResult, payoutsResult] = await Promise.all([
    sessionsQuery,
    ordersQuery,
    supabaseAdmin.from('coach_reviews')
      .select('id,athlete_id,rating,verified,created_at')
      .eq('coach_id', coachId)
      .in('athlete_id', exactProfileIds),
    context.organizationId
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin.from('coach_payouts')
        .select('id,amount,status,paid_at,scheduled_for,created_at')
        .eq('coach_id', coachId),
  ])

  const queryError = sessionsResult.error || ordersResult.error || reviewsResult.error || payoutsResult.error
  if (queryError) return jsonError('Unable to load coach reports for the selected workspace.', 500)

  return NextResponse.json({
    sessions: sessionsResult.data || [],
    orders: (ordersResult.data || []).map((order) => ({
      ...order,
      amount: order.amount ?? (order.amount_cents == null ? null : Number(order.amount_cents) / 100),
    })),
    payouts: payoutsResult.data || [],
    links: exactProfileIds.map((athlete_id) => ({ athlete_id, status: 'active' })),
    reviews: reviewsResult.data || [],
    athletes: athletes || [],
    context,
  }, { headers: noStore })
}
