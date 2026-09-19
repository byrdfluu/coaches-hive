import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { permissionObject, requireOrgRoleAccess, roleAudit } from '@/lib/mobileOrganizationRoles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const orgId = (await params).orgId, access = await requireOrgRoleAccess(request, orgId)
  if ('response' in access) return access.response
  const { data, error } = await supabaseAdmin.from('organization_role_definitions')
    .select('id,role_key,display_name,description,permissions,is_active,created_at,updated_at,organization_role_assignments(id,user_id,scope_type,scope_id,created_at)')
    .eq('org_id', orgId).order('display_name')
  if (error) return mobileError('Unable to load organization roles', 500)
  return NextResponse.json({ items: data || [] })
}

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const orgId = (await params).orgId, access = await requireOrgRoleAccess(request, orgId, 'manage_settings')
  if ('response' in access) return access.response
  const body = await request.json().catch(() => ({}))
  const roleKey = String(body.role_key || '').trim().toLowerCase(), displayName = String(body.display_name || '').trim()
  const permissions = permissionObject(body.permissions)
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(roleKey) || !displayName || displayName.length > 80 || !permissions) return mobileError('Valid role_key, display_name, and permission keys are required', 422)
  const { data, error } = await supabaseAdmin.from('organization_role_definitions').insert({ org_id: orgId, role_key: roleKey,
    display_name: displayName, description: String(body.description || '').trim() || null, permissions, is_active: true }).select('*').single()
  if (error?.code === '23505') return mobileError('Role key or display name already exists', 409)
  if (error || !data) return mobileError('Unable to create organization role', 500)
  await roleAudit(access.user, orgId, 'organization.role.created', data.id, { role_key: roleKey, display_name: displayName })
  return NextResponse.json({ role: data }, { status: 201 })
}
