import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { requireOrgRoleAccess, roleAudit } from '@/lib/mobileOrganizationRoles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function DELETE(request: Request, { params }: { params: Promise<{ orgId: string; roleId: string; userId: string }> }) {
  const { orgId, roleId, userId } = await params, access = await requireOrgRoleAccess(request, orgId, 'manage_members')
  if ('response' in access) return access.response
  const url = new URL(request.url), scopeType = url.searchParams.get('scope_type'), scopeId = url.searchParams.get('scope_id')
  let query = supabaseAdmin.from('organization_role_assignments').delete().eq('org_id', orgId).eq('role_definition_id', roleId).eq('user_id', userId)
  if (scopeType) query = query.eq('scope_type', scopeType)
  if (scopeId) query = query.eq('scope_id', scopeId)
  const { data, error } = await query.select('id')
  if (error) return mobileError('Unable to remove role assignment', 500)
  if (!data?.length) return mobileError('Role assignment not found', 404)
  await roleAudit(access.user, orgId, 'organization.role.unassigned', roleId, { user_id: userId, assignment_ids: data.map((row) => row.id) })
  return NextResponse.json({ ok: true, removed: data.length })
}
