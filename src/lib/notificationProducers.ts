import { insertNotifications, type InAppNotification } from '@/lib/inAppNotifications'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type TenantContext = {
  workspaceId: string | null
  organizationId?: string | null
  leagueId?: string | null
}

const unique = (values: Array<string | null | undefined>) => Array.from(new Set(values.filter(Boolean) as string[]))

export async function organizationNotificationContext(orgId: string): Promise<TenantContext> {
  const { data } = await supabaseAdmin.from('business_workspaces').select('id')
    .eq('workspace_type', 'organization').eq('organization_id', orgId).eq('status', 'active').limit(1).maybeSingle()
  return { workspaceId: data?.id || null, organizationId: orgId }
}

export async function leagueNotificationContext(leagueId: string): Promise<TenantContext> {
  const { data } = await supabaseAdmin.from('business_workspaces').select('id')
    .eq('workspace_type', 'league').eq('league_id', leagueId).eq('status', 'active').limit(1).maybeSingle()
  return { workspaceId: data?.id || null, leagueId }
}

export async function organizationStaffRecipients(orgId: string, excludeUserId?: string | null) {
  const { data } = await supabaseAdmin.from('organization_memberships').select('user_id').eq('org_id', orgId)
    .eq('status', 'active').in('role', ['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager'])
  return unique((data || []).map(row => row.user_id)).filter(id => id !== excludeUserId)
}

export async function leagueStaffRecipients(leagueId: string, excludeUserId?: string | null) {
  const { data } = await supabaseAdmin.from('league_memberships').select('user_id').eq('league_id', leagueId).eq('status', 'active')
  return unique((data || []).map(row => row.user_id)).filter(id => id !== excludeUserId)
}

export async function leagueParticipantRecipients(leagueId: string) {
  const [{ data: leagueMembers }, { data: linkedOrgs }, { data: registrations }] = await Promise.all([
    supabaseAdmin.from('league_memberships').select('user_id').eq('league_id', leagueId).eq('status', 'active'),
    supabaseAdmin.from('league_organizations').select('org_id').eq('league_id', leagueId).eq('status', 'active'),
    supabaseAdmin.from('league_registrations').select('athlete_id').eq('league_id', leagueId),
  ])
  const orgIds = unique((linkedOrgs || []).map(row => row.org_id))
  const athleteIds = unique((registrations || []).map(row => row.athlete_id))
  const [{ data: orgMembers }, { data: athletes }] = await Promise.all([
    orgIds.length ? supabaseAdmin.from('organization_memberships').select('user_id').in('org_id', orgIds).eq('status', 'active') : Promise.resolve({ data: [] }),
    athleteIds.length ? supabaseAdmin.from('athlete_profiles').select('id,owner_user_id').in('id', athleteIds) : Promise.resolve({ data: [] }),
  ])
  return unique([
    ...(leagueMembers || []).map(row => row.user_id),
    ...(orgMembers || []).map(row => row.user_id),
    ...(athletes || []).flatMap(row => [row.id, row.owner_user_id]),
  ])
}

export type TenantEventInput = {
  recipientIds: string[]
  type: string
  category: string
  title: string
  body: string
  destination: string
  resourceId: string
  state: string
  context: TenantContext
  data?: Record<string, unknown>
}

export function buildTenantNotificationRows(input: TenantEventInput): InAppNotification[] {
  const recipients = unique(input.recipientIds)
  const tenantData = {
    ...(input.data || {}),
    workspace_id: input.context.workspaceId,
    org_id: input.context.organizationId || null,
    organization_id: input.context.organizationId || null,
    league_id: input.context.leagueId || null,
    record_id: input.resourceId,
    state: input.state,
    category: input.category,
  }
  return recipients.map(userId => ({
    user_id: userId,
    type: input.type,
    category: input.category,
    title: input.title,
    body: input.body,
    action_url: input.destination,
    workspace_id: input.context.workspaceId,
    deduplication_key: `${input.type}:${input.resourceId}:${input.state}`,
    data: tenantData,
  }))
}

export async function emitTenantEvent(input: TenantEventInput) {
  const rows = buildTenantNotificationRows(input)
  if (!rows.length) return { data: [], error: null }
  return insertNotifications(rows)
}
