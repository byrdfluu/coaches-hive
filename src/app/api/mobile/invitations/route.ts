import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileError } from '@/lib/mobilePaymentApi'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireWorkspaceContext, workspaceCan } from '@/lib/workspaceAuthority'
import { createInvitationCode, createInviteToken, hashInviteToken, inviteTokenExpiresAt } from '@/lib/inviteTokens'
import { sendMobileOrgInviteEmail } from '@/lib/inviteDelivery'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const INVITABLE_ROLES = new Set([
  'org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director',
  'program_director', 'team_manager', 'coach', 'assistant_coach', 'athlete',
])

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return mobileError('Unauthorized', 401, false)

  const body = await request.json().catch(() => null)
  const email = String(body?.email || body?.invited_email || '').trim().toLowerCase()
  const orgId = String(body?.organization_id || body?.org_id || '').trim()
  const bodyWorkspaceId = String(body?.workspace_id || '').trim()
  const headerWorkspaceId = request.headers.get('x-workspace-id')?.trim() || ''
  const workspaceId = headerWorkspaceId || bodyWorkspaceId
  const selectedRoles: string[] = Array.isArray(body?.roles)
    ? body.roles.map((value: unknown) => String(value))
    : [String(body?.role || '')]
  const roles: string[] = Array.from(new Set(selectedRoles.map((role: string) => role.trim()).filter(Boolean)))

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return mobileError('A valid invited email is required', 400, false)
  if (!orgId || !workspaceId) return mobileError('organization_id and workspace_id are required', 400, false)
  if (!roles.length || roles.some(role => !INVITABLE_ROLES.has(role))) return mobileError('One or more selected roles are invalid', 422, false)

  const workspace = await requireWorkspaceContext(user.id, workspaceId)
  if (!workspace) return mobileError('Workspace not found or unavailable', 403, false)
  if (workspace.type !== 'organization' || workspace.organizationId !== orgId) {
    return mobileError('Workspace does not belong to the requested organization', 403, false)
  }
  if (!workspaceCan(workspace, 'manage_members')) return mobileError('manage_members permission is required', 403, false)

  const { data: org } = await supabaseAdmin.from('organizations').select('id,name').eq('id', orgId).maybeSingle()
  if (!org) return mobileError('Organization not found', 404, false)
  const { data: workspaceRow } = await supabaseAdmin.from('business_workspaces').select('display_name').eq('id', workspaceId).maybeSingle()
  const orgName = String(org.name || workspaceRow?.display_name || 'Your organization')
  const { data: invitedProfile } = await supabaseAdmin.from('profiles').select('id').eq('email', email).maybeSingle()
  const { data: inviterProfile } = await supabaseAdmin.from('profiles').select('full_name,email').eq('id', user.id).maybeSingle()

  const token = createInviteToken()
  const invitationCode = createInvitationCode()
  const expiresAt = inviteTokenExpiresAt()
  const actionUrl = `https://app.coacheshive.com/invite/accept?token=${encodeURIComponent(token)}`
  const { data: invite, error } = await supabaseAdmin.from('org_invites').insert({
    org_id: orgId,
    workspace_id: workspaceId,
    organization_name: orgName,
    role: roles[0],
    roles,
    invited_email: email,
    invited_user_id: invitedProfile?.id || null,
    invited_by: user.id,
    status: 'pending',
    invite_token_hash: hashInviteToken(token),
    invitation_code_hash: hashInviteToken(invitationCode),
    token_expires_at: expiresAt,
  }).select('id').single()
  if (error || !invite) return mobileError('Unable to create invitation', 500, true)

  const delivery = await sendMobileOrgInviteEmail({
    toEmail: email,
    orgName,
    roles,
    actionUrl,
    expiresAt,
    inviterName: inviterProfile?.full_name || inviterProfile?.email || user.email || 'An organization administrator',
  })
  await supabaseAdmin.from('org_invites').update({
    email_delivery_status: delivery.status,
    email_delivery_attempted_at: new Date().toISOString(),
  }).eq('id', invite.id)

  return NextResponse.json({
    invitation: { id: invite.id, invited_email: email, organization_id: orgId, workspace_id: workspaceId, roles, status: 'pending', expires_at: expiresAt },
    delivery_status: delivery.status,
  }, { status: 201 })
}
