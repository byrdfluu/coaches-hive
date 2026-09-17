import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'

type PublicOrganizationResolution = {
  id: string
  name: string
  org_type: string | null
  status: 'active' | 'inactive'
  workspace_id: string | null
}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const activeStatuses = new Set(['active', 'trialing'])

const first = <T>(value: T[] | T | null | undefined): T | null => Array.isArray(value) ? value[0] || null : value || null

export async function resolvePublicOrganization(rawIdentifier: string): Promise<PublicOrganizationResolution | null> {
  const identifier = rawIdentifier.trim()
  if (!identifier) return null

  let orgId: string | null = null
  let organization: Record<string, any> | null = null
  let settings: Record<string, any> | null = null
  let workspace: Record<string, any> | null = null

  if (isUuid(identifier)) {
    const [orgResult, settingsResult, workspaceIdResult, workspaceOrgResult] = await Promise.all([
      supabaseAdmin.from('organizations').select('*').eq('id', identifier).maybeSingle(),
      supabaseAdmin.from('org_settings').select('org_id,org_name').eq('org_id', identifier).maybeSingle(),
      supabaseAdmin.from('business_workspaces').select('id,organization_id,display_name,status,workspace_type').eq('id', identifier).eq('workspace_type', 'organization').maybeSingle(),
      supabaseAdmin.from('business_workspaces').select('id,organization_id,display_name,status,workspace_type').eq('organization_id', identifier).eq('workspace_type', 'organization').maybeSingle(),
    ])

    organization = orgResult.data as Record<string, any> | null
    settings = settingsResult.data as Record<string, any> | null
    workspace = (workspaceIdResult.data || workspaceOrgResult.data) as Record<string, any> | null
    orgId = organization?.id || settings?.org_id || workspace?.organization_id || null
  } else {
    const [organizationsResult, settingsResult, workspacesResult] = await Promise.all([
      supabaseAdmin.from('organizations').select('*'),
      supabaseAdmin.from('org_settings').select('org_id,org_name'),
      supabaseAdmin.from('business_workspaces').select('id,organization_id,display_name,status,workspace_type').eq('workspace_type', 'organization'),
    ])
    const wantedSlug = slugify(identifier)
    organization = (organizationsResult.data || []).find(row => slugify(String(row.name || '')) === wantedSlug) as Record<string, any> | null || null
    settings = (settingsResult.data || []).find(row => slugify(String(row.org_name || '')) === wantedSlug) as Record<string, any> | null || null
    workspace = (workspacesResult.data || []).find(row => slugify(String(row.display_name || '')) === wantedSlug) as Record<string, any> | null || null
    orgId = organization?.id || settings?.org_id || workspace?.organization_id || null
  }

  if (!orgId) return null

  const [organizationResult, settingsResult, workspaceResult] = await Promise.all([
    organization ? Promise.resolve({ data: organization }) : supabaseAdmin.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    settings ? Promise.resolve({ data: settings }) : supabaseAdmin.from('org_settings').select('org_id,org_name').eq('org_id', orgId).maybeSingle(),
    workspace?.organization_id === orgId
      ? Promise.resolve({ data: workspace })
      : supabaseAdmin.from('business_workspaces').select('id,organization_id,display_name,status,workspace_type').eq('organization_id', orgId).eq('workspace_type', 'organization').maybeSingle(),
  ])

  organization = first(organizationResult.data as Record<string, any> | Record<string, any>[] | null)
  settings = first(settingsResult.data as Record<string, any> | Record<string, any>[] | null)
  workspace = first(workspaceResult.data as Record<string, any> | Record<string, any>[] | null)

  const organizationStatus = String(organization?.status || '').toLowerCase()
  const workspaceStatus = String(workspace?.status || '').toLowerCase()
  const hasConfirmedActiveState = activeStatuses.has(organizationStatus) || activeStatuses.has(workspaceStatus)
  const hasConfirmedInactiveState = Boolean(
    (organizationStatus && !activeStatuses.has(organizationStatus))
    || (workspaceStatus && !activeStatuses.has(workspaceStatus)),
  )
  if (!hasConfirmedActiveState && !hasConfirmedInactiveState) return null

  return {
    id: orgId,
    name: String(settings?.org_name || organization?.name || workspace?.display_name || 'Organization'),
    org_type: typeof organization?.org_type === 'string' ? organization.org_type : null,
    status: hasConfirmedActiveState && !hasConfirmedInactiveState ? 'active' : 'inactive',
    workspace_id: typeof workspace?.id === 'string' ? workspace.id : null,
  }
}
