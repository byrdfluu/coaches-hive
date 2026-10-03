import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type FamilyOrganizationContact = {
  user_id: string
  full_name: string
  avatar_url: string | null
  organization_id: string
  organization_name: string
  contact_label: string
  can_message: boolean
}

const hasMessagingPermission = (membership: { roles?: unknown; permissions?: unknown } | null) => {
  if (!membership) return false
  const roles = Array.isArray(membership.roles) ? membership.roles.map(String) : []
  const permissions = membership.permissions && typeof membership.permissions === 'object'
    ? membership.permissions as Record<string, unknown> : {}
  return roles.some(role => ['owner', 'org_admin'].includes(role))
    || permissions.manage_messages === true
    || permissions['messages.manage'] === true
    || permissions.messaging === true
}

export async function loadFamilyOrganizationContact(orgId: string, athleteProfileId: string) {
  const [{ data: relationship }, { data: settings }, { data: organization }, { data: workspace }] = await Promise.all([
    supabaseAdmin.from('athlete_organization_memberships').select('id').eq('org_id', orgId)
      .eq('athlete_id', athleteProfileId).eq('status', 'active').maybeSingle(),
    supabaseAdmin.from('org_settings').select('primary_family_contact_user_id,primary_family_contact_label')
      .eq('org_id', orgId).maybeSingle(),
    supabaseAdmin.from('organizations').select('name,status').eq('id', orgId).maybeSingle(),
    supabaseAdmin.from('business_workspaces').select('id').eq('organization_id', orgId)
      .eq('workspace_type', 'organization').eq('status', 'active').maybeSingle(),
  ])
  const contactId = settings?.primary_family_contact_user_id
  if (!relationship || !contactId || !workspace || organization?.status !== 'active') return null
  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabaseAdmin.from('workspace_memberships').select('roles,permissions,status').eq('workspace_id', workspace.id)
      .eq('user_id', contactId).eq('status', 'active').maybeSingle(),
    supabaseAdmin.from('profiles').select('id,full_name,avatar_url').eq('id', contactId).maybeSingle(),
  ])
  if (!profile || !hasMessagingPermission(membership)) return null
  return {
    user_id: profile.id,
    full_name: profile.full_name || 'Organization contact',
    avatar_url: profile.avatar_url || null,
    organization_id: orgId,
    organization_name: organization.name || 'Organization',
    contact_label: settings.primary_family_contact_label || 'Family Support',
    can_message: true,
  } satisfies FamilyOrganizationContact
}

export function familyContactMatches(contact: FamilyOrganizationContact, query: string) {
  const needle = query.trim().toLowerCase()
  return !needle || [contact.full_name, contact.organization_name, contact.contact_label]
    .some(value => value.toLowerCase().includes(needle))
}
