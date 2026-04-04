import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function GET(request: Request) {
  const { session, role, error: sessionError } = await getSessionRole(['coach', 'athlete', 'admin'])
  if (sessionError || !session) return sessionError

  const url = new URL(request.url)
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  const coachId = url.searchParams.get('coach_id')

  let query = supabaseAdmin.from('sessions').select('*').order('start_time', {
    ascending: true,
  }).limit(500)

  if (role === 'coach') {
    query = query.eq('coach_id', session.user.id)
  } else if (role === 'athlete') {
    query = query.eq('athlete_id', session.user.id)
    if (coachId) {
      query = query.eq('coach_id', coachId)
    }
  } else if (role === 'admin') {
    if (coachId) {
      query = query.eq('coach_id', coachId)
    }
  } else {
    return jsonError('Forbidden', 403)
  }

  if (start) {
    query = query.gte('start_time', start)
  }
  if (end) {
    query = query.lte('start_time', end)
  }

  const { data, error: queryError } = await query
  if (queryError) {
    console.error('[sessions] query error:', queryError.message)
    return jsonError('Unable to load sessions. Please try again.', 500)
  }

  const sessions = data || []

  // Attach display names so clients don't need RLS-blocked cross-user profile lookups
  const athleteIds = Array.from(new Set(sessions.map((s: any) => s.athlete_id).filter(Boolean))) as string[]
  const coachIds = Array.from(new Set(sessions.map((s: any) => s.coach_id).filter(Boolean))) as string[]
  const profileIds = Array.from(new Set([...athleteIds, ...coachIds]))

  let nameMap: Record<string, string> = {}
  if (profileIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .in('id', profileIds)
    ;(profiles || []).forEach((p: any) => {
      if (p.id && p.full_name) nameMap[p.id] = p.full_name
    })
  }

  return NextResponse.json({
    sessions: sessions.map((s: any) => ({
      ...s,
      athlete_name: s.athlete_id ? (nameMap[s.athlete_id] || null) : null,
      coach_name: s.coach_id ? (nameMap[s.coach_id] || null) : null,
    })),
  })
}
