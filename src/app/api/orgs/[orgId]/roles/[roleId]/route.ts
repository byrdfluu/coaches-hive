import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { permissionObject, requireOrgRoleAccess, roleAudit } from '@/lib/mobileOrganizationRoles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(request: Request, { params }: { params: Promise<{ orgId: string; roleId: string }> }) {
  const { orgId, roleId } = await params, access = await requireOrgRoleAccess(request, orgId, 'manage_settings')
  if ('response' in access) return access.response
  const body = await request.json().catch(() => ({})), updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.display_name !== undefined) { const value = String(body.display_name).trim(); if (!value || value.length > 80) return mobileError('Invalid display_name', 422); updates.display_name = value }
  if (body.description !== undefined) updates.description = String(body.description || '').trim() || null
  if (body.permissions !== undefined) { const value = permissionObject(body.permissions); if (!value) return mobileError('Unknown permission key', 422); updates.permissions = value }
  if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
  if (body.role_key !== undefined) return mobileError('role_key is permanent and cannot be changed', 422)
  if (Object.keys(updates).length === 1) return mobileError('No editable fields supplied', 422)
  const { data, error } = await supabaseAdmin.from('organization_role_definitions').update(updates).eq('id', roleId).eq('org_id', orgId).select('*').maybeSingle()
  if (error?.code === '23505') return mobileError('Display name already exists', 409)
  if (error) return mobileError('Unable to update organization role', 500)
  if (!data) return mobileError('Role not found', 404)
  await roleAudit(access.user, orgId, 'organization.role.updated', roleId, { fields: Object.keys(updates).filter((key) => key !== 'updated_at') })
  return NextResponse.json({ role: data })
}
