import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type AdminWorkspaceDisplay = {
  workspace_id: string | null
  workspace_name: string | null
  workspace_type: string | null
  organization_id: string | null
  owner_user_id: string | null
  workspace_status: string | null
  workspace_is_test: boolean
}

export const emptyWorkspaceDisplay = (): AdminWorkspaceDisplay => ({
  workspace_id: null,
  workspace_name: null,
  workspace_type: null,
  organization_id: null,
  owner_user_id: null,
  workspace_status: null,
  workspace_is_test: false,
})

export async function loadWorkspaceDisplayMap(workspaceIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(workspaceIds.filter((id): id is string => Boolean(id))))
  const map = new Map<string, AdminWorkspaceDisplay>()
  if (!ids.length) return map
  const { data } = await supabaseAdmin.from('business_workspaces')
    .select('id,display_name,workspace_type,organization_id,owner_user_id,status,is_test')
    .in('id', ids)
  for (const workspace of data || []) {
    map.set(workspace.id, {
      workspace_id: workspace.id,
      workspace_name: workspace.display_name,
      workspace_type: workspace.workspace_type,
      organization_id: workspace.organization_id,
      owner_user_id: workspace.owner_user_id,
      workspace_status: workspace.status,
      workspace_is_test: Boolean(workspace.is_test),
    })
  }
  return map
}

export async function enrichWithWorkspace<T extends { workspace_id?: string | null }>(rows: T[]) {
  const map = await loadWorkspaceDisplayMap(rows.map((row) => row.workspace_id))
  return rows.map((row) => ({
    ...row,
    ...(row.workspace_id ? map.get(row.workspace_id) || emptyWorkspaceDisplay() : emptyWorkspaceDisplay()),
  }))
}

const addIds = (target: Set<string>, rows?: Array<{ workspace_id?: string | null }> | null) => {
  for (const row of rows || []) if (row.workspace_id) target.add(row.workspace_id)
}

export async function resolveWorkspaceIdsForAdminSearch(rawQuery: string) {
  const query = rawQuery.trim()
  const ids = new Set<string>()
  if (!query) return ids
  const like = `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query)

  const [workspaces, profiles, organizations, subscriptions, handoffs, accounting, connect] = await Promise.all([
    supabaseAdmin.from('business_workspaces').select('id')
      .or([isUuid ? `id.eq.${query}` : '', `display_name.ilike.${like}`].filter(Boolean).join(',')),
    supabaseAdmin.from('profiles').select('id')
      .or([isUuid ? `id.eq.${query}` : '', `email.ilike.${like}`, `full_name.ilike.${like}`].filter(Boolean).join(',')).limit(200),
    supabaseAdmin.from('organizations').select('id')
      .or([isUuid ? `id.eq.${query}` : '', `name.ilike.${like}`].filter(Boolean).join(',')).limit(200),
    supabaseAdmin.from('platform_subscriptions').select('workspace_id')
      .or(`stripe_customer_id.eq.${query},stripe_subscription_id.eq.${query}`).limit(200),
    supabaseAdmin.from('mobile_checkout_handoffs').select('workspace_id')
      .eq('stripe_checkout_session_id', query).limit(200),
    supabaseAdmin.from('stripe_connect_payment_accounting').select('workspace_id')
      .or(`stripe_checkout_session_id.eq.${query},stripe_payment_intent_id.eq.${query},connected_account_destination.eq.${query}`).limit(200),
    supabaseAdmin.from('stripe_connect_accounts').select('workspace_id').eq('stripe_account_id', query).limit(200),
  ])

  for (const row of workspaces.data || []) ids.add(row.id)
  addIds(ids, subscriptions.data)
  addIds(ids, handoffs.data)
  addIds(ids, accounting.data)
  addIds(ids, connect.data)

  const userIds = (profiles.data || []).map((row) => row.id)
  if (userIds.length) {
    const { data } = await supabaseAdmin.from('workspace_memberships').select('workspace_id').in('user_id', userIds)
    addIds(ids, data)
  }
  const organizationIds = (organizations.data || []).map((row) => row.id)
  if (organizationIds.length) {
    const { data } = await supabaseAdmin.from('business_workspaces').select('id').in('organization_id', organizationIds)
    for (const row of data || []) ids.add(row.id)
  }
  return ids
}

export async function recordWorkspaceAdminAudit(input: {
  actorId: string
  actorEmail?: string | null
  workspaceId: string
  eventType: string
  recordType: string
  recordId?: string | null
  previousState: unknown
  newState: unknown
  reason: string
}) {
  const metadata = {
    superadmin_email: input.actorEmail || null,
    previous_state: input.previousState,
    new_state: input.newState,
    reason: input.reason,
  }
  const { error } = await supabaseAdmin.from('workspace_audit_events').insert({
    workspace_id: input.workspaceId,
    actor_user_id: input.actorId,
    acting_role: 'superadmin',
    event_type: input.eventType,
    record_type: input.recordType,
    record_id: input.recordId || null,
    metadata,
    occurred_at: new Date().toISOString(),
  })
  if (error) throw error
  await supabaseAdmin.from('admin_audit_log').insert({
    actor_id: input.actorId,
    actor_email: input.actorEmail || null,
    action: input.eventType,
    target_type: input.recordType,
    target_id: input.recordId || input.workspaceId,
    workspace_id: input.workspaceId,
    metadata,
  })
}
