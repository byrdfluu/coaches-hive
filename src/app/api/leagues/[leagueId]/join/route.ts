import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { enforcePaymentRateLimit } from '@/lib/paymentSecurity'

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

export async function GET(_request: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return fail('Sign in to request participation.', 401)
  const [{ data: organizations }, { data: athletes }, { data: requests }] = await Promise.all([
    supabase.from('organization_memberships').select('org_id,organizations(name)').eq('user_id', session.user.id).eq('status', 'active'),
    supabase.from('athlete_profiles').select('id,full_name').eq('owner_user_id', session.user.id),
    supabase.from('league_join_requests').select('id,status,requester_type,org_id,athlete_id,created_at').eq('league_id', leagueId).eq('requester_id', session.user.id).order('created_at', { ascending: false }),
  ])
  return NextResponse.json({ organizations: organizations || [], athletes: athletes || [], requests: requests || [] })
}

export async function POST(request: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return fail('Sign in to request participation.', 401)
  if (!(await enforcePaymentRateLimit(session.user.id, 'league_join_request', 5, 300).catch(() => false))) return fail('Too many requests. Try again later.', 429)
  const body = await request.json().catch(() => ({}))
  const requesterType = String(body?.requester_type || '')
  if (!['organization', 'coach', 'athlete', 'other'].includes(requesterType)) return fail('Choose a valid participation type.')
  const { data, error } = await supabase.rpc('request_to_join_league', {
    p_league_id: leagueId,
    p_requester_type: requesterType,
    p_org_id: requesterType === 'organization' ? body?.org_id || null : null,
    p_message: String(body?.message || '').trim().slice(0, 2000) || null,
    p_athlete_id: requesterType === 'athlete' ? body?.athlete_id || null : null,
  })
  if (error) return fail(error.message || 'Unable to submit join request.', 422)
  return NextResponse.json({ id: data, status: 'pending' }, { status: 201 })
}
