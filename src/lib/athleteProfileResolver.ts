import { selectProfileCompat } from '@/lib/profileSchemaCompat'
import { type AthleteProfileRow, resolveAthleteProfileSelection } from '@/lib/athleteProfiles'

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
  athlete_profile_id: string
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
  athleteProfileId,
  subProfileId,
}: {
  supabase: any
  athleteId: string
  athleteProfileId?: string | null
  subProfileId?: string | null
}): Promise<ResolverResult> {
  const normalizedSubProfileId = typeof subProfileId === 'string' && subProfileId.trim() ? subProfileId.trim() : null
  const normalizedAthleteProfileId =
    typeof athleteProfileId === 'string' && athleteProfileId.trim() ? athleteProfileId.trim() : null

  const { data: mainProfileData, error: mainProfileError } = await selectProfileCompat({
    supabase,
    userId: athleteId,
    columns: [
      'id',
      'full_name',
      'email',
      'avatar_url',
      'bio',
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
    guardian_name?: string | null
    guardian_email?: string | null
    guardian_phone?: string | null
    account_owner_type?: string | null
  } | null

  const { data: selection, error: selectionError } = await resolveAthleteProfileSelection({
    supabase,
    ownerUserId: athleteId,
    athleteProfileId: normalizedAthleteProfileId,
    subProfileId: normalizedSubProfileId,
  })

  // If athlete_profiles is inaccessible (e.g. missing RLS policy, table not yet migrated,
  // or no row exists yet), fall back to mainProfileData rather than returning 404 and
  // discarding already-good data. This keeps the profile page functional while the
  // athlete_profiles table is being set up or synced.
  const selectedAthleteProfile: AthleteProfileRow = selection?.athleteProfile ?? {
    id: athleteId,
    owner_user_id: athleteId,
    auth_user_id: athleteId,
    is_primary: true,
    display_order: 0,
    status: 'active',
    full_name: mainProfile?.full_name || 'Athlete',
    avatar_url: mainProfile?.avatar_url || null,
    bio: mainProfile?.bio || null,
    sport: null,
    location: null,
    season: null,
    grade_level: null,
    birthdate: null,
    slug: null,
  }

  const profile: NormalizedAthleteProfile = {
    id: String(mainProfile?.id || athleteId),
    athlete_id: athleteId,
    athlete_profile_id: selectedAthleteProfile.id,
    full_name: selectedAthleteProfile.full_name ?? mainProfile?.full_name ?? null,
    email: mainProfile?.email || null,
    avatar_url: selectedAthleteProfile.avatar_url ?? mainProfile?.avatar_url ?? null,
    bio: selectedAthleteProfile.bio ?? mainProfile?.bio ?? null,
    athlete_sport: selectedAthleteProfile.sport ?? null,
    athlete_location: selectedAthleteProfile.location ?? null,
    athlete_season: selectedAthleteProfile.season ?? null,
    athlete_grade_level: selectedAthleteProfile.grade_level ?? null,
    athlete_birthdate: selectedAthleteProfile.birthdate ?? null,
    guardian_name: mainProfile?.guardian_name || null,
    guardian_email: mainProfile?.guardian_email || null,
    guardian_phone: mainProfile?.guardian_phone || null,
    account_owner_type: mainProfile?.account_owner_type || null,
  }

  const selectedAthleteProfileId = selectedAthleteProfile.id
  const metricsQuery = supabase
    .from('athlete_metrics')
    .select('id, athlete_id, athlete_profile_id, label, value, unit')
    .eq('athlete_id', athleteId)
    .order('sort_order', { ascending: true })
  const resultsQuery = supabase
    .from('athlete_results')
    .select('id, athlete_id, athlete_profile_id, title, event_date, placement, detail')
    .eq('athlete_id', athleteId)
    .order('event_date', { ascending: false })
  const mediaQuery = supabase
    .from('athlete_media')
    .select('id, athlete_id, athlete_profile_id, title, media_url, media_type')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
  const visibilityQuery = supabase
    .from('profile_visibility')
    .select('athlete_id, athlete_profile_id, section, visibility')
    .eq('athlete_id', athleteId)

  const [metricsRes, resultsRes, mediaRes, visibilityRes] = await Promise.all([
    metricsQuery.eq('athlete_profile_id', selectedAthleteProfileId),
    resultsQuery.eq('athlete_profile_id', selectedAthleteProfileId),
    mediaQuery.eq('athlete_profile_id', selectedAthleteProfileId),
    visibilityQuery.eq('athlete_profile_id', selectedAthleteProfileId),
  ])

  // Degrade gracefully if data-table columns are missing (e.g. sub_profile_id migration
  // not yet applied). Core profile fields (name, bio, avatar, sport, season, location)
  // are already assembled above — return them even if data queries fail.
  let metricsData     = metricsRes.error    ? [] : ((metricsRes.data    || []) as AthleteMetricRecord[])
  let resultsData     = resultsRes.error    ? [] : ((resultsRes.data    || []) as AthleteResultRecord[])
  let mediaData       = mediaRes.error      ? [] : ((mediaRes.data      || []) as AthleteMediaRecord[])
  let visibilityRows  = visibilityRes.error ? [] : ((visibilityRes.data || []) as VisibilityRecord[])

  const isPrimary = selection?.isPrimary ?? true
  if (metricsData.length === 0 && !metricsRes.error) {
    const { data } = await (isPrimary
      ? supabase.from('athlete_metrics').select('id, athlete_id, label, value, unit').eq('athlete_id', athleteId).is('sub_profile_id', null).order('sort_order', { ascending: true })
      : supabase.from('athlete_metrics').select('id, athlete_id, label, value, unit').eq('athlete_id', athleteId).eq('sub_profile_id', selectedAthleteProfileId).order('sort_order', { ascending: true }))
    metricsData = ((data || []) as AthleteMetricRecord[])
  }
  if (resultsData.length === 0 && !resultsRes.error) {
    const { data } = await (isPrimary
      ? supabase.from('athlete_results').select('id, athlete_id, title, event_date, placement, detail').eq('athlete_id', athleteId).is('sub_profile_id', null).order('event_date', { ascending: false })
      : supabase.from('athlete_results').select('id, athlete_id, title, event_date, placement, detail').eq('athlete_id', athleteId).eq('sub_profile_id', selectedAthleteProfileId).order('event_date', { ascending: false }))
    resultsData = ((data || []) as AthleteResultRecord[])
  }
  if (mediaData.length === 0 && !mediaRes.error) {
    const { data } = await (isPrimary
      ? supabase.from('athlete_media').select('id, athlete_id, title, media_url, media_type').eq('athlete_id', athleteId).is('sub_profile_id', null).order('created_at', { ascending: false })
      : supabase.from('athlete_media').select('id, athlete_id, title, media_url, media_type').eq('athlete_id', athleteId).eq('sub_profile_id', selectedAthleteProfileId).order('created_at', { ascending: false }))
    mediaData = ((data || []) as AthleteMediaRecord[])
  }
  if (visibilityRows.length === 0 && !visibilityRes.error) {
    const { data } = await (isPrimary
      ? supabase.from('profile_visibility').select('athlete_id, section, visibility').eq('athlete_id', athleteId).is('sub_profile_id', null)
      : supabase.from('profile_visibility').select('athlete_id, section, visibility').eq('athlete_id', athleteId).eq('sub_profile_id', selectedAthleteProfileId))
    visibilityRows = ((data || []) as VisibilityRecord[])
  }

  const visibility = visibilityRows.reduce<Record<string, string>>((acc, row) => {
    acc[row.section] = row.visibility
    return acc
  }, {})

  return {
    data: {
      profile,
      metrics: metricsData,
      results: resultsData,
      media:   mediaData,
      visibility,
    },
    status: 200,
  }
}
