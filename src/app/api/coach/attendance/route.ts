import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveActiveCoachContext } from '@/lib/activeCoachContext'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error
  const context = await resolveActiveCoachContext(session.user.id)
  let sessionsQuery = supabaseAdmin.from('sessions').select('id,title,start_time,end_time,status').eq('coach_id', session.user.id)
  if (context.organizationId) sessionsQuery = sessionsQuery.eq('org_id', context.organizationId)
  else sessionsQuery = sessionsQuery.is('org_id', null)
  if (context.teamId) sessionsQuery = sessionsQuery.eq('team_id', context.teamId)
  const [{ data: sessions, error: sessionsError }, { data: links }] = await Promise.all([
    sessionsQuery.order('start_time', { ascending: false }).limit(30),
    supabaseAdmin.from('coach_athlete_links').select('athlete_id').eq('coach_id', session.user.id).eq('status', 'active'),
  ])
  if (sessionsError) return jsonError(sessionsError.message, 500)
  const linkedUserIds = (links || []).map((row) => row.athlete_id)
  const sessionIds = (sessions || []).map((row) => row.id)
  const [{ data: athletes }, { data: attendance }] = await Promise.all([
    linkedUserIds.length ? supabaseAdmin.from('athlete_profiles').select('id,owner_user_id,full_name').in('owner_user_id', linkedUserIds).eq('is_primary', true) : Promise.resolve({ data: [] }),
    sessionIds.length ? supabaseAdmin.from('session_attendance').select('id,session_id,athlete_id,status').in('session_id', sessionIds) : Promise.resolve({ data: [] }),
  ])
  const records = (attendance || []) as Array<{ id: string; session_id: string; athlete_id: string; status: string }>
  return NextResponse.json({ sessions: (sessions || []).map((item) => ({
    ...item,
    attendance: (athletes || []).map((athlete) => {
      const existing = records.find((record) => record.session_id === item.id && record.athlete_id === athlete.owner_user_id)
      return { id: existing?.id || null, athlete_id: athlete.owner_user_id, athlete_profile_id: athlete.id, athlete_name: athlete.full_name || 'Athlete', status: existing?.status || 'pending' }
    }),
  })) })
}

export async function PATCH(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const sessionId = String(body.session_id || '')
  const athleteId = String(body.athlete_id || '')
  const status = String(body.status || '')
  if (!sessionId || !athleteId || !['pending', 'present', 'absent'].includes(status)) return jsonError('session_id, athlete_id, and a valid status are required')
  const context = await resolveActiveCoachContext(session.user.id)
  let ownedSessionQuery = supabaseAdmin.from('sessions').select('id').eq('id', sessionId).eq('coach_id', session.user.id)
  if (context.organizationId) ownedSessionQuery = ownedSessionQuery.eq('org_id', context.organizationId)
  else ownedSessionQuery = ownedSessionQuery.is('org_id', null)
  if (context.teamId) ownedSessionQuery = ownedSessionQuery.eq('team_id', context.teamId)
  const { data: ownedSession } = await ownedSessionQuery.maybeSingle()
  if (!ownedSession) return jsonError('Session not found', 404)
  const { error: upsertError } = await supabaseAdmin.from('session_attendance').upsert({
    session_id: sessionId,
    athlete_id: athleteId,
    status,
    marked_by: session.user.id,
    marked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'session_id,athlete_id' })
  if (upsertError) return jsonError(upsertError.message, 500)
  return NextResponse.json({ ok: true })
}
