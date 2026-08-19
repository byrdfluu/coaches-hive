import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ROLES = ['org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director', 'team_manager', 'admin']
const STATUSES = ['enrolled', 'waitlisted', 'withdrawn', 'graduated']

async function orgFor(userId: string) {
  const { data } = await supabaseAdmin.from('organization_memberships').select('org_id').eq('user_id', userId).maybeSingle()
  return data?.org_id || null
}

// GET /api/org/roster-status — season roster/enrollment status per athlete.
// This is the org_enrollments table the iOS app already reads/writes; web
// previously had no view into it at all.
export async function GET() {
  const { session, error } = await getSessionRole(ROLES)
  if (error || !session) return error
  const orgId = await orgFor(session.user.id)
  if (!orgId) return jsonError('Organization not found', 404)

  const { data: rows, error: q } = await supabaseAdmin
    .from('org_enrollments')
    .select('id, athlete_id, team_id, season, status, enrolled_at')
    .eq('org_id', orgId)
    .order('enrolled_at', { ascending: false })
  if (q) return jsonError(q.message, 500)

  const athleteIds = Array.from(new Set((rows || []).map((row) => row.athlete_id).filter(Boolean)))
  const teamIds = Array.from(new Set((rows || []).map((row) => row.team_id).filter(Boolean)))

  const [{ data: athletes }, { data: teams }] = await Promise.all([
    athleteIds.length
      ? supabaseAdmin.from('athlete_profiles').select('id, full_name, owner_user_id').in('id', athleteIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; owner_user_id: string | null }> }),
    teamIds.length
      ? supabaseAdmin.from('org_teams').select('id, name').in('id', teamIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
  ])

  const athleteMap = new Map((athletes || []).map((row) => [row.id, row]))
  const teamMap = new Map((teams || []).map((row) => [row.id, row.name]))

  const enrollments = (rows || []).map((row) => {
    const athlete = athleteMap.get(row.athlete_id)
    return {
      id: row.id,
      athlete_id: row.athlete_id,
      athlete_name: athlete?.full_name || 'Athlete',
      guardian_user_id: athlete?.owner_user_id || null,
      team_id: row.team_id,
      team_name: row.team_id ? teamMap.get(row.team_id) || null : null,
      season: row.season,
      status: row.status || 'enrolled',
      enrolled_at: row.enrolled_at,
    }
  })

  return NextResponse.json({ enrollments })
}

// PATCH /api/org/roster-status — update an athlete's season enrollment status
export async function PATCH(request: Request) {
  const { session, error } = await getSessionRole(ROLES)
  if (error || !session) return error
  const orgId = await orgFor(session.user.id)
  if (!orgId) return jsonError('Organization not found', 404)

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  const status = String(body.status || '')
  if (!id || !STATUSES.includes(status)) return jsonError('id and a valid status are required')

  const { error: q } = await supabaseAdmin
    .from('org_enrollments')
    .update({ status })
    .eq('id', id)
    .eq('org_id', orgId)
  if (q) return jsonError(q.message, 500)

  return NextResponse.json({ ok: true })
}
