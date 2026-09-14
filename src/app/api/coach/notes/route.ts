import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveActiveCoachContext } from '@/lib/activeCoachContext'
import { resolveAuthorizedCoachAthleteProfileIds } from '@/lib/authorizedCoachAthletes'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' }

async function authorizedContext(coachId: string) {
  const [context, athleteIds] = await Promise.all([resolveActiveCoachContext(coachId), resolveAuthorizedCoachAthleteProfileIds(coachId)])
  return { context, athleteIds }
}

async function decorate(rows: Array<Record<string, any>>) {
  const ids = Array.from(new Set(rows.map((row) => String(row.athlete_id || '')).filter(Boolean)))
  const { data } = ids.length ? await supabaseAdmin.from('athlete_profiles').select('id,full_name,avatar_url').in('id', ids) : { data: [] }
  const byId = new Map((data || []).map((athlete) => [athlete.id, athlete]))
  return rows.map((row) => ({ ...row, athlete: byId.get(row.athlete_id) || null }))
}

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error
  const { context, athleteIds } = await authorizedContext(session.user.id)
  if (!athleteIds.length) return NextResponse.json({ notes: [], athletes: [], context }, { headers: noStore })
  const requestedId = new URL(request.url).searchParams.get('athlete_id')
  if (requestedId && !athleteIds.includes(requestedId)) return jsonError('Athlete is not available in the selected workspace.', 403)
  let query = supabaseAdmin.from('coach_notes').select('id,athlete_id,content,is_private,attachment_type,attachment_storage_path,attachment_file_name,attachment_content_type,attachment_size_bytes,attachment_duration_seconds,workspace_id,created_at,updated_at').eq('coach_id', session.user.id).in('athlete_id', athleteIds).order('created_at', { ascending: false })
  if (requestedId) query = query.eq('athlete_id', requestedId)
  const [notesResult, athletesResult] = await Promise.all([
    query,
    supabaseAdmin.from('athlete_profiles').select('id,full_name,avatar_url').in('id', athleteIds).eq('status', 'active').order('full_name'),
  ])
  if (notesResult.error) return jsonError('Failed to load notes for the selected workspace.', 500)
  return NextResponse.json({ notes: await decorate(notesResult.data || []), athletes: athletesResult.data || [], context }, { headers: noStore })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const athleteId = String(body.athlete_id || '')
  const content = String(body.content || '').trim()
  if (!content) return jsonError('Note content is required.')
  if (content.length > 50_000) return jsonError('Note content must be 50,000 characters or fewer.')
  const { context, athleteIds } = await authorizedContext(session.user.id)
  if (!athleteIds.includes(athleteId)) return jsonError('Athlete is not available in the selected workspace.', 403)
  const { data, error: dbError } = await supabaseAdmin.from('coach_notes').insert({ coach_id: session.user.id, athlete_id: athleteId, content, is_private: body.is_private !== false, workspace_id: context.workspaceId }).select('*').single()
  if (dbError) return jsonError('Failed to save note.', 500)
  return NextResponse.json({ note: (await decorate([data]))[0] }, { status: 201, headers: noStore })
}

export async function PATCH(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!id) return jsonError('Note id is required.')
  const { athleteIds } = await authorizedContext(session.user.id)
  const { data: existing } = await supabaseAdmin.from('coach_notes').select('id,athlete_id').eq('id', id).eq('coach_id', session.user.id).maybeSingle()
  if (!existing || !athleteIds.includes(existing.athlete_id)) return jsonError('Note not found in the selected workspace.', 404)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.content !== undefined) { const content = String(body.content || '').trim(); if (!content) return jsonError('Note content is required.'); updates.content = content }
  if (body.is_private !== undefined) updates.is_private = Boolean(body.is_private)
  const { data, error: dbError } = await supabaseAdmin.from('coach_notes').update(updates).eq('id', id).eq('coach_id', session.user.id).select('*').single()
  if (dbError) return jsonError('Failed to update note.', 500)
  return NextResponse.json({ note: (await decorate([data]))[0] }, { headers: noStore })
}

export async function DELETE(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!id) return jsonError('Note id is required.')
  const { athleteIds } = await authorizedContext(session.user.id)
  const { data: existing } = await supabaseAdmin.from('coach_notes').select('id,athlete_id').eq('id', id).eq('coach_id', session.user.id).maybeSingle()
  if (!existing || !athleteIds.includes(existing.athlete_id)) return jsonError('Note not found in the selected workspace.', 404)
  const { error: dbError } = await supabaseAdmin.from('coach_notes').delete().eq('id', id).eq('coach_id', session.user.id)
  if (dbError) return jsonError('Failed to delete note.', 500)
  return NextResponse.json({ ok: true }, { headers: noStore })
}
