import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

type Kind = 'program' | 'tryout' | 'training_package' | 'training_session' | 'calendar_event'
type Assignment = {
  id: string
  organization_id: string | null
  kind: Kind
  title: string
  when: string | null
  location: string | null
  status: string | null
  roster_rpc: string | null
  roster_arg: string | null
}

const decodeCursor = (value: string | null) => {
  if (!value) return 0
  try {
    const offset = Number(Buffer.from(value, 'base64url').toString('utf8'))
    return Number.isInteger(offset) && offset >= 0 ? offset : null
  } catch {
    return null
  }
}

const encodeCursor = (offset: number) => Buffer.from(String(offset)).toString('base64url')

export async function GET(request: Request) {
  const { session, error } = await getSessionRole([
    'coach', 'assistant_coach', 'team_manager', 'program_director', 'org_admin', 'admin',
    'club_admin', 'travel_admin', 'school_admin', 'athletic_director',
  ])
  if (error || !session) return error

  const url = new URL(request.url)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20))
  const offset = decodeCursor(url.searchParams.get('cursor'))
  if (offset === null) return jsonError('Invalid assignment cursor.', 422)

  const coachId = session.user.id
  const [programLinks, tryoutLinks, packageLinks, sessionLinks, eventLinks] = await Promise.all([
    supabaseAdmin.from('org_program_coaches').select('program_id').eq('coach_id', coachId),
    supabaseAdmin.from('org_tryout_coaches').select('tryout_id').eq('coach_id', coachId),
    supabaseAdmin.from('org_training_package_coaches').select('package_id').eq('coach_id', coachId),
    supabaseAdmin.from('org_training_session_coaches').select('session_id').eq('coach_id', coachId),
    supabaseAdmin.from('org_calendar_event_coaches').select('event_id').eq('coach_id', coachId),
  ])
  const linkResults = [programLinks, tryoutLinks, packageLinks, sessionLinks, eventLinks]
  const linkError = linkResults.find((result) => result.error)?.error
  if (linkError) {
    console.error('[coach/organization-assignments] assignment lookup failed', linkError)
    return jsonError('Organization assignments are temporarily unavailable.', 503)
  }

  const ids = {
    program: (programLinks.data || []).map((row) => row.program_id),
    tryout: (tryoutLinks.data || []).map((row) => row.tryout_id),
    training_package: (packageLinks.data || []).map((row) => row.package_id),
    training_session: (sessionLinks.data || []).map((row) => row.session_id),
    calendar_event: (eventLinks.data || []).map((row) => row.event_id),
  }
  const query = (table: string, select: string, values: string[]) => values.length
    ? supabaseAdmin.from(table).select(select).in('id', values)
    : Promise.resolve({ data: [], error: null })
  const [programs, tryouts, packages, sessions, events] = await Promise.all([
    query('programs', 'id,org_id,name,start_date,location,status', ids.program),
    query('org_tryouts', 'id,org_id,title,tryout_date,location,status', ids.tryout),
    query('org_training_packages', 'id,org_id,name,status,location', ids.training_package),
    query('org_training_sessions', 'id,org_id,title,starts_at,location,status', ids.training_session),
    query('practice_plans', 'id,org_id,title,start_time,location,status', ids.calendar_event),
  ])
  const detailResults = [programs, tryouts, packages, sessions, events]
  const detailError = detailResults.find((result) => result.error)?.error
  if (detailError) {
    console.error('[coach/organization-assignments] assignment projection failed', detailError)
    return jsonError('Organization assignment details are temporarily unavailable.', 503)
  }

  const item = (row: any, kind: Kind, title: string, when: string | null, rosterRpc: string | null, rosterArg: string | null): Assignment => ({
    id: row.id,
    organization_id: row.org_id || null,
    kind,
    title,
    when,
    location: row.location || null,
    status: row.status || null,
    roster_rpc: rosterRpc,
    roster_arg: rosterArg,
  })
  const assignments: Assignment[] = [
    ...(programs.data || []).map((row: any) => item(row, 'program', row.name || 'Program', row.start_date || null, 'my_org_program_roster', 'p_program_id')),
    ...(tryouts.data || []).map((row: any) => item(row, 'tryout', row.title || 'Tryout', row.tryout_date || null, 'my_org_tryout_roster', 'p_tryout_id')),
    ...(packages.data || []).map((row: any) => item(row, 'training_package', row.name || 'Training package', null, null, null)),
    ...(sessions.data || []).map((row: any) => item(row, 'training_session', row.title || 'Training session', row.starts_at || null, 'my_org_training_session_roster', 'p_session_id')),
    ...(events.data || []).map((row: any) => item(row, 'calendar_event', row.title || 'Calendar event', row.start_time || null, 'my_org_calendar_event_roster', 'p_event_id')),
  ].sort((a, b) => {
    const time = new Date(a.when || '2999-12-31').getTime() - new Date(b.when || '2999-12-31').getTime()
    return time || `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)
  })
  const page = assignments.slice(offset, offset + limit)
  return NextResponse.json({
    assignments: page,
    next_cursor: offset + limit < assignments.length ? encodeCursor(offset + limit) : null,
    total: assignments.length,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
