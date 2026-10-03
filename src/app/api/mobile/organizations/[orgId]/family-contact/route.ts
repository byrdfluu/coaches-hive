import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mobileContractError } from '@/lib/mobileApiContract'
import { authorizeWorkspaceRequest, workspaceCan } from '@/lib/workspaceAuthority'
import { normalizeUuid } from '@/lib/uuid'

const fail = (code: string, message: string, status: number) =>
  mobileContractError(code, message, status, status === 429 || status >= 500)
const canMessage = (roles: unknown, permissions: unknown) => {
  const normalizedRoles = Array.isArray(roles) ? roles.map(String) : []
  const values = permissions && typeof permissions === 'object' ? permissions as Record<string, unknown> : {}
  return normalizedRoles.some(role => ['owner', 'org_admin'].includes(role)) || values.manage_messages === true
    || values['messages.manage'] === true || values.messaging === true
}

export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const user = await getMobileRequestUser(request)
  if (!user) return fail('unauthorized', 'Authentication is required.', 401)
  const orgId = normalizeUuid((await params).orgId)
  const body = await request.json().catch(() => ({}))
  if (!orgId) return fail('invalid_organization', 'Organization is required.', 422)
  const authority = await authorizeWorkspaceRequest({ request, userId: user.id,
    body: { organization_id: orgId }, expectedType: 'organization' })
  if (!authority.ok || !workspaceCan(authority.workspace, 'manage_members')) {
    return fail('forbidden', 'Organization administration permission is required.', 403)
  }
  const contactId = body.user_id == null ? null : normalizeUuid(body.user_id)
  const label = String(body.contact_label || 'Family Support').trim().slice(0, 80)
  if (body.user_id != null && !contactId) return fail('invalid_contact', 'Select a valid organization staff member.', 422)
  if (contactId) {
    const { data: membership } = await supabaseAdmin.from('workspace_memberships').select('roles,permissions,status')
      .eq('workspace_id', authority.workspace.id).eq('user_id', contactId).eq('status', 'active').maybeSingle()
    if (!membership || !canMessage(membership.roles, membership.permissions)) {
      return fail('contact_not_authorized', 'Select an active staff member with messaging permission.', 409)
    }
  }
  const { error } = await supabaseAdmin.from('org_settings').upsert({ org_id: orgId,
    primary_family_contact_user_id: contactId, primary_family_contact_label: contactId ? label || 'Family Support' : null,
    updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
  if (error) return fail('family_contact_update_failed', 'Unable to update the family contact.', 503)
  return NextResponse.json({ organization_id: orgId, user_id: contactId,
    contact_label: contactId ? label || 'Family Support' : null })
}
