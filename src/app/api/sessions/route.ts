import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveActiveCoachContext } from '@/lib/activeCoachContext'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
export const dynamic = 'force-dynamic'


export async function GET(request: Request) {
  const { session, role, error: sessionError } = await getSessionRole(['coach', 'athlete', 'admin'])
  if (sessionError || !session) return sessionError

  const url = new URL(request.url)
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  const coachId = url.searchParams.get('coach_id')
  const athleteProfileId = url.searchParams.get('athlete_profile_id')
  const subProfileId = url.searchParams.get('sub_profile_id')
  const subProfileScope = url.searchParams.get('sub_profile_scope')

  let query = supabaseAdmin.from('sessions').select('*').order('start_time', {
    ascending: true,
  }).limit(500)

  if (role === 'coach') {
    query = query.eq('coach_id', session.user.id)
    const context = await resolveActiveCoachContext(session.user.id)
    if (context.organizationId) query = query.eq('org_id', context.organizationId)
    else if (context.independent) query = query.is('org_id', null)
    if (context.teamId) query = query.eq('team_id', context.teamId)
  } else if (role === 'athlete') {
    const requestedProfileId = athleteProfileId?.trim() || subProfileId?.trim()
      || (subProfileScope === 'main' ? null : String(session.user.user_metadata?.selected_athlete_profile_id || ''))
    const athleteContext = await resolveAuthorizedAthleteContext(session.user.id, requestedProfileId)
    if (!athleteContext) return jsonError('Athlete profile not found', 404)
    const filters = [`athlete_id.eq.${athleteContext.profileId}`, `athlete_profile_id.eq.${athleteContext.profileId}`]
    if (athleteContext.legacySubProfileId) filters.push(`sub_profile_id.eq.${athleteContext.legacySubProfileId}`)
    query = query.or(filters.join(','))
    if (coachId) {
      query = query.eq('coach_id', coachId)
    }
  } else if (role === 'admin') {
    if (coachId) {
      query = query.eq('coach_id', coachId)
    }
  } else {
    return jsonError('Forbidden', 403)
  }

  if (start) {
    query = query.gte('start_time', start)
  }
  if (end) {
    query = query.lte('start_time', end)
  }

  const { data, error: queryError } = await query
  if (queryError) {
    console.error('[sessions] query error:', queryError.message)
    return jsonError('Unable to load sessions. Please try again.', 500)
  }

  const sessions = data || []

  // Attach display names so clients don't need RLS-blocked cross-user profile lookups
  const athleteIds = Array.from(new Set(sessions.map((s: any) => s.athlete_id).filter(Boolean))) as string[]
  const coachIds = Array.from(new Set(sessions.map((s: any) => s.coach_id).filter(Boolean))) as string[]
  const profileIds = Array.from(new Set(coachIds))

  let nameMap: Record<string, string> = {}
  if (profileIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .in('id', profileIds)
    ;(profiles || []).forEach((p: any) => {
      if (p.id && p.full_name) nameMap[p.id] = p.full_name
    })
  }
  const { data: athleteProfiles } = athleteIds.length
    ? await supabaseAdmin.from('athlete_profiles').select('id,full_name').in('id', athleteIds)
    : { data: [] }
  ;(athleteProfiles || []).forEach(profile => {
    if (profile.id && profile.full_name) nameMap[profile.id] = profile.full_name
  })

  return NextResponse.json({
    sessions: sessions.map((s: any) => ({
      ...s,
      athlete_name: s.athlete_id ? (nameMap[s.athlete_id] || null) : null,
      coach_name: s.coach_id ? (nameMap[s.coach_id] || null) : null,
    })),
  })
}
