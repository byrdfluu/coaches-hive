import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { COACH_ATHLETE_LIMITS, formatTierName, normalizeCoachTier } from '@/lib/planRules'
import { resolveActiveCoachContext } from '@/lib/activeCoachContext'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, role, error } = await getSessionRole()
  if (error || !session) return error

  if (!['coach', 'athlete', 'admin'].includes(String(role))) {
    return jsonError('Forbidden', 403)
  }
  if (role !== 'coach') {
    let query = supabaseAdmin.from('coach_athlete_links').select('*')
    if (role === 'athlete') query = query.eq('athlete_id', session.user.id)
    const { data, error: queryError } = await query
    if (queryError) return jsonError(queryError.message)
    return NextResponse.json({ links: data || [] }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  }

  const coachId = session.user.id
  const context = await resolveActiveCoachContext(coachId)
  let rawLinks: Array<Record<string, unknown>> = []
  let athleteProfileIds: string[] = []

  if (context.organizationId) {
    let teamIds = context.teamId ? [context.teamId] : []
    if (!teamIds.length) {
      const { data: assignments } = await supabaseAdmin.from('org_team_coaches')
        .select('team_id,org_teams!inner(org_id)')
        .eq('coach_id', coachId)
        .eq('org_teams.org_id', context.organizationId)
      teamIds = (assignments || []).map((row) => row.team_id)
    }
    const { data: teamMembers, error: teamError } = teamIds.length
      ? await supabaseAdmin.from('org_team_members').select('team_id,athlete_id').in('team_id', teamIds)
      : { data: [], error: null }
    if (teamError) return jsonError('Unable to load the selected team roster.', 500)
    athleteProfileIds = Array.from(new Set((teamMembers || []).map((row) => row.athlete_id).filter(Boolean)))
    rawLinks = athleteProfileIds.map((athleteId) => ({
      id: `team-roster:${athleteId}`,
      coach_id: coachId,
      athlete_id: athleteId,
      status: 'active',
    }))
  } else {
    const { data: links, error: linkError } = await supabaseAdmin.from('coach_athlete_links')
      .select('*').eq('coach_id', coachId).eq('status', 'active')
    if (linkError) return jsonError(linkError.message)
    rawLinks = (links || []) as Array<Record<string, unknown>>
    athleteProfileIds = Array.from(new Set(rawLinks.map((link) => String(link.athlete_id || '')).filter(Boolean)))
  }

  const { data: exactProfiles } = athleteProfileIds.length
    ? await supabaseAdmin.from('athlete_profiles')
        .select('id,owner_user_id,full_name,avatar_url,sport,grade_level,status')
        .in('id', athleteProfileIds).eq('status', 'active')
    : { data: [] }
  const exactIds = new Set((exactProfiles || []).map((profile) => profile.id))
  const legacyOwnerIds = athleteProfileIds.filter((id) => !exactIds.has(id))
  const { data: legacyProfiles } = legacyOwnerIds.length
    ? await supabaseAdmin.from('athlete_profiles')
        .select('id,owner_user_id,full_name,avatar_url,sport,grade_level,status')
        .in('owner_user_id', legacyOwnerIds).eq('is_primary', true).eq('status', 'active')
    : { data: [] }
  const profiles = [...(exactProfiles || []), ...(legacyProfiles || [])]
  const ownerIds = Array.from(new Set(profiles.map((profile) => profile.owner_user_id).filter(Boolean)))
  const { data: owners } = ownerIds.length
    ? await supabaseAdmin.from('profiles').select('id,email').in('id', ownerIds)
    : { data: [] }
  const emailMap = new Map((owners || []).map((owner) => [owner.id, owner.email || null]))
  const profileByRequestedId = new Map<string, (typeof profiles)[number]>()
  profiles.forEach((profile) => {
    profileByRequestedId.set(profile.id, profile)
    if (legacyOwnerIds.includes(profile.owner_user_id)) profileByRequestedId.set(profile.owner_user_id, profile)
  })

  const normalizedLinks = rawLinks.flatMap((link) => {
    const requestedId = String(link.athlete_id || '')
    const profile = profileByRequestedId.get(requestedId)
    if (!profile) return []
    return [{
      ...link,
      athlete_id: profile.id,
      athlete_owner_user_id: profile.owner_user_id,
      profiles: {
        id: profile.id,
        full_name: profile.full_name,
        email: emailMap.get(profile.owner_user_id) || null,
        avatar_url: profile.avatar_url,
      },
      sub_profiles: [],
    }]
  })

  return NextResponse.json({ links: normalizedLinks, context }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole()
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { coach_id, athlete_id, status } = body || {}

  if (!athlete_id) {
    return jsonError('athlete_id is required')
  }

  if (role !== 'coach' && role !== 'admin') {
    return jsonError('Forbidden', 403)
  }

  const payload = {
    coach_id: role === 'coach' ? session.user.id : coach_id,
    athlete_id,
    status: status || 'active',
  }

  if (!payload.coach_id) {
    return jsonError('coach_id is required')
  }

  if (role === 'coach' && payload.status === 'active') {
    const { data: existingLink } = await supabaseAdmin
      .from('coach_athlete_links')
      .select('id, status')
      .eq('coach_id', payload.coach_id)
      .eq('athlete_id', payload.athlete_id)
      .maybeSingle()

    if (!existingLink || existingLink.status !== 'active') {
      const { data: planRow } = await supabaseAdmin
        .from('coach_plans')
        .select('tier')
        .eq('coach_id', payload.coach_id)
        .maybeSingle()

      const tier = normalizeCoachTier(planRow?.tier)
      const limit = COACH_ATHLETE_LIMITS[tier]

      if (limit !== null) {
        const { count } = await supabaseAdmin
          .from('coach_athlete_links')
          .select('id', { count: 'exact', head: true })
          .eq('coach_id', payload.coach_id)
          .eq('status', 'active')

        if ((count || 0) >= limit) {
          return jsonError(`Your ${formatTierName(tier)} plan allows up to ${limit} active athletes. Upgrade to add more.`, 403)
        }
      }
    }
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('coach_athlete_links')
    .upsert(payload, { onConflict: 'coach_id,athlete_id' })
    .select()
    .single()

  if (insertError) {
    return jsonError(insertError.message)
  }

  return NextResponse.json({ link: data })
}

export async function DELETE(request: Request) {
  const { session, role, error } = await getSessionRole()
  if (error || !session) return error

  if (role !== 'coach' && role !== 'admin') {
    return jsonError('Forbidden', 403)
  }

  const body = await request.json().catch(() => null)
  const { id, coach_id, athlete_id } = body || {}

  if (!id && !(coach_id && athlete_id)) {
    return jsonError('id or coach_id + athlete_id are required')
  }

  let query = supabaseAdmin.from('coach_athlete_links').delete()

  if (id) {
    query = query.eq('id', id)
  } else {
    const resolvedCoachId = role === 'coach' ? session.user.id : coach_id
    if (!resolvedCoachId) {
      return jsonError('coach_id is required')
    }
    query = query.eq('coach_id', resolvedCoachId).eq('athlete_id', athlete_id)
  }

  const { error: deleteError } = await query
  if (deleteError) {
    return jsonError(deleteError.message)
  }

  return NextResponse.json({ ok: true })
}
