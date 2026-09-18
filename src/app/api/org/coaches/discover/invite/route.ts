import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendOrgInviteEmail } from '@/lib/inviteDelivery'
import { createInviteToken, hashInviteToken, inviteTokenExpiresAt } from '@/lib/inviteTokens'
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
  const { coach_email, coach_id, role: inviteRole, team_id, organization_id } = body || {}

  if (!coach_email) {
    return jsonError('coach_email is required', 400)
  }

  if (!organization_id) return jsonError('organization_id is required', 400)
  const { data: membership } = await supabaseAdmin.from('organization_memberships')
    .select('org_id, role, status').eq('org_id', organization_id).eq('user_id', session.user.id).maybeSingle()
  if (!membership || membership.status === 'suspended' || !ORG_ADMIN_ROLES.includes(membership.role)) {
    return jsonError('Forbidden', 403)
  }

  const { data: authoritativeOrg } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('id', membership.org_id)
    .maybeSingle()
  if (!authoritativeOrg) return jsonError('Organization not found', 404)
  const orgName = authoritativeOrg.name
  if (team_id) {
    const { data: team } = await supabaseAdmin.from('org_teams').select('id')
      .eq('id', team_id).eq('org_id', authoritativeOrg.id).maybeSingle()
    if (!team) return jsonError('Team does not belong to this organization', 422)
  }
  const { data: inviterProfile } = await supabaseAdmin.from('profiles')
    .select('full_name, email').eq('id', session.user.id).maybeSingle()

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

  const inviteToken = createInviteToken()
  const { data: invite, error: inviteError } = await supabaseAdmin
    .from('org_invites')
    .insert({
      org_id: membership.org_id,
      organization_name: orgName,
      invited_email: coach_email,
      invited_user_id: coach_id || null,
      role: inviteRole || 'coach',
      team_id: team_id || null,
      status: 'pending',
      invited_by: session.user.id,
      invite_token_hash: hashInviteToken(inviteToken),
      token_expires_at: inviteTokenExpiresAt(),
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
    inviterName: inviterProfile?.full_name || inviterProfile?.email || session.user.email || 'Organization administrator',
    inviteToken,
  })

  return NextResponse.json({ ok: true })
}
