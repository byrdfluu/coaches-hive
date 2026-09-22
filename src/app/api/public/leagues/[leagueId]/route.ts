import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { enforcePaymentRateLimit } from '@/lib/paymentSecurity'

export const dynamic = 'force-dynamic'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const noStore = { 'Cache-Control': 'public, max-age=30, s-maxage=60' }

const anonymousRateLimitId = (request: Request) => {
  const ip = String(request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous').split(',')[0].trim()
  const hash = createHash('sha256').update(`league-profile:${ip}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

export async function GET(request: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  if (!uuidPattern.test(leagueId)) return NextResponse.json({ error: 'League not found' }, { status: 404 })
  const allowed = await enforcePaymentRateLimit(anonymousRateLimitId(request), 'public_league_profile', 60, 60).catch(() => true)
  if (!allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 })

  const { data: league, error } = await supabaseAdmin.from('leagues')
    .select('id,name,sport,general_location,description,contact_email,contact_phone,profile_image_url,website_url,accepting_join_requests,status,is_public')
    .eq('id', leagueId).eq('status', 'active').eq('is_public', true).maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to load league' }, { status: 500 })
  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })

  const [{ count: organizationCount }, { count: teamCount }, { count: divisionCount }] = await Promise.all([
    supabaseAdmin.from('league_organizations').select('id', { count: 'exact', head: true }).eq('league_id', leagueId).eq('status', 'active'),
    supabaseAdmin.from('league_team_assignments').select('id', { count: 'exact', head: true }).eq('league_id', leagueId).eq('status', 'active'),
    supabaseAdmin.from('league_divisions').select('id', { count: 'exact', head: true }).eq('league_id', leagueId),
  ])
  const { status: _status, is_public: _isPublic, ...publicLeague } = league
  return NextResponse.json({ league: { ...publicLeague, organization_count: organizationCount || 0, team_count: teamCount || 0, division_count: divisionCount || 0 } }, { headers: noStore })
}
