import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin, hasSupabaseAdminConfig } from '@/lib/supabaseAdmin'
import { ATHLETE_PROFILE_LIMITS } from '@/lib/planRules'
import { getSessionRoleState } from '@/lib/sessionRoleState'
import { createAthleteProfile, syncAthleteProfilesForOwner } from '@/lib/athleteProfiles'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await getSessionRole(['athlete'])
  if (error) return error

  if (!hasSupabaseAdminConfig) return jsonError('Service unavailable', 503)

  const userId = session!.user.id

  const { data, error: dbError } = await syncAthleteProfilesForOwner({
    supabase: supabaseAdmin,
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
  const { session, error } = await getSessionRole(['athlete'])
  if (error) return error

  if (!hasSupabaseAdminConfig) return jsonError('Service unavailable', 503)

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

  const { data: existingProfiles, error: syncError } = await syncAthleteProfilesForOwner({
    supabase: supabaseAdmin,
    ownerUserId: userId,
  })
  if (syncError) return jsonError('Unable to prepare athlete profiles.', 500)

  const dupeExists = (existingProfiles || []).some(
    (profile) => profile.full_name.trim().toLowerCase() === name.toLowerCase(),
  )
  if (dupeExists) return jsonError('A profile with that name already exists.', 409)

  // Enforce tier limit (count the default profile + sub-profiles)
  const profileLimit = ATHLETE_PROFILE_LIMITS[tier]
  if (profileLimit !== null && (existingProfiles?.length || 0) >= profileLimit) {
    return jsonError('Profile limit reached for your current plan. Upgrade to add more.', 403)
  }

  const { data, error: dbError } = await createAthleteProfile({
    supabase: supabaseAdmin,
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

  if (dbError) {
    console.error('[athlete/profiles] create error:', dbError.message, dbError.code)
    const duplicateConstraint = typeof dbError.code === 'string' && dbError.code === '23505'
    return jsonError(
      duplicateConstraint
        ? 'A profile with that name or slug already exists.'
        : (dbError.message || 'Unable to create profile.'),
      duplicateConstraint ? 409 : 500,
    )
  }

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
