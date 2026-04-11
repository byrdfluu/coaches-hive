import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { id } = await params
  if (!id) return jsonError('Profile id is required')

  const { data, error: profileError } = await supabaseAdmin
    .from('athlete_sub_profiles')
    .select('id, name, sport, avatar_url, bio, birthdate, grade_level, season, location')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (profileError) return jsonError('Unable to load profile.', 500)
  if (!data) return jsonError('Profile not found', 404)

  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { id } = await params
  if (!id) return jsonError('Profile id is required')

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from('athlete_sub_profiles')
    .select('id')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!existing) return jsonError('Profile not found', 404)

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) {
    const newName = body.name.trim()
    if (newName.length > 80) return jsonError('Name must be 80 characters or fewer.')
    // Reject duplicate name (exclude this profile's own current name)
    const { count: dupeCount } = await supabaseAdmin
      .from('athlete_sub_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .ilike('name', newName)
      .neq('id', id)
    if ((dupeCount ?? 0) > 0) return jsonError('A profile with that name already exists.', 409)
    updates.name = newName
  }
  if (typeof body.sport === 'string') updates.sport = body.sport.trim() || 'General'
  if (typeof body.bio === 'string') updates.bio = body.bio.trim() || null
  if (typeof body.birthdate === 'string') updates.birthdate = body.birthdate || null
  if (typeof body.grade_level === 'string') updates.grade_level = body.grade_level.trim() || null
  if (typeof body.season === 'string') updates.season = body.season.trim() || null
  if (typeof body.location === 'string') updates.location = body.location.trim() || null

  if (Object.keys(updates).length === 0) return jsonError('No fields to update')

  const { data, error: updateError } = await supabaseAdmin
    .from('athlete_sub_profiles')
    .update(updates)
    .eq('id', id)
    .select('id, name, sport, avatar_url, bio, birthdate, grade_level, season, location')
    .single()

  if (updateError) return jsonError('Unable to update profile.', 500)

  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { id } = await params
  if (!id) return jsonError('Profile id is required')

  // Verify ownership before deleting
  const { data: existing } = await supabaseAdmin
    .from('athlete_sub_profiles')
    .select('id')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!existing) return jsonError('Profile not found', 404)

  const { error: deleteError } = await supabaseAdmin
    .from('athlete_sub_profiles')
    .delete()
    .eq('id', id)

  if (deleteError) return jsonError('Unable to delete profile.', 500)

  return NextResponse.json({ ok: true })
}
