import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionRoleState } from '@/lib/sessionRoleState'
import { hashInviteToken } from '@/lib/inviteTokens'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return jsonError('Unauthorized', 401)
  }

  const body = await request.json().catch(() => ({}))
  const { invite_id, invite_token, action, athlete_profile_id } = body || {}

  if ((!invite_id && !invite_token) || !['accept', 'decline'].includes(action)) {
    return jsonError('invite_token (or legacy invite_id) and action (accept|decline) are required')
  }

  if (invite_token) {
    if (action !== 'accept') return jsonError('Token invitations can only be accepted here', 422)
    const email = String(session.user.email || '').trim().toLowerCase()
    if (!email) return jsonError('The authenticated account has no verified email', 422)
    const{data:tokenInvite}=await supabaseAdmin.from('org_invites').select('id,org_id,role,token_expires_at').eq('invite_token_hash',hashInviteToken(String(invite_token))).maybeSingle()
    if(!tokenInvite||tokenInvite.token_expires_at&&new Date(tokenInvite.token_expires_at).getTime()<=Date.now())return jsonError('Invitation not found or expired.',410)
    const{data:membershipId,error}=await supabase.rpc('accept_org_invite',{invite_id:tokenInvite.id,athlete_profile_id:athlete_profile_id||null})
    if(error)return jsonError(error.code==='42501'?'This invitation is not available for the signed-in account.':'Unable to accept the invitation.',error.code==='42501'?403:422)
    await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
      user_metadata: { lifecycle_state: 'active' },
    })
    const{data:workspaces}=await supabase.rpc('available_workspaces')
    return NextResponse.json({
      status:'accepted',organization_id:tokenInvite.org_id,role:tokenInvite.role,membership_id:membershipId,workspaces:workspaces||[],refresh_capabilities:true,
    },{headers:{'Cache-Control':'private, no-store'}})
  }

  const { data: invite } = await supabaseAdmin
    .from('org_invites')
    .select('*')
    .eq('id', invite_id)
    .maybeSingle()

  if (!invite) {
    return jsonError('Invite not found', 404)
  }

  const email = (session.user.email || '').toLowerCase()
  const inviteEmail = String(invite.invited_email || '').toLowerCase()
  if (inviteEmail !== email && invite.invited_user_id !== session.user.id) {
    return jsonError('Forbidden', 403)
  }

  if (!['pending','accepted'].includes(invite.status)) {
    return jsonError('Invite already processed', 409)
  }

  const { data: existingMembership } = await supabaseAdmin
    .from('organization_memberships')
    .select('status')
    .eq('org_id', invite.org_id)
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (existingMembership?.status === 'suspended') {
    return jsonError('Your access is suspended. Contact your admin to restore.', 403)
  }

  if (action === 'accept') {
    const {data:membershipId,error:acceptError}=await supabase.rpc('accept_org_invite',{invite_id,athlete_profile_id:athlete_profile_id||null})
    if(acceptError){const forbidden=acceptError.code==='42501';return jsonError(forbidden?'This invitation is not available for the signed-in account.':'Unable to accept the invitation.',forbidden?403:422)}

    // Org-invited users are covered by the org's subscription — advance lifecycle
    // so they aren't forced through the individual select-plan → checkout flow.
    const currentLifecycle = getSessionRoleState(session.user.user_metadata).lifecycleState || ''
    if (currentLifecycle && currentLifecycle !== 'active') {
      await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
        user_metadata: { lifecycle_state: 'active' },
      })
    }

    const {data:workspaces}=await supabase.rpc('available_workspaces')
    return NextResponse.json({status:'accepted',membership_id:membershipId,organization_id:invite.org_id,workspaces:workspaces||[],capability_refresh_workspace_id:(workspaces||[]).find((row:any)=>row.organization_id===invite.org_id)?.workspace_id||null,refresh_capabilities:true},{headers:{'Cache-Control':'private, no-store'}})
  }

  const status = 'declined'
  await supabaseAdmin
    .from('org_invites')
    .update({ status, invited_user_id: session.user.id })
    .eq('id', invite_id)

  return NextResponse.json({ status })
}
