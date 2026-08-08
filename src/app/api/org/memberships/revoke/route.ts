import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const adminRoles = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'admin',
]

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const membershipId = body?.membership_id
  if (!membershipId) return jsonError('Missing membership.', 400)

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('id, org_id, user_id')
    .eq('id', membershipId)
    .maybeSingle()
  if (!membership) return jsonError('Membership not found.', 404)

  const { data: adminMembership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role')
    .eq('org_id', membership.org_id)
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (!adminMembership) return jsonError('Forbidden', 403)

  if (membership.user_id === session.user.id) {
    return jsonError('You cannot revoke your own access.', 400)
  }

  await supabaseAdmin.from('org_team_members').delete().eq('athlete_id', membership.user_id)
  await supabaseAdmin.from('org_team_coaches').delete().eq('coach_id', membership.user_id)
  await supabaseAdmin.from('organization_memberships').delete().eq('id', membershipId)

  return NextResponse.json({ ok: true })
}
