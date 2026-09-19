import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { requireOrgRoleAccess, roleAudit } from '@/lib/mobileOrganizationRoles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string; roleId: string }> }) {
  const { orgId, roleId } = await params, access = await requireOrgRoleAccess(request, orgId, 'manage_members')
  if ('response' in access) return access.response
  const body = await request.json().catch(() => ({})), userId = String(body.user_id || '').trim()
  const scopeType = String(body.scope_type || 'organization'), scopeId = body.scope_id ? String(body.scope_id) : null
  if (!userId || !['organization','program','team','division'].includes(scopeType) || (scopeType !== 'organization' && !scopeId)) return mobileError('Valid user_id and scope are required', 422)
  const [{ data: role }, { data: member }] = await Promise.all([
    supabaseAdmin.from('organization_role_definitions').select('id').eq('id', roleId).eq('org_id', orgId).eq('is_active', true).maybeSingle(),
    supabaseAdmin.from('organization_memberships').select('id').eq('org_id', orgId).eq('user_id', userId).eq('status', 'active').maybeSingle(),
  ])
  if (!role) return mobileError('Role not found', 404)
  if (!member) return mobileError('User is not an active organization member', 403)
  let existingQuery = supabaseAdmin.from('organization_role_assignments').select('*').eq('org_id', orgId)
    .eq('role_definition_id', roleId).eq('user_id', userId).eq('scope_type', scopeType)
  existingQuery = scopeId ? existingQuery.eq('scope_id', scopeId) : existingQuery.is('scope_id', null)
  const { data: existing } = await existingQuery.maybeSingle()
  const { data, error } = existing ? { data: existing, error: null } : await supabaseAdmin.from('organization_role_assignments').insert({ org_id: orgId, role_definition_id: roleId,
    user_id: userId, scope_type: scopeType, scope_id: scopeId }).select('*').single()
  if (error) return mobileError('Unable to assign role', 500)
  await roleAudit(access.user, orgId, 'organization.role.assigned', roleId, { assignment_id: data.id, user_id: userId, scope_type: scopeType, scope_id: scopeId })
  return NextResponse.json({ assignment: data }, { status: 201 })
}
