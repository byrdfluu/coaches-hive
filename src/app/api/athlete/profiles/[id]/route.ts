import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

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
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
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
