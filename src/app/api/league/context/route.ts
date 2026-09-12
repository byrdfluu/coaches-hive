import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const requested = new URL(request.url).searchParams.get('league_id')
  let membershipQuery = supabaseAdmin.from('league_memberships').select('id,league_id,role,status')
    .eq('user_id', session.user.id).eq('status', 'active')
  if (requested) membershipQuery = membershipQuery.eq('league_id', requested)
  const { data: memberships, error } = await membershipQuery
  if (error) return NextResponse.json({ error: 'Unable to load league access. Please retry.' }, { status: 500 })
  if (!memberships?.length) return NextResponse.json({ contexts: [], active: null })
  const leagueIds = memberships.map((item) => item.league_id)
  const { data: leagues } = await supabaseAdmin.from('leagues').select('id,name,sport,general_location,status,max_teams,billing_model').in('id', leagueIds).eq('status', 'active')
  const contexts = memberships.flatMap((membership) => {
    const league = (leagues || []).find((item) => item.id === membership.league_id)
    return league ? [{ ...league, membership_id: membership.id, role: membership.role }] : []
  })
  const preferredId = requested || String(session.user.user_metadata?.current_league_id || '')
  return NextResponse.json({ contexts, active: contexts.find((item) => item.id === preferredId) || contexts[0] || null })
}
