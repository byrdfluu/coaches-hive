import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendOrgInviteEmail } from '@/lib/inviteDelivery'
export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
]

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole([
    ...ORG_ADMIN_ROLES,
    'admin',
  ])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { coach_email, coach_id, role: inviteRole, team_id, inviter_name } = body || {}

  if (!coach_email) {
    return jsonError('coach_email is required', 400)
  }

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (!membership?.org_id) return jsonError('No organization found', 404)

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('org_name')
    .eq('org_id', membership.org_id)
    .maybeSingle()
  const orgName = (orgSettings as { org_name?: string | null } | null)?.org_name || 'Your organization'

  // Check if coach is already a member
  if (coach_id) {
    const { data: existingMembership } = await supabaseAdmin
      .from('organization_memberships')
      .select('id')
      .eq('org_id', membership.org_id)
      .eq('user_id', coach_id)
      .maybeSingle()
    if (existingMembership) {
      return jsonError('This coach is already in your organization.', 400)
    }
  }

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from('org_invites')
    .insert({
      org_id: membership.org_id,
      invited_email: coach_email,
      invited_user_id: coach_id || null,
      role: inviteRole || 'coach',
      team_id: team_id || null,
      status: 'pending',
    })
    .select()
    .single()

  if (inviteError || !invite) {
    return jsonError(inviteError?.message || 'Failed to create invite', 500)
  }

  let teamName: string | undefined
  if (team_id) {
    const { data: teamRow } = await supabaseAdmin
      .from('org_teams')
      .select('name')
      .eq('id', team_id)
      .maybeSingle()
    teamName = (teamRow as { name?: string | null } | null)?.name || undefined
  }

  await sendOrgInviteEmail({
    toEmail: coach_email,
    inviteId: invite.id,
    orgId: membership.org_id,
    orgName,
    teamId: team_id || undefined,
    teamName,
    role: inviteRole || 'coach',
    inviterName: inviter_name || 'Your organization',
    isNewUser: false,
  })

  return NextResponse.json({ ok: true })
}
