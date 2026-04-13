import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  deleteAthleteProfile,
  getAthleteProfileById,
  syncAthleteProfilesForOwner,
  updateAthleteProfile,
} from '@/lib/athleteProfiles'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { id } = await params
  if (!id) return jsonError('Profile id is required')

  const { data, error: profileError } = await getAthleteProfileById({
    supabase: supabaseAdmin,
    ownerUserId: session.user.id,
    athleteProfileId: id,
  })

  if (profileError) return jsonError('Unable to load profile.', 500)
  if (!data || data.is_primary) return jsonError('Profile not found', 404)

  return NextResponse.json({
    id: data.id,
    name: data.full_name,
    sport: data.sport || 'General',
    avatar_url: data.avatar_url || null,
    bio: data.bio || null,
    birthdate: data.birthdate || null,
    grade_level: data.grade_level || null,
    season: data.season || null,
    location: data.location || null,
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { id } = await params
  if (!id) return jsonError('Profile id is required')

  const { data: existing } = await getAthleteProfileById({
    supabase: supabaseAdmin,
    ownerUserId: session.user.id,
    athleteProfileId: id,
  })
  if (!existing || existing.is_primary) return jsonError('Profile not found', 404)

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) {
    const newName = body.name.trim()
    if (newName.length > 80) return jsonError('Name must be 80 characters or fewer.')
    const { data: ownerProfiles } = await syncAthleteProfilesForOwner({
      supabase: supabaseAdmin,
      ownerUserId: session.user.id,
    })
    const dupeExists = (ownerProfiles || []).some(
      (profile) => profile.id !== id && profile.full_name.trim().toLowerCase() === newName.toLowerCase(),
    )
    if (dupeExists) return jsonError('A profile with that name already exists.', 409)
    updates.full_name = newName
  }
  if (typeof body.sport === 'string') updates.sport = body.sport.trim() || 'General'
  if (typeof body.bio === 'string') updates.bio = body.bio.trim() || null
  if (typeof body.birthdate === 'string') updates.birthdate = body.birthdate || null
  if (typeof body.grade_level === 'string') updates.grade_level = body.grade_level.trim() || null
  if (typeof body.season === 'string') updates.season = body.season.trim() || null
  if (typeof body.location === 'string') updates.location = body.location.trim() || null

  if (Object.keys(updates).length === 0) return jsonError('No fields to update')

  const { data, error: updateError } = await updateAthleteProfile({
    supabase: supabaseAdmin,
    ownerUserId: session.user.id,
    athleteProfileId: id,
    updates,
  })

  if (updateError) return jsonError('Unable to update profile.', 500)

  return NextResponse.json({
    id: data!.id,
    name: data!.full_name,
    sport: data!.sport || 'General',
    avatar_url: data!.avatar_url || null,
    bio: data!.bio || null,
    birthdate: data!.birthdate || null,
    grade_level: data!.grade_level || null,
    season: data!.season || null,
    location: data!.location || null,
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { id } = await params
  if (!id) return jsonError('Profile id is required')

  const { error: deleteError } = await deleteAthleteProfile({
    supabase: supabaseAdmin,
    ownerUserId: session.user.id,
    athleteProfileId: id,
  })

  if (deleteError) return jsonError('Unable to delete profile.', 500)

  return NextResponse.json({ ok: true })
}
