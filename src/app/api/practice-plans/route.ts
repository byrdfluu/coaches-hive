import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { COACH_TEAM_PLANS_ALLOWED, formatTierName, normalizeCoachTier } from '@/lib/planRules'
export const dynamic = 'force-dynamic'


const ORG_ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
]

export async function GET(request: Request) {
  const { session, role, error } = await getSessionRole([
    'coach',
    'athlete',
    'admin',
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
  ])
  if (error || !session) return error

  const url = new URL(request.url)
  const teamId = url.searchParams.get('team_id')
  const athleteId = url.searchParams.get('athlete_id')

  let query = supabaseAdmin.from('practice_plans').select('*').order('created_at', { ascending: false })

  if (role === 'coach') {
    query = query.eq('coach_id', session.user.id)
    if (teamId) query = query.eq('team_id', teamId)
    if (athleteId) query = query.eq('athlete_id', athleteId)
  } else if (role === 'athlete') {
    const { data: teams } = await supabaseAdmin
      .from('org_team_members')
      .select('team_id')
      .eq('athlete_id', session.user.id)
    const teamIds = (teams || []).map((row) => row.team_id).filter(Boolean) as string[]

    if (teamIds.length > 0) {
      query = query.or(`athlete_id.eq.${session.user.id},team_id.in.(${teamIds.join(',')})`)
    } else {
      query = query.eq('athlete_id', session.user.id)
    }
  } else if (ORG_ADMIN_ROLES.includes(role || '') || role === 'admin') {
    const { data: membership } = await supabaseAdmin
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
    if (!membership?.org_id) {
      return jsonError('No organization found', 404)
    }
    query = query.eq('org_id', membership.org_id)
    if (teamId) query = query.eq('team_id', teamId)
  } else {
    return jsonError('Forbidden', 403)
  }

  const { data, error: queryError } = await query
  if (queryError) {
    return jsonError(queryError.message, 500)
  }

  return NextResponse.json({ plans: data || [] })
}

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole([
    'coach',
    'admin',
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
  ])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const {
    title,
    description,
    session_date,
    duration_minutes,
    drills,
    visibility = 'private',
    team_id,
    athlete_id,
    coach_id,
  } = body || {}

  if (!title) {
    return jsonError('title is required')
  }

  let resolvedCoachId = session.user.id
  if (role !== 'coach') {
    if (!coach_id) return jsonError('coach_id is required')
    resolvedCoachId = coach_id
  }

  if (role === 'coach' && visibility === 'team') {
    const { data: planRow } = await supabaseAdmin
      .from('coach_plans')
      .select('tier')
      .eq('coach_id', resolvedCoachId)
      .maybeSingle()

    const tier = normalizeCoachTier(planRow?.tier)
    if (!COACH_TEAM_PLANS_ALLOWED[tier]) {
      return jsonError(`Team practice plans are available on the Elite plan. Your current plan is ${formatTierName(tier)}.`, 403)
    }
  }

  let resolvedOrgId: string | null = null
  if (team_id) {
    const { data: teamRow } = await supabaseAdmin.from('org_teams').select('org_id').eq('id', team_id).maybeSingle()
    resolvedOrgId = teamRow?.org_id || null
  } else {
    const { data: membership } = await supabaseAdmin
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', resolvedCoachId)
      .maybeSingle()
    resolvedOrgId = membership?.org_id || null
  }

  const payload = {
    coach_id: resolvedCoachId,
    org_id: resolvedOrgId,
    team_id: team_id || null,
    athlete_id: athlete_id || null,
    title,
    description: description || null,
    session_date: session_date || null,
    duration_minutes: duration_minutes || null,
    drills: drills || null,
    visibility,
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('practice_plans')
    .insert(payload)
    .select('*')
    .single()

  if (insertError) {
    return jsonError(insertError.message, 500)
  }

  return NextResponse.json({ plan: data })
}
