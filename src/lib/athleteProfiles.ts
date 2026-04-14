import { selectProfileCompat, upsertProfileCompat } from '@/lib/profileSchemaCompat'

export type AthleteProfileRow = {
  id: string
  owner_user_id: string
  auth_user_id?: string | null
  is_primary: boolean
  display_order?: number | null
  status?: string | null
  full_name: string
  avatar_url?: string | null
  bio?: string | null
  sport?: string | null
  location?: string | null
  season?: string | null
  grade_level?: string | null
  birthdate?: string | null
  slug?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type ResolvedAthleteProfileSelection = {
  athleteProfile: AthleteProfileRow
  athleteProfileId: string
  legacySubProfileId: string | null
  isPrimary: boolean
}

type LegacyMainProfile = {
  id?: string | null
  full_name?: string | null
  avatar_url?: string | null
  bio?: string | null
  athlete_sport?: string | null
  athlete_location?: string | null
  athlete_season?: string | null
  athlete_grade_level?: string | null
  athlete_birthdate?: string | null
}

type LegacySubProfile = {
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
  created_at?: string | null
}

export const ATHLETE_PROFILE_SELECT =
  'id, owner_user_id, auth_user_id, is_primary, display_order, status, full_name, avatar_url, bio, sport, location, season, grade_level, birthdate, slug, created_at, updated_at'

export const slugifyAthleteProfile = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

export const normalizeAthleteBirthdate = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

const resolveUniqueAthleteProfileSlug = async ({
  supabase,
  ownerUserId,
  fullName,
  excludeId,
}: {
  supabase: any
  ownerUserId: string
  fullName: string
  excludeId?: string | null
}) => {
  const baseSlug = slugifyAthleteProfile(fullName) || 'athlete-profile'
  const { data } = await supabase
    .from('athlete_profiles')
    .select('id, slug')
    .eq('owner_user_id', ownerUserId)

  const usedSlugs = new Set(
    ((data || []) as Array<{ id?: string | null; slug?: string | null }>)
      .filter((row) => row.id !== excludeId)
      .map((row) => String(row.slug || '').trim())
      .filter(Boolean),
  )

  if (!usedSlugs.has(baseSlug)) return baseSlug

  let suffix = 2
  while (usedSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1
  }
  return `${baseSlug}-${suffix}`
}

const upsertLegacySubProfile = async ({
  supabase,
  payload,
}: {
  supabase: any
  payload: {
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
  }
}) => {
  const fullPayload = {
    id: payload.id,
    user_id: payload.user_id,
    name: payload.name,
    sport: payload.sport || 'General',
    avatar_url: payload.avatar_url || null,
    bio: payload.bio || null,
    birthdate: normalizeAthleteBirthdate(payload.birthdate) || null,
    grade_level: payload.grade_level || null,
    season: payload.season || null,
    location: payload.location || null,
  }

  const fullResult = await supabase.from('athlete_sub_profiles').upsert(fullPayload)
  if (!fullResult.error) return fullResult

  const fallbackPayload = {
    id: payload.id,
    user_id: payload.user_id,
    name: payload.name,
    sport: payload.sport || 'General',
  }

  return supabase.from('athlete_sub_profiles').upsert(fallbackPayload)
}

const buildPrimaryAthleteProfilePayload = (
  ownerUserId: string,
  row: LegacyMainProfile | null,
  existingPrimaryId?: string | null,
) => {
  const fullName = row?.full_name?.trim() || 'Athlete'
  return {
    id: existingPrimaryId || ownerUserId,
    owner_user_id: ownerUserId,
    auth_user_id: ownerUserId,
    is_primary: true,
    display_order: 0,
    status: 'active',
    full_name: fullName,
    avatar_url: row?.avatar_url || null,
    bio: row?.bio || null,
    sport: null,
    location: null,
    season: null,
    grade_level: null,
    birthdate: null,
    slug: slugifyAthleteProfile(fullName),
  }
}

const buildSubAthleteProfilePayload = (row: LegacySubProfile, order: number) => {
  const fullName = row.name?.trim() || 'Athlete'
  return {
    id: row.id,
    owner_user_id: row.user_id,
    auth_user_id: null,
    is_primary: false,
    display_order: order,
    status: 'active',
    full_name: fullName,
    avatar_url: row.avatar_url || null,
    bio: row.bio || null,
    sport: row.sport || null,
    location: row.location || null,
    season: row.season || null,
    grade_level: row.grade_level || null,
    birthdate: normalizeAthleteBirthdate(row.birthdate) || null,
    slug: slugifyAthleteProfile(fullName),
  }
}

export async function syncAthleteProfilesForOwner({
  supabase,
  ownerUserId,
}: {
  supabase: any
  ownerUserId: string
}) {
  const [{ data: mainProfileData }, { data: legacySubProfiles, error: subProfilesError }, { data: existingPrimaryProfile }] = await Promise.all([
    selectProfileCompat({
      supabase,
      userId: ownerUserId,
      columns: ['id', 'full_name', 'avatar_url', 'bio'],
    }),
    supabase
      .from('athlete_sub_profiles')
      .select('id, user_id, name, sport, avatar_url, bio, birthdate, grade_level, season, location, created_at')
      .eq('user_id', ownerUserId)
      .order('created_at', { ascending: true }),
    supabase
      .from('athlete_profiles')
      .select('id')
      .eq('owner_user_id', ownerUserId)
      .eq('is_primary', true)
      .maybeSingle(),
  ])

  const primaryPayload = buildPrimaryAthleteProfilePayload(
    ownerUserId,
    (mainProfileData || null) as LegacyMainProfile | null,
    (existingPrimaryProfile as { id?: string | null } | null)?.id || null,
  )
  if (!existingPrimaryProfile) {
    await supabase
      .from('athlete_profiles')
      .upsert(primaryPayload, { onConflict: 'id' })
  }

  if (!subProfilesError) {
    const subRows = ((legacySubProfiles || []) as LegacySubProfile[]).map((row, index) =>
      buildSubAthleteProfilePayload(row, index + 1),
    )
    if (subRows.length > 0) {
      await supabase.from('athlete_profiles').upsert(subRows, { onConflict: 'id' })
    }
  }

  const { data, error } = await supabase
    .from('athlete_profiles')
    .select(ATHLETE_PROFILE_SELECT)
    .eq('owner_user_id', ownerUserId)
    .eq('status', 'active')
    .order('display_order', { ascending: true })

  return {
    data: (data || []) as AthleteProfileRow[],
    error,
  }
}

export async function getPrimaryAthleteProfile({
  supabase,
  ownerUserId,
}: {
  supabase: any
  ownerUserId: string
}) {
  await syncAthleteProfilesForOwner({ supabase, ownerUserId })
  const { data, error } = await supabase
    .from('athlete_profiles')
    .select(ATHLETE_PROFILE_SELECT)
    .eq('owner_user_id', ownerUserId)
    .eq('is_primary', true)
    .maybeSingle()

  return { data: (data || null) as AthleteProfileRow | null, error }
}

export async function getAthleteProfileById({
  supabase,
  ownerUserId,
  athleteProfileId,
}: {
  supabase: any
  ownerUserId: string
  athleteProfileId: string
}) {
  await syncAthleteProfilesForOwner({ supabase, ownerUserId })
  const { data, error } = await supabase
    .from('athlete_profiles')
    .select(ATHLETE_PROFILE_SELECT)
    .eq('id', athleteProfileId)
    .eq('owner_user_id', ownerUserId)
    .eq('status', 'active')
    .maybeSingle()

  return { data: (data || null) as AthleteProfileRow | null, error }
}

export async function resolveAthleteProfileSelection({
  supabase,
  ownerUserId,
  athleteProfileId,
  subProfileId,
}: {
  supabase: any
  ownerUserId: string
  athleteProfileId?: string | null
  subProfileId?: string | null
}): Promise<{ data: ResolvedAthleteProfileSelection | null; error: any }> {
  const normalizedRequestedId =
    typeof athleteProfileId === 'string' && athleteProfileId.trim()
      ? athleteProfileId.trim()
      : typeof subProfileId === 'string' && subProfileId.trim()
        ? subProfileId.trim()
        : null

  const selectionResult = normalizedRequestedId
    ? await getAthleteProfileById({
        supabase,
        ownerUserId,
        athleteProfileId: normalizedRequestedId,
      })
    : await getPrimaryAthleteProfile({
        supabase,
        ownerUserId,
      })

  const fallbackToPrimary =
    normalizedRequestedId &&
    normalizedRequestedId === ownerUserId &&
    !selectionResult.data
      ? await getPrimaryAthleteProfile({
          supabase,
          ownerUserId,
        })
      : null

  const athleteProfile = selectionResult.data || fallbackToPrimary?.data || null
  if ((selectionResult.error && !fallbackToPrimary?.data) || !athleteProfile) {
    return {
      data: null,
      error: selectionResult.error || fallbackToPrimary?.error || new Error('Athlete profile not found'),
    }
  }

  return {
    data: {
      athleteProfile,
      athleteProfileId: athleteProfile.id,
      legacySubProfileId: athleteProfile.is_primary ? null : athleteProfile.id,
      isPrimary: athleteProfile.is_primary,
    },
    error: null,
  }
}

export async function upsertPrimaryAthleteProfile({
  supabase,
  ownerUserId,
  updates,
}: {
  supabase: any
  ownerUserId: string
  updates: Partial<AthleteProfileRow>
}) {
  const { data: primaryProfile } = await getPrimaryAthleteProfile({ supabase, ownerUserId })
  const fullName = String(updates.full_name || primaryProfile?.full_name || 'Athlete').trim() || 'Athlete'
  const slug = await resolveUniqueAthleteProfileSlug({
    supabase,
    ownerUserId,
    fullName,
    excludeId: primaryProfile?.id || ownerUserId,
  })
  const payload = {
    id: primaryProfile?.id || ownerUserId,
    owner_user_id: ownerUserId,
    auth_user_id: ownerUserId,
    is_primary: true,
    display_order: 0,
    status: 'active',
    full_name: fullName,
    avatar_url: updates.avatar_url !== undefined ? updates.avatar_url : (primaryProfile?.avatar_url ?? null),
    bio: updates.bio !== undefined ? updates.bio : (primaryProfile?.bio ?? null),
    sport: updates.sport !== undefined ? updates.sport : (primaryProfile?.sport ?? null),
    location: updates.location !== undefined ? updates.location : (primaryProfile?.location ?? null),
    season: updates.season !== undefined ? updates.season : (primaryProfile?.season ?? null),
    grade_level: updates.grade_level !== undefined ? updates.grade_level : (primaryProfile?.grade_level ?? null),
    birthdate: updates.birthdate !== undefined ? normalizeAthleteBirthdate(updates.birthdate) : (primaryProfile?.birthdate ?? null),
    slug,
  }

  const { error } = await supabase
    .from('athlete_profiles')
    .upsert(payload, { onConflict: 'id' })

  if (error) return { data: null, error }

  return getPrimaryAthleteProfile({ supabase, ownerUserId })
}

export async function createAthleteProfile({
  supabase,
  ownerUserId,
  payload,
}: {
  supabase: any
  ownerUserId: string
  payload: {
    full_name: string
    sport?: string | null
    bio?: string | null
    birthdate?: string | null
    grade_level?: string | null
    season?: string | null
    location?: string | null
  }
}) {
  const newId = crypto.randomUUID()
  const { data: existingProfiles } = await syncAthleteProfilesForOwner({ supabase, ownerUserId })
  const displayOrder = (existingProfiles?.filter((row) => !row.is_primary).length || 0) + 1
  const fullName = payload.full_name.trim()
  const slug = await resolveUniqueAthleteProfileSlug({
    supabase,
    ownerUserId,
    fullName,
  })
  const record = {
    id: newId,
    owner_user_id: ownerUserId,
    auth_user_id: null,
    is_primary: false,
    display_order: displayOrder,
    status: 'active',
    full_name: fullName,
    avatar_url: null,
    bio: payload.bio || null,
    sport: payload.sport || null,
    location: payload.location || null,
    season: payload.season || null,
    grade_level: payload.grade_level || null,
    birthdate: normalizeAthleteBirthdate(payload.birthdate) || null,
    slug,
  }

  const { data, error } = await supabase
    .from('athlete_profiles')
    .insert(record)
    .select(ATHLETE_PROFILE_SELECT)
    .single()

  if (error) return { data: null, error }

  await upsertLegacySubProfile({
    supabase,
    payload: {
      id: newId,
      user_id: ownerUserId,
      name: fullName,
      sport: payload.sport || 'General',
      bio: payload.bio || null,
      birthdate: payload.birthdate || null,
      grade_level: payload.grade_level || null,
      season: payload.season || null,
      location: payload.location || null,
    },
  })

  return { data: data as AthleteProfileRow, error: null }
}

export async function updateAthleteProfile({
  supabase,
  ownerUserId,
  athleteProfileId,
  updates,
}: {
  supabase: any
  ownerUserId: string
  athleteProfileId: string
  updates: Partial<Pick<AthleteProfileRow, 'full_name' | 'avatar_url' | 'bio' | 'sport' | 'location' | 'season' | 'grade_level' | 'birthdate'>>
}) {
  const { data: existingProfile, error: existingError } = await getAthleteProfileById({
    supabase,
    ownerUserId,
    athleteProfileId,
  })
  if (existingError || !existingProfile) return { data: null, error: existingError || new Error('Profile not found') }

  if (existingProfile.is_primary) {
    return upsertPrimaryAthleteProfile({
      supabase,
      ownerUserId,
      updates,
    })
  }

  const nextName = String(updates.full_name || existingProfile.full_name || 'Athlete').trim() || 'Athlete'
  const slug = await resolveUniqueAthleteProfileSlug({
    supabase,
    ownerUserId,
    fullName: nextName,
    excludeId: athleteProfileId,
  })
  const payload = {
    full_name: nextName,
    avatar_url: updates.avatar_url !== undefined ? updates.avatar_url : (existingProfile.avatar_url ?? null),
    bio: updates.bio !== undefined ? updates.bio : (existingProfile.bio ?? null),
    sport: updates.sport !== undefined ? updates.sport : (existingProfile.sport ?? null),
    location: updates.location !== undefined ? updates.location : (existingProfile.location ?? null),
    season: updates.season !== undefined ? updates.season : (existingProfile.season ?? null),
    grade_level: updates.grade_level !== undefined ? updates.grade_level : (existingProfile.grade_level ?? null),
    birthdate: updates.birthdate !== undefined ? normalizeAthleteBirthdate(updates.birthdate) : (existingProfile.birthdate ?? null),
    slug,
  }

  const { data, error } = await supabase
    .from('athlete_profiles')
    .update(payload)
    .eq('id', athleteProfileId)
    .eq('owner_user_id', ownerUserId)
    .select(ATHLETE_PROFILE_SELECT)
    .single()

  if (error) return { data: null, error }

  await upsertLegacySubProfile({
    supabase,
    payload: {
      id: athleteProfileId,
      user_id: ownerUserId,
      name: payload.full_name,
      sport: payload.sport || 'General',
      avatar_url: payload.avatar_url,
      bio: payload.bio,
      birthdate: payload.birthdate,
      grade_level: payload.grade_level,
      season: payload.season,
      location: payload.location,
    },
  })

  return { data: data as AthleteProfileRow, error: null }
}

export async function deleteAthleteProfile({
  supabase,
  ownerUserId,
  athleteProfileId,
}: {
  supabase: any
  ownerUserId: string
  athleteProfileId: string
}) {
  const { data: existingProfile, error: existingError } = await getAthleteProfileById({
    supabase,
    ownerUserId,
    athleteProfileId,
  })
  if (existingError || !existingProfile) return { error: existingError || new Error('Profile not found') }
  if (existingProfile.is_primary) return { error: new Error('Primary profile cannot be deleted') }

  const { error } = await supabase
    .from('athlete_profiles')
    .delete()
    .eq('id', athleteProfileId)
    .eq('owner_user_id', ownerUserId)

  if (error) return { error }

  await supabase.from('athlete_sub_profiles').delete().eq('id', athleteProfileId).eq('user_id', ownerUserId)
  return { error: null }
}
