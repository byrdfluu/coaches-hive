import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAthleteProfileSelection } from '@/lib/athleteProfiles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

type NoteRow = {
  id: string
  athlete_id: string
  athlete_profile_id?: string | null
  author_id?: string | null
  note: string
  created_at?: string | null
  sub_profile_id?: string | null
}

const enrichNotes = async (athleteId: string, rows: NoteRow[]) => {
  const authorIds = Array.from(
    new Set(rows.map((row) => row.author_id).filter((id): id is string => Boolean(id && id !== athleteId)))
  )

  const authorMap = new Map<string, string>()
  if (authorIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .in('id', authorIds)

    ;(profiles || []).forEach((profile) => {
      if (profile.id) {
        authorMap.set(profile.id, profile.full_name || 'Coach')
      }
    })
  }

  return rows.map((row) => ({
    ...row,
    author_name: row.author_id === athleteId ? 'You' : authorMap.get(String(row.author_id || '')) || 'Coach',
    authored_by_current_user: row.author_id === athleteId,
  }))
}

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const athleteId = session.user.id
  const { searchParams } = new URL(request.url)
  const athleteProfileId = searchParams.get('athlete_profile_id') || null
  const subProfileId = searchParams.get('sub_profile_id') || null
  const { data: selection } = await resolveAthleteProfileSelection({
    supabase: supabaseAdmin,
    ownerUserId: athleteId,
    athleteProfileId,
    subProfileId,
  })
  if (!selection) {
    return jsonError('Athlete profile not found', 404)
  }

  let query = supabaseAdmin
    .from('athlete_progress_notes')
    .select('id, athlete_id, athlete_profile_id, author_id, note, created_at, sub_profile_id')
    .eq('athlete_id', athleteId)
    .eq('athlete_profile_id', selection.athleteProfileId)
    .order('created_at', { ascending: false })
    .limit(50)

  const { data, error: dbError } = await query

  if (dbError) {
    return jsonError('Unable to load notes.', 500)
  }

  if (!data || data.length === 0) {
    let legacyQuery = supabaseAdmin
      .from('athlete_progress_notes')
      .select('id, athlete_id, athlete_profile_id, author_id, note, created_at, sub_profile_id')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(50)

    legacyQuery = selection.legacySubProfileId
      ? legacyQuery.eq('sub_profile_id', selection.legacySubProfileId)
      : legacyQuery.is('sub_profile_id', null)

    const legacyResult = await legacyQuery
    const notes = await enrichNotes(athleteId, (legacyResult.data || []) as NoteRow[])
    return NextResponse.json({ notes, athlete_profile_id: selection.athleteProfileId })
  }

  const notes = await enrichNotes(athleteId, (data || []) as NoteRow[])
  return NextResponse.json({ notes, athlete_profile_id: selection.athleteProfileId })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const note = String(body?.note || '').trim()
  if (!note) {
    return jsonError('Note is required')
  }
  if (note.length > 50000) {
    return jsonError('Note must be 50,000 characters or fewer', 400)
  }

  const athleteId = session.user.id
  const athleteProfileId = typeof body?.athlete_profile_id === 'string' ? body.athlete_profile_id.trim() || null : null
  const subProfileId = typeof body?.sub_profile_id === 'string' ? body.sub_profile_id.trim() || null : null
  const { data: selection } = await resolveAthleteProfileSelection({
    supabase: supabaseAdmin,
    ownerUserId: athleteId,
    athleteProfileId,
    subProfileId,
  })
  if (!selection) return jsonError('Athlete profile not found', 404)

  const { data, error: dbError } = await supabaseAdmin
    .from('athlete_progress_notes')
    .insert({
      athlete_id: athleteId,
      athlete_profile_id: selection.athleteProfileId,
      author_id: athleteId,
      note,
      sub_profile_id: selection.legacySubProfileId,
    })
    .select('id, athlete_id, athlete_profile_id, author_id, note, created_at, sub_profile_id')
    .single()

  if (dbError || !data) {
    return jsonError('Unable to save note.', 500)
  }

  const [savedNote] = await enrichNotes(athleteId, [data as NoteRow])
  return NextResponse.json({ note: savedNote })
}

export async function DELETE(request: Request) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { searchParams } = new URL(request.url)
  const noteId = String(searchParams.get('id') || '').trim()
  if (!noteId) {
    return jsonError('Note id is required')
  }

  const athleteId = session.user.id
  const { data: note, error: noteError } = await supabaseAdmin
    .from('athlete_progress_notes')
    .select('id, athlete_id, author_id')
    .eq('id', noteId)
    .eq('athlete_id', athleteId)
    .maybeSingle()

  if (noteError) {
    return jsonError('Unable to load note.', 500)
  }
  if (!note) {
    return jsonError('Note not found', 404)
  }
  if (note.author_id && note.author_id !== athleteId) {
    return jsonError('Only notes you created can be deleted', 403)
  }

  const { error: deleteError } = await supabaseAdmin
    .from('athlete_progress_notes')
    .delete()
    .eq('id', noteId)
    .eq('athlete_id', athleteId)

  if (deleteError) {
    return jsonError('Unable to delete note.', 500)
  }

  return NextResponse.json({ ok: true })
}
