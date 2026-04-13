import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { ATHLETE_PROFILE_LIMITS } from '@/lib/planRules'
import { getSessionRoleState } from '@/lib/sessionRoleState'
import { createAthleteProfile, syncAthleteProfilesForOwner } from '@/lib/athleteProfiles'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, supabase, error } = await getSessionRole(['athlete'])
  if (error) return error

  const userId = session!.user.id

  const { data, error: dbError } = await syncAthleteProfilesForOwner({
    supabase,
    ownerUserId: userId,
  })

  if (dbError) return jsonError('Unable to load profiles.', 500)

  return NextResponse.json(
    (data || [])
      .filter((profile) => !profile.is_primary)
      .map((profile) => ({
        id: profile.id,
        name: profile.full_name,
        sport: profile.sport || 'General',
        avatar_url: profile.avatar_url || null,
        bio: profile.bio || null,
        birthdate: profile.birthdate || null,
        grade_level: profile.grade_level || null,
        season: profile.season || null,
        location: profile.location || null,
        created_at: profile.created_at || null,
      })),
  )
}

export async function POST(request: Request) {
  const { session, supabase, error } = await getSessionRole(['athlete'])
  if (error) return error

  const userId = session!.user.id
  const tier = (getSessionRoleState(session!.user.user_metadata).selectedTier as 'explore' | 'train' | 'family' | null) || 'explore'

  const payload = await request.json().catch(() => ({}))
  const name = String(payload?.name || '').trim()
  const sport = String(payload?.sport || '').trim() || 'General'
  const bio = typeof payload?.bio === 'string' ? payload.bio.trim() || null : null
  const birthdate = typeof payload?.birthdate === 'string' ? payload.birthdate || null : null
  const grade_level = typeof payload?.grade_level === 'string' ? payload.grade_level.trim() || null : null
  const season = typeof payload?.season === 'string' ? payload.season.trim() || null : null
  const location = typeof payload?.location === 'string' ? payload.location.trim() || null : null

  if (!name) return jsonError('Name is required.')
  if (name.length > 80) return jsonError('Name must be 80 characters or fewer.')

  // Reject duplicate sub-profile names for the same user
  const { count: dupeCount } = await supabase
    .from('athlete_sub_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .ilike('name', name)
  if ((dupeCount ?? 0) > 0) return jsonError('A profile with that name already exists.', 409)

  // Enforce tier limit (count the default profile + sub-profiles)
  const profileLimit = ATHLETE_PROFILE_LIMITS[tier]
  if (profileLimit !== null) {
    const { data: existingProfiles } = await syncAthleteProfilesForOwner({
      supabase,
      ownerUserId: userId,
    })
    // +1 for the default account profile
    if ((existingProfiles?.length || 0) >= profileLimit) {
      return jsonError('Profile limit reached for your current plan. Upgrade to add more.', 403)
    }
  }

  const { data, error: dbError } = await createAthleteProfile({
    supabase,
    ownerUserId: userId,
    payload: {
      full_name: name,
      sport,
      bio,
      birthdate,
      grade_level,
      season,
      location,
    },
  })

  if (dbError) return jsonError('Unable to create profile.', 500)

  return NextResponse.json(
    {
      id: data!.id,
      name: data!.full_name,
      sport: data!.sport || 'General',
      avatar_url: data!.avatar_url || null,
      bio: data!.bio || null,
      birthdate: data!.birthdate || null,
      grade_level: data!.grade_level || null,
      season: data!.season || null,
      location: data!.location || null,
    },
    { status: 201 },
  )
}
