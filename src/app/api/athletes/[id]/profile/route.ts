import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

type AthleteMetric = {
  athlete_id: string
  label: string
  value: string
  unit?: string | null
}

type AthleteResult = {
  athlete_id: string
  title: string
  event_date?: string | null
  placement?: string | null
  detail?: string | null
}

type AthleteMedia = {
  athlete_id: string
  title?: string | null
  media_url: string
  media_type?: string | null
}

type VisibilityRow = {
  athlete_id: string
  section: string
  visibility: string
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Use roleCandidates scan so coaches with a temporarily active org/admin role still pass
  const { session, role, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const { id: athleteId } = await params
  const { searchParams } = new URL(request.url)
  const subProfileId = searchParams.get('sub_profile_id')?.trim() || null

  // Verify the coach has a link to this athlete
  if (role === 'coach') {
    const { data: link } = await supabaseAdmin
      .from('coach_athlete_links')
      .select('id')
      .eq('coach_id', session.user.id)
      .eq('athlete_id', athleteId)
      .maybeSingle()

    if (!link) {
      return NextResponse.json({ error: 'Athlete not linked to your account' }, { status: 404 })
    }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, full_name, email, avatar_url, bio, athlete_sport, athlete_location, athlete_season, athlete_grade_level, athlete_birthdate, guardian_name, guardian_email, guardian_phone'
    )
    .eq('id', athleteId)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Athlete not found' }, { status: 404 })
  }

  let resolvedProfile = profile
  if (subProfileId) {
    const { data: subProfile, error: subProfileError } = await supabaseAdmin
      .from('athlete_sub_profiles')
      .select('id, user_id, name, sport, avatar_url, bio, birthdate, grade_level, season, location')
      .eq('id', subProfileId)
      .eq('user_id', athleteId)
      .maybeSingle()

    if (subProfileError || !subProfile) {
      return NextResponse.json({ error: 'Sub-profile not found' }, { status: 404 })
    }

    resolvedProfile = {
      ...profile,
      full_name: subProfile.name || profile.full_name,
      avatar_url: subProfile.avatar_url || profile.avatar_url,
      bio: subProfile.bio || profile.bio,
      athlete_sport: subProfile.sport || profile.athlete_sport,
      athlete_location: subProfile.location || profile.athlete_location,
      athlete_season: subProfile.season || profile.athlete_season,
      athlete_grade_level: subProfile.grade_level || profile.athlete_grade_level,
      athlete_birthdate: subProfile.birthdate || profile.athlete_birthdate,
    }
  }

  const metricsQuery = supabaseAdmin
    .from('athlete_metrics')
    .select('athlete_id, label, value, unit')
    .eq('athlete_id', athleteId)
    .order('sort_order', { ascending: true })
  const resultsQuery = supabaseAdmin
    .from('athlete_results')
    .select('athlete_id, title, event_date, placement, detail')
    .eq('athlete_id', athleteId)
    .order('event_date', { ascending: false })
  const mediaQuery = supabaseAdmin
    .from('athlete_media')
    .select('athlete_id, title, media_url, media_type')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
  const visibilityQuery = supabaseAdmin
    .from('profile_visibility')
    .select('athlete_id, section, visibility')
    .eq('athlete_id', athleteId)

  const [metricsRes, resultsRes, mediaRes, visibilityRes] = await Promise.all([
    subProfileId ? metricsQuery.eq('sub_profile_id', subProfileId) : metricsQuery.is('sub_profile_id', null),
    subProfileId ? resultsQuery.eq('sub_profile_id', subProfileId) : resultsQuery.is('sub_profile_id', null),
    subProfileId ? mediaQuery.eq('sub_profile_id', subProfileId) : mediaQuery.is('sub_profile_id', null),
    subProfileId ? visibilityQuery.eq('sub_profile_id', subProfileId) : visibilityQuery.is('sub_profile_id', null),
  ])

  const visibility = ((visibilityRes.data || []) as VisibilityRow[]).reduce<Record<string, string>>((acc, row) => {
    acc[row.section] = row.visibility
    return acc
  }, {})

  return NextResponse.json({
    profile: resolvedProfile,
    metrics: (metricsRes.data || []) as AthleteMetric[],
    results: (resultsRes.data || []) as AthleteResult[],
    media: (mediaRes.data || []) as AthleteMedia[],
    visibility,
  })
}
