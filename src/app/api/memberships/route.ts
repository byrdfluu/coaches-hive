import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { COACH_ATHLETE_LIMITS, formatTierName, normalizeCoachTier } from '@/lib/planRules'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, role, error } = await getSessionRole()
  if (error || !session) return error

  let query = supabaseAdmin.from('coach_athlete_links').select('*, profiles!coach_athlete_links_athlete_id_fkey(id, full_name, email, avatar_url), coach_profile:profiles!coach_athlete_links_coach_id_fkey(id, full_name, avatar_url, brand_logo_url, brand_accent_color)')

  if (role === 'coach') {
    query = query.eq('coach_id', session.user.id)
  } else if (role === 'athlete') {
    query = query.eq('athlete_id', session.user.id)
  } else if (role !== 'admin') {
    return jsonError('Forbidden', 403)
  }

  const { data, error: queryError } = await query
  if (queryError) {
    return jsonError(queryError.message)
  }

  const links = (data || []) as Array<{ athlete_id?: string | null }>
  const athleteIds = Array.from(new Set(links.map((link) => link.athlete_id).filter(Boolean))) as string[]

  let subProfilesByAthleteId: Record<string, Array<{
    id: string
    user_id: string
    name: string
    sport?: string | null
    avatar_url?: string | null
    bio?: string | null
    birthdate?: string | null
    grade_level?: string | null
    season?: string | null
    location?: string | null
  }>> = {}

  if (athleteIds.length > 0) {
    const { data: subProfiles } = await supabaseAdmin
      .from('athlete_sub_profiles')
      .select('id, user_id, name, sport, avatar_url, bio, birthdate, grade_level, season, location')
      .in('user_id', athleteIds)
      .order('created_at', { ascending: true })

    ;((subProfiles || []) as Array<{
      id: string
      user_id: string
      name: string
      sport?: string | null
      avatar_url?: string | null
      bio?: string | null
      birthdate?: string | null
      grade_level?: string | null
      season?: string | null
      location?: string | null
    }>).forEach((profile) => {
      if (!subProfilesByAthleteId[profile.user_id]) subProfilesByAthleteId[profile.user_id] = []
      subProfilesByAthleteId[profile.user_id].push(profile)
    })
  }

  return NextResponse.json({
    links: links.map((link) => ({
      ...link,
      sub_profiles: link.athlete_id ? (subProfilesByAthleteId[link.athlete_id] || []) : [],
    })),
  })
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
