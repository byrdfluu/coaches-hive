import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { hasAdminPermission, resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const listAllAuthUsers = async () => {
  const users: Array<any> = []

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) {
      return { users: [], error }
    }

    const pageUsers = data.users || []
    users.push(...pageUsers)
    if (pageUsers.length < 200) break
  }

  return { users, error: null as any }
}

const getEmailVerificationStatus = (user: any) =>
  user?.email_confirmed_at || user?.confirmed_at ? 'Email verified' : 'Email verification pending'

const isAdminHidden = (user: any) => user?.user_metadata?.admin_hidden === true || user?.user_metadata?.admin_hidden === 'true'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (!adminAccess.teamRole) {
    return jsonError('Forbidden', 403)
  }
  const canManage = hasAdminPermission(adminAccess.teamRole, 'users.manage')

  const { users: authUsers, error } = await listAllAuthUsers()
  if (error) {
    return jsonError(error.message)
  }

  const visibleAuthUsers = authUsers.filter((user) => !isAdminHidden(user))
  const userIds = visibleAuthUsers.map((user) => user.id)
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, heard_from, is_test')
        .in('id', userIds)
    : { data: [], error: null }

  if (profilesError) {
    return jsonError(profilesError.message, 500)
  }

  const profileMap = new Map(
    ((profiles || []) as Array<{ id: string; full_name?: string | null; heard_from?: string | null; is_test?: boolean }>).map((profile) => [
      profile.id,
      profile,
    ]),
  )

  const [directSubscriptions, memberships, organizationWorkspaces] = await Promise.all([
    userIds.length ? supabaseAdmin.from('platform_subscriptions').select('user_id,status').in('user_id', userIds).in('status',['active','trialing']) : Promise.resolve({ data: [] }),
    userIds.length ? supabaseAdmin.from('organization_memberships').select('user_id,org_id,status').in('user_id', userIds).neq('status','removed') : Promise.resolve({ data: [] }),
    supabaseAdmin.from('business_workspaces').select('id,organization_id,owner_user_id,workspace_type,is_test'),
  ])
  const orgWorkspaceIds = (organizationWorkspaces.data || []).filter((row:any)=>row.workspace_type==='organization').map((row:any)=>row.id)
  const { data: orgSubscriptions } = orgWorkspaceIds.length
    ? await supabaseAdmin.from('platform_subscriptions').select('workspace_id,status').in('workspace_id',orgWorkspaceIds).in('status',['active','trialing'])
    : { data: [] }
  const orgIdByWorkspace = new Map((organizationWorkspaces.data || []).map((row:any)=>[row.id,row.organization_id]))
  const orgAccessStatus = new Map<string,string>()
  for (const row of orgSubscriptions || []) {
    const orgId = orgIdByWorkspace.get(row.workspace_id); if (!orgId) continue
    if (row.status === 'active' || !orgAccessStatus.has(orgId)) orgAccessStatus.set(orgId,row.status)
  }
  const coveredStatusByUser = new Map<string,string>()
  for (const row of memberships.data || []) {
    const status = orgAccessStatus.get(row.org_id); if (!status) continue
    if (status === 'active' || !coveredStatusByUser.has(row.user_id)) coveredStatusByUser.set(row.user_id,status)
  }
  const directStatusByUser = new Map<string,string>()
  for (const row of directSubscriptions.data || []) {
    if (row.status === 'active' || !directStatusByUser.has(row.user_id)) directStatusByUser.set(row.user_id,row.status)
  }
  const workspaceIdsByUser = new Map<string,Set<string>>()
  const workspaceIdByOrg = new Map((organizationWorkspaces.data || []).filter((row:any)=>row.workspace_type==='organization').map((row:any)=>[row.organization_id,row.id]))
  for (const row of memberships.data || []) {
    const workspaceId = workspaceIdByOrg.get(row.org_id); if (!workspaceId) continue
    const ids = workspaceIdsByUser.get(row.user_id) || new Set<string>(); ids.add(workspaceId); workspaceIdsByUser.set(row.user_id,ids)
  }
  for (const row of organizationWorkspaces.data || []) {
    if (row.workspace_type !== 'independent_coach' || !row.owner_user_id) continue
    const ids = workspaceIdsByUser.get(row.owner_user_id) || new Set<string>(); ids.add(row.id); workspaceIdsByUser.set(row.owner_user_id,ids)
  }
  const [opsFeed,opsReviews] = await Promise.all([
    supabase.rpc('admin_system_failure_feed'),
    supabaseAdmin.from('admin_ops_issue_resolutions').select('issue_key,status').eq('category','Payments'),
  ])
  const opsStatus = new Map((opsReviews.data || []).map((row:any)=>[row.issue_key,row.status]))
  const productionWorkspaceIds = new Set((organizationWorkspaces.data || []).filter((row:any)=>!row.is_test).map((row:any)=>row.id))
  const openStripeWorkspaceCounts = new Map<string,number>()
  for (const row of opsFeed.data || []) {
    if (!row.workspace_id || !productionWorkspaceIds.has(row.workspace_id)) continue
    if (!String(row.source).includes('Stripe') && row.source !== 'Checkout handoff') continue
    if ((opsStatus.get(row.event_id)||'open') !== 'open') continue
    openStripeWorkspaceCounts.set(row.workspace_id,(openStripeWorkspaceCounts.get(row.workspace_id)||0)+1)
  }

  const showTestData = new URL(request.url).searchParams.get('show_test_data') === 'true'
  const users = visibleAuthUsers.map((user) => {
    const access = resolveAdminAccess(user.user_metadata)
    const nextRole = access.role || String(user.user_metadata?.role || 'unknown')
    const profile = profileMap.get(user.id) || null
    const subscriptionStatus = directStatusByUser.get(user.id) || coveredStatusByUser.get(user.id) || null
    return {
      id: user.id,
      email: user.email || '',
      role: nextRole,
      admin_team_role: access.teamRole,
      full_name: profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || '',
      heard_from: profile?.heard_from || '',
      email_status: getEmailVerificationStatus(user),
      status: user.user_metadata?.suspended ? 'Suspended' : subscriptionStatus === 'active' ? 'Active' : subscriptionStatus === 'trialing' ? 'Trialing' : 'Registered',
      access_source: directStatusByUser.has(user.id) ? 'direct_subscription' : coveredStatusByUser.has(user.id) ? 'organization_workspace' : null,
      open_issue_count: Array.from(workspaceIdsByUser.get(user.id)||[]).reduce((sum,workspaceId)=>sum+(openStripeWorkspaceCounts.get(workspaceId)||0),0),
      is_test: Boolean(profile?.is_test),
    }
  }).filter(user => showTestData || !user.is_test)

  return NextResponse.json({ users, can_manage: canManage })
}
