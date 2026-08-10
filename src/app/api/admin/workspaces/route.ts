import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { resolveWorkspaceIdsForAdminSearch } from '@/lib/workspaceAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const supabase = await createRouteHandlerClientCompat()
  const params = new URL(request.url).searchParams
  const query = (params.get('query') || '').trim()
  const type = params.get('type') || ''
  const status = params.get('status') || ''
  const showTestData = params.get('show_test_data') === 'true'
  const resolvedIds = query ? await resolveWorkspaceIdsForAdminSearch(query) : null

  let workspaceQuery = supabaseAdmin.from('business_workspaces')
    .select('id,workspace_type,organization_id,owner_user_id,display_name,status,is_test,created_at,updated_at')
    .order('created_at', { ascending: false }).limit(500)
  if (type) workspaceQuery = workspaceQuery.eq('workspace_type', type)
  if (status) workspaceQuery = workspaceQuery.eq('status', status)
  if (!showTestData) workspaceQuery = workspaceQuery.eq('is_test', false)
  if (resolvedIds?.size) workspaceQuery = workspaceQuery.in('id', Array.from(resolvedIds))
  else if (query) workspaceQuery = workspaceQuery.ilike('display_name', `%${query}%`)

  const { data: workspaces, error } = await workspaceQuery
  if (error) return NextResponse.json({ error: 'Unable to load workspaces.' }, { status: 500 })
  const workspaceIds = (workspaces || []).map((workspace) => workspace.id)
  const ownerIds = Array.from(new Set((workspaces || []).map((workspace) => workspace.owner_user_id).filter(Boolean)))

  const [memberships, subscriptions, connectAccounts, accessRequests, reconciliation, owners, opsFeed, opsReviews] = await Promise.all([
    workspaceIds.length
      ? supabaseAdmin.from('workspace_memberships').select('workspace_id').in('workspace_id', workspaceIds).neq('status', 'removed')
      : Promise.resolve({ data: [] }),
    workspaceIds.length
      ? supabaseAdmin.from('platform_subscriptions').select('workspace_id,status,tier,purchase_channel,current_period_end').in('workspace_id', workspaceIds)
      : Promise.resolve({ data: [] }),
    workspaceIds.length
      ? supabaseAdmin.from('stripe_connect_accounts').select('workspace_id,stripe_account_id,connect_status,charges_enabled,payouts_enabled,requirements_due').in('workspace_id', workspaceIds)
      : Promise.resolve({ data: [] }),
    workspaceIds.length
      ? supabaseAdmin.from('athlete_access_requests').select('workspace_id').in('workspace_id', workspaceIds).eq('status', 'requested')
      : Promise.resolve({ data: [] }),
    supabaseAdmin.from('workspace_admin_reconciliation_queue').select('table_name,id,created_at'),
    ownerIds.length
      ? supabaseAdmin.from('profiles').select('id,email,full_name').in('id', ownerIds)
      : Promise.resolve({ data: [] }),
    supabase.rpc('admin_system_failure_feed'),
    supabaseAdmin.from('admin_ops_issue_resolutions').select('issue_key,status').eq('category','Payments'),
  ])

  const memberCounts = new Map<string, number>()
  for (const row of memberships.data || []) memberCounts.set(row.workspace_id, (memberCounts.get(row.workspace_id) || 0) + 1)
  const subscriptionsByWorkspace = new Map((subscriptions.data || []).map((row) => [row.workspace_id, row]))
  const connectByWorkspace = new Map((connectAccounts.data || []).map((row) => [row.workspace_id, row]))
  const ownersById = new Map((owners.data || []).map((row) => [row.id, row]))
  const unresolvedByWorkspace = new Map<string, number>()
  for (const row of accessRequests.data || []) unresolvedByWorkspace.set(row.workspace_id, (unresolvedByWorkspace.get(row.workspace_id) || 0) + 1)
  // Reconciliation records have no workspace yet, so they are surfaced as a
  // global unresolved count instead of being guessed into the wrong business.
  const unresolvedGlobal = reconciliation.data?.length || 0
  const opsStatus = new Map((opsReviews.data || []).map((row:any)=>[row.issue_key,row.status]))
  const stripeOpenByWorkspace = new Map<string,number>()
  for (const row of opsFeed.data || []) {
    if (!row.workspace_id || (!String(row.source).includes('Stripe') && row.source !== 'Checkout handoff')) continue
    if ((opsStatus.get(row.event_id) || 'open') !== 'open') continue
    stripeOpenByWorkspace.set(row.workspace_id,(stripeOpenByWorkspace.get(row.workspace_id)||0)+1)
  }

  const items = (workspaces || []).map((workspace) => {
    const subscription = subscriptionsByWorkspace.get(workspace.id) || null
    const connect = connectByWorkspace.get(workspace.id) || null
    const owner = workspace.owner_user_id ? ownersById.get(workspace.owner_user_id) : null
    return {
      ...workspace,
      owner_name: owner?.full_name || null,
      owner_email: owner?.email || null,
      member_count: memberCounts.get(workspace.id) || 0,
      unresolved_issue_count: (unresolvedByWorkspace.get(workspace.id) || 0)
        + (subscription && ['past_due','unpaid','incomplete','incomplete_expired'].includes(subscription.status) ? 1 : 0)
        + (connect && (!connect.charges_enabled || !connect.payouts_enabled || (connect.requirements_due || []).length > 0) ? 1 : 0)
        + (stripeOpenByWorkspace.get(workspace.id) || 0),
      stripe_open_issue_count: stripeOpenByWorkspace.get(workspace.id) || 0,
      subscription_status: subscription?.status || null,
      subscription_plan_key: subscription?.tier || null,
      subscription_channel: subscription?.purchase_channel || null,
      connect_account_id: connect?.stripe_account_id || null,
      connect_status: connect?.connect_status || null,
      connect_ready: Boolean(connect?.charges_enabled && connect?.payouts_enabled),
      connect_requirements_due: connect?.requirements_due || [],
    }
  })

  return NextResponse.json({
    items,
    summary: {
      workspaces: items.length,
      organizations: items.filter((item) => item.workspace_type === 'organization').length,
      independent: items.filter((item) => item.workspace_type === 'independent_coach').length,
      unresolved_legacy_records: unresolvedGlobal,
    },
  })
}
