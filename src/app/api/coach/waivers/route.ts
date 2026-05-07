import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const missingCoachWaiverTables = (message?: string | null) =>
  /coach_waivers|coach_waiver_assignments|schema cache|relation .* does not exist|table .* does not exist/i.test(String(message || ''))

const displayName = (profile?: { full_name?: string | null; email?: string | null } | null) => {
  const name = String(profile?.full_name || '').trim()
  if (name) return name
  const email = String(profile?.email || '').trim()
  return email ? email.split('@')[0] || 'Athlete' : 'Athlete'
}

const loadLinkedAthletes = async (coachId: string) => {
  const { data, error } = await supabaseAdmin
    .from('coach_athlete_links')
    .select('athlete_id, profiles!coach_athlete_links_athlete_id_fkey(id, full_name, email)')
    .eq('coach_id', coachId)
    .eq('status', 'active')

  if (error) return { athletes: [], error }

  const athletes = (data || [])
    .filter((link) => Boolean(link.athlete_id))
    .map((link) => {
      const profile = Array.isArray(link.profiles) ? link.profiles[0] : link.profiles
      return {
        id: String(link.athlete_id),
        name: displayName(profile),
        email: profile?.email || null,
      }
    })

  return { athletes, error: null }
}

export async function GET() {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const coachId = session.user.id
  const { athletes, error: athletesError } = await loadLinkedAthletes(coachId)
  if (athletesError) return jsonError(athletesError.message, 500)

  const { data: waivers, error: waiversError } = await supabaseAdmin
    .from('coach_waivers')
    .select('id, title, body, is_active, created_at')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })

  if (waiversError) {
    if (missingCoachWaiverTables(waiversError.message)) {
      return NextResponse.json({
        setup_required: true,
        setup_sql: 'supabase/coach_waivers.sql',
        athletes,
        waivers: [],
      })
    }
    return jsonError(waiversError.message, 500)
  }

  const waiverIds = (waivers || []).map((waiver) => waiver.id)
  const { data: assignments, error: assignmentsError } = waiverIds.length
    ? await supabaseAdmin
        .from('coach_waiver_assignments')
        .select('id, waiver_id, athlete_id, status, sent_at, signed_at, full_name')
        .eq('coach_id', coachId)
        .in('waiver_id', waiverIds)
    : { data: [], error: null }

  if (assignmentsError) {
    if (missingCoachWaiverTables(assignmentsError.message)) {
      return NextResponse.json({
        setup_required: true,
        setup_sql: 'supabase/coach_waivers.sql',
        athletes,
        waivers: [],
      })
    }
    return jsonError(assignmentsError.message, 500)
  }

  const athleteMap = new Map(athletes.map((athlete) => [athlete.id, athlete]))
  const assignmentsByWaiver = new Map<string, Array<any>>()
  ;(assignments || []).forEach((assignment) => {
    const list = assignmentsByWaiver.get(assignment.waiver_id) || []
    list.push({
      ...assignment,
      athlete_name: athleteMap.get(String(assignment.athlete_id))?.name || 'Athlete',
      athlete_email: athleteMap.get(String(assignment.athlete_id))?.email || null,
    })
    assignmentsByWaiver.set(assignment.waiver_id, list)
  })

  return NextResponse.json({
    setup_required: false,
    athletes,
    waivers: (waivers || []).map((waiver) => {
      const waiverAssignments = assignmentsByWaiver.get(waiver.id) || []
      const signed = waiverAssignments.filter((assignment) => assignment.signed_at).length
      return {
        ...waiver,
        sent_count: waiverAssignments.length,
        signed_count: signed,
        pending_count: Math.max(0, waiverAssignments.length - signed),
        assignments: waiverAssignments,
      }
    }),
  })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const coachId = session.user.id
  const body = await request.json().catch(() => ({}))
  const title = String(body?.title || '').trim()
  const waiverBody = String(body?.body || '').trim()
  const athleteIds: string[] = Array.isArray(body?.athlete_ids)
    ? Array.from(new Set(body.athlete_ids.map((id: unknown) => String(id || '').trim()).filter(Boolean)))
    : []

  if (!title) return jsonError('title is required')
  if (!waiverBody) return jsonError('body is required')
  if (athleteIds.length === 0) return jsonError('Select at least one athlete')

  const { athletes, error: athletesError } = await loadLinkedAthletes(coachId)
  if (athletesError) return jsonError(athletesError.message, 500)

  const linkedAthleteIds = new Set(athletes.map((athlete) => athlete.id))
  const invalidAthlete = athleteIds.find((id) => !linkedAthleteIds.has(id))
  if (invalidAthlete) return jsonError('Selected athlete is not linked to this coach', 403)

  const { data: waiver, error: waiverError } = await supabaseAdmin
    .from('coach_waivers')
    .insert({
      coach_id: coachId,
      title,
      body: waiverBody,
      is_active: true,
    })
    .select('id, title, body, is_active, created_at')
    .single()

  if (waiverError) {
    if (missingCoachWaiverTables(waiverError.message)) {
      return NextResponse.json(
        { error: 'Coach waiver tables are not installed. Run supabase/coach_waivers.sql first.', setup_required: true },
        { status: 503 },
      )
    }
    return jsonError(waiverError.message, 500)
  }

  const assignmentRows = athleteIds.map((athleteId) => ({
    waiver_id: waiver.id,
    coach_id: coachId,
    athlete_id: athleteId,
    status: 'sent',
  }))

  const { data: assignments, error: assignmentsError } = await supabaseAdmin
    .from('coach_waiver_assignments')
    .insert(assignmentRows)
    .select('id, waiver_id, athlete_id, status, sent_at, signed_at')

  if (assignmentsError) return jsonError(assignmentsError.message, 500)

  return NextResponse.json({ waiver, assignments: assignments || [] })
}
