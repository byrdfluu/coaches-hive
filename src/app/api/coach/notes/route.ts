import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const coachId = session.user.id

  const { data, error: dbError } = await supabaseAdmin
    .from('coach_notes')
    .select('id, type, athlete, team, title, body, tags, shared, pinned, created_at')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (dbError) return jsonError('Failed to load notes', 500)

  return NextResponse.json({ notes: data || [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const coachId = session.user.id
  const body = await request.json().catch(() => null)
  const { type, athlete, team, title, body: noteBody, tags, shared } = body || {}

  if (!title || !String(title).trim()) return jsonError('Title is required')
  if (String(title).trim().length > 200) return jsonError('Title must be 200 characters or fewer', 400)
  if (!noteBody || !String(noteBody).trim()) return jsonError('Note body is required')
  if (String(noteBody).trim().length > 50000) return jsonError('Note body must be 50,000 characters or fewer', 400)

  const validTypes = ['session', 'progress', 'staff']
  const noteType = validTypes.includes(String(type)) ? String(type) : 'session'

  const { data, error: dbError } = await supabaseAdmin
    .from('coach_notes')
    .insert({
      coach_id: coachId,
      type: noteType,
      athlete: String(athlete || '').trim() || 'Athlete',
      team: String(team || '').trim() || 'Team',
      title: String(title).trim(),
      body: String(noteBody).trim(),
      tags: Array.isArray(tags) ? tags : [],
      shared: Boolean(shared),
      pinned: false,
    })
    .select('id, type, athlete, team, title, body, tags, shared, pinned, created_at')
    .single()

  if (dbError) return jsonError('Failed to save note', 500)

  return NextResponse.json({ note: data })
}

export async function PATCH(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const coachId = session.user.id
  const body = await request.json().catch(() => null)
  const { id, pinned, shared } = body || {}

  if (!id || typeof id !== 'string') return jsonError('Note id is required')

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (pinned !== undefined) updates.pinned = Boolean(pinned)
  if (shared !== undefined) updates.shared = Boolean(shared)

  const { data, error: dbError } = await supabaseAdmin
    .from('coach_notes')
    .update(updates)
    .eq('id', id)
    .eq('coach_id', coachId)
    .select('id, type, athlete, team, title, body, tags, shared, pinned, created_at')
    .single()

  if (dbError) return jsonError('Failed to update note', 500)
  if (!data) return jsonError('Note not found', 404)

  return NextResponse.json({ note: data })
}
