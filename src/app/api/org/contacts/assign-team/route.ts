import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

const ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'admin',
  'superadmin',
]

const COACH_ROLES = ['coach', 'assistant_coach', 'head_coach']

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ADMIN_ROLES)
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const { contact_ids, team_id } = body

  if (!team_id || !Array.isArray(contact_ids) || contact_ids.length === 0) {
    return jsonError('contact_ids and team_id are required', 400)
  }

  // Verify the requesting user belongs to an org that owns this team
  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!membership?.org_id) return jsonError('Organization not found', 404)

  const { data: team } = await supabaseAdmin
    .from('org_teams')
    .select('id')
    .eq('id', team_id)
    .eq('org_id', membership.org_id)
    .maybeSingle()

  if (!team) return jsonError('Team not found', 404)

  // Look up each contact's role to determine which table to upsert into
  const { data: memberships } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id, role')
    .eq('org_id', membership.org_id)
    .in('user_id', contact_ids)

  if (!memberships || memberships.length === 0) {
    return jsonError('No matching contacts found', 404)
  }

  const coachUpserts: { team_id: string; coach_id: string }[] = []
  const athleteUpserts: { team_id: string; athlete_id: string }[] = []

  for (const m of memberships) {
    if (COACH_ROLES.includes(m.role)) {
      coachUpserts.push({ team_id, coach_id: m.user_id })
    } else {
      athleteUpserts.push({ team_id, athlete_id: m.user_id })
    }
  }

  const errors: string[] = []

  if (coachUpserts.length > 0) {
    const { error: coachErr } = await supabaseAdmin
      .from('org_team_coaches')
      .upsert(coachUpserts, { onConflict: 'team_id,coach_id' })
    if (coachErr) errors.push(coachErr.message)
  }

  if (athleteUpserts.length > 0) {
    const { error: athleteErr } = await supabaseAdmin
      .from('org_team_members')
      .upsert(athleteUpserts, { onConflict: 'team_id,athlete_id' })
    if (athleteErr) errors.push(athleteErr.message)
  }

  if (errors.length > 0) {
    return jsonError(errors.join('; '), 500)
  }

  return NextResponse.json({ success: true })
}
