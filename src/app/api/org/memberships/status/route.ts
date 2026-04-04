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
  const status = body?.status
  if (!membershipId || !status) return jsonError('Missing membership or status.', 400)
  if (!['active', 'suspended'].includes(status)) return jsonError('Invalid status.', 400)

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
    return jsonError('You cannot change your own status.', 400)
  }

  const updates = {
    status,
    suspended_at: status === 'suspended' ? new Date().toISOString() : null,
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('organization_memberships')
    .update(updates)
    .eq('id', membershipId)
    .select('id, user_id, role, status, created_at')
    .single()

  if (updateError || !updated) return jsonError(updateError?.message || 'Unable to update status.', 500)

  return NextResponse.json({ membership: updated })
}
