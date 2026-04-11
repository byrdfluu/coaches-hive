import { selectProfileCompat } from '@/lib/profileSchemaCompat'

export type AthleteMetricRecord = {
  id: string
  athlete_id: string
  label: string
  value: string
  unit?: string | null
}

export type AthleteResultRecord = {
  id: string
  athlete_id: string
  title: string
  event_date?: string | null
  placement?: string | null
  detail?: string | null
}

export type AthleteMediaRecord = {
  id: string
  athlete_id: string
  title?: string | null
  media_url: string
  media_type?: string | null
}

export type VisibilityRecord = {
  athlete_id: string
  section: string
  visibility: string
}

export type NormalizedAthleteProfile = {
  id: string
  athlete_id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  bio: string | null
  athlete_sport: string | null
  athlete_location: string | null
  athlete_season: string | null
  athlete_grade_level: string | null
  athlete_birthdate: string | null
  guardian_name: string | null
  guardian_email: string | null
  guardian_phone: string | null
  account_owner_type: string | null
}

export type AthleteProfileBundle = {
  profile: NormalizedAthleteProfile
  metrics: AthleteMetricRecord[]
  results: AthleteResultRecord[]
  media: AthleteMediaRecord[]
  visibility: Record<string, string>
}

type ResolverResult =
  | { data: AthleteProfileBundle; status: 200 }
  | { error: string; status: number }

export async function resolveAthleteProfileBundle({
  supabase,
  athleteId,
  subProfileId,
}: {
  supabase: any
  athleteId: string
  subProfileId?: string | null
}): Promise<ResolverResult> {
  const normalizedSubProfileId = typeof subProfileId === 'string' && subProfileId.trim() ? subProfileId.trim() : null

  const { data: mainProfileData, error: mainProfileError } = await selectProfileCompat({
    supabase,
    userId: athleteId,
    columns: [
      'id',
      'full_name',
      'email',
      'avatar_url',
      'bio',
      'athlete_sport',
      'athlete_location',
      'athlete_season',
      'athlete_grade_level',
      'athlete_birthdate',
      'guardian_name',
      'guardian_email',
      'guardian_phone',
      'account_owner_type',
    ],
  })

  if (mainProfileError || !mainProfileData) {
    return { error: 'Athlete not found', status: 404 }
  }

  const mainProfile = (mainProfileData || null) as {
    id?: string | null
    full_name?: string | null
    email?: string | null
    avatar_url?: string | null
    bio?: string | null
    athlete_sport?: string | null
    athlete_location?: string | null
    athlete_season?: string | null
    athlete_grade_level?: string | null
    athlete_birthdate?: string | null
    guardian_name?: string | null
    guardian_email?: string | null
    guardian_phone?: string | null
    account_owner_type?: string | null
  } | null

  let subProfile: {
    id?: string | null
    name?: string | null
    sport?: string | null
    avatar_url?: string | null
    bio?: string | null
    birthdate?: string | null
    grade_level?: string | null
    season?: string | null
    location?: string | null
  } | null = null

  if (normalizedSubProfileId) {
    const { data, error } = await supabase
      .from('athlete_sub_profiles')
      .select('id, user_id, name, sport, avatar_url, bio, birthdate, grade_level, season, location')
      .eq('id', normalizedSubProfileId)
      .eq('user_id', athleteId)
      .maybeSingle()

    if (error || !data) {
      return { error: 'Sub-profile not found', status: 404 }
    }

    subProfile = data
  }

  const profile: NormalizedAthleteProfile = {
    id: String(mainProfile?.id || athleteId),
    athlete_id: athleteId,
    full_name: normalizedSubProfileId ? subProfile?.name || mainProfile?.full_name || null : mainProfile?.full_name || null,
    email: mainProfile?.email || null,
    avatar_url: normalizedSubProfileId ? subProfile?.avatar_url || mainProfile?.avatar_url || null : mainProfile?.avatar_url || null,
    bio: normalizedSubProfileId ? subProfile?.bio || mainProfile?.bio || null : mainProfile?.bio || null,
    athlete_sport: normalizedSubProfileId ? subProfile?.sport || mainProfile?.athlete_sport || null : mainProfile?.athlete_sport || null,
    athlete_location: normalizedSubProfileId ? subProfile?.location || mainProfile?.athlete_location || null : mainProfile?.athlete_location || null,
    athlete_season: normalizedSubProfileId ? subProfile?.season || mainProfile?.athlete_season || null : mainProfile?.athlete_season || null,
    athlete_grade_level: normalizedSubProfileId ? subProfile?.grade_level || mainProfile?.athlete_grade_level || null : mainProfile?.athlete_grade_level || null,
    athlete_birthdate: normalizedSubProfileId ? subProfile?.birthdate || mainProfile?.athlete_birthdate || null : mainProfile?.athlete_birthdate || null,
    guardian_name: mainProfile?.guardian_name || null,
    guardian_email: mainProfile?.guardian_email || null,
    guardian_phone: mainProfile?.guardian_phone || null,
    account_owner_type: mainProfile?.account_owner_type || null,
  }

  const metricsQuery = supabase
    .from('athlete_metrics')
    .select('id, athlete_id, label, value, unit')
    .eq('athlete_id', athleteId)
    .order('sort_order', { ascending: true })
  const resultsQuery = supabase
    .from('athlete_results')
    .select('id, athlete_id, title, event_date, placement, detail')
    .eq('athlete_id', athleteId)
    .order('event_date', { ascending: false })
  const mediaQuery = supabase
    .from('athlete_media')
    .select('id, athlete_id, title, media_url, media_type')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
  const visibilityQuery = supabase
    .from('profile_visibility')
    .select('athlete_id, section, visibility')
    .eq('athlete_id', athleteId)

  const [metricsRes, resultsRes, mediaRes, visibilityRes] = await Promise.all([
    normalizedSubProfileId ? metricsQuery.eq('sub_profile_id', normalizedSubProfileId) : metricsQuery.is('sub_profile_id', null),
    normalizedSubProfileId ? resultsQuery.eq('sub_profile_id', normalizedSubProfileId) : resultsQuery.is('sub_profile_id', null),
    normalizedSubProfileId ? mediaQuery.eq('sub_profile_id', normalizedSubProfileId) : mediaQuery.is('sub_profile_id', null),
    normalizedSubProfileId ? visibilityQuery.eq('sub_profile_id', normalizedSubProfileId) : visibilityQuery.is('sub_profile_id', null),
  ])

  if (metricsRes.error || resultsRes.error || mediaRes.error || visibilityRes.error) {
    return { error: 'Unable to load athlete profile', status: 500 }
  }

  const visibility = ((visibilityRes.data || []) as VisibilityRecord[]).reduce<Record<string, string>>((acc, row) => {
    acc[row.section] = row.visibility
    return acc
  }, {})

  return {
    data: {
      profile,
      metrics: (metricsRes.data || []) as AthleteMetricRecord[],
      results: (resultsRes.data || []) as AthleteResultRecord[],
      media: (mediaRes.data || []) as AthleteMediaRecord[],
      visibility,
    },
    status: 200,
  }
}
