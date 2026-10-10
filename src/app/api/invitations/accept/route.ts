import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { hashInviteToken } from '@/lib/inviteTokens'
import {createClient} from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let supabase = await createRouteHandlerClientCompat()
  let { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) {
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (token) {
      const { data } = await supabaseAdmin.auth.getUser(token)
      if (data.user) {session = { user: data.user } as typeof session;supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}})as typeof supabase}
    }
  }
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const inviteToken = String(body?.invite_token || '').trim()
  if (!inviteToken) return NextResponse.json({ error: 'invite_token is required' }, { status: 400 })
  const email = String(session.user.email || '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Authenticated email is required' }, { status: 422 })
  const tokenHash=hashInviteToken(inviteToken)
  const{data:orgInvite}=await supabaseAdmin.from('org_invites').select('id,org_id,role,token_expires_at').eq('invite_token_hash',tokenHash).maybeSingle()
  if(orgInvite&&(!orgInvite.token_expires_at||new Date(orgInvite.token_expires_at).getTime()>Date.now())){const{data:membershipId,error}=await supabase.rpc('accept_org_invite',{invite_id:orgInvite.id,athlete_profile_id:body?.athlete_profile_id||null});if(!error){const{data:workspaces}=await supabase.rpc('available_workspaces');return NextResponse.json({status:'accepted',invitation_type:'organization',organization_id:orgInvite.org_id,role:orgInvite.role,membership_id:membershipId,workspaces:workspaces||[],refresh_capabilities:true},{headers:{'Cache-Control':'private, no-store'}})}}
  const args = { p_token_hash: tokenHash, p_user_id: session.user.id, p_user_email: email }
  const guardianResult = await supabaseAdmin.rpc('accept_guardian_invitation_token_server', args)
  if (!guardianResult.error) {
    const row = guardianResult.data?.[0]
    return NextResponse.json({ status: 'accepted', invitation_type: 'guardian', organization_id: row?.organization_id, athlete_id: row?.athlete_id })
  }
  const { data: athleteInvite } = await supabaseAdmin.from('coach_athlete_invitations')
    .select('id,workspace_id,coach_id,invited_email,status,token_expires_at')
    .eq('invite_token_hash', args.p_token_hash).maybeSingle()
  if (athleteInvite && athleteInvite.status === 'pending'
    && athleteInvite.invited_email.toLowerCase() === email
    && new Date(athleteInvite.token_expires_at).getTime() > Date.now()) {
    const { data: workspace } = await supabaseAdmin.from('business_workspaces')
      .select('id,workspace_type,organization_id,league_id,owner_user_id,status')
      .eq('id', athleteInvite.workspace_id).maybeSingle()
    if (workspace?.status === 'active') {
      let tenantLinkError: unknown = null
      if (workspace.workspace_type === 'independent_coach' && workspace.owner_user_id === athleteInvite.coach_id) {
        const result = await supabaseAdmin.from('coach_athlete_links').upsert({
          coach_id: athleteInvite.coach_id, athlete_id: session.user.id, status: 'active',
        }, { onConflict: 'coach_id,athlete_id' })
        tenantLinkError = result.error
      } else if (workspace.workspace_type === 'organization' && workspace.organization_id) {
        const { data: accountProfile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle()
        let { data: athleteProfile } = await supabaseAdmin.from('athlete_profiles').select('id')
          .or(`owner_user_id.eq.${session.user.id},auth_user_id.eq.${session.user.id}`).limit(1).maybeSingle()
        if (!athleteProfile) {
          const created = await supabaseAdmin.from('athlete_profiles').insert({
            owner_user_id: session.user.id,
            auth_user_id: session.user.id,
            full_name: accountProfile?.full_name || email.split('@')[0],
            is_primary: true,
            status: 'active',
          }).select('id').single()
          athleteProfile = created.data
          tenantLinkError = created.error
        }
        if (athleteProfile && !tenantLinkError) {
          const result = await supabaseAdmin.from('athlete_organization_memberships').upsert({
            athlete_id: athleteProfile.id, org_id: workspace.organization_id, status: 'active',
          }, { onConflict: 'athlete_id,org_id' })
          tenantLinkError = result.error
        }
      } else if (workspace.workspace_type !== 'league' || !workspace.league_id) {
        tenantLinkError = new Error('Invitation workspace ownership is invalid')
      }

      const membershipResult = !tenantLinkError ? await supabaseAdmin.from('workspace_memberships').upsert({
        workspace_id: athleteInvite.workspace_id, user_id: session.user.id,
        roles: ['athlete'], permissions: {}, status: 'active',
      }, { onConflict: 'workspace_id,user_id' }) : { error: tenantLinkError }
      if (!membershipResult.error) {
        const { data: accepted } = await supabaseAdmin.from('coach_athlete_invitations').update({
          status: 'accepted', accepted_at: new Date().toISOString(), accepted_by_user_id: session.user.id,
          invited_user_id: session.user.id, updated_at: new Date().toISOString(),
        }).eq('id', athleteInvite.id).eq('status', 'pending').select('id').maybeSingle()
        if (accepted) return NextResponse.json({
          status: 'accepted', invitation_type: `${workspace.workspace_type}_athlete`,
          workspace_id: athleteInvite.workspace_id,
          organization_id: workspace.organization_id,
          league_id: workspace.league_id,
        })
      }
    }
  }
  return NextResponse.json({ error: 'Invitation not found, expired, already used, or assigned to another email.' }, { status: 410 })
}
