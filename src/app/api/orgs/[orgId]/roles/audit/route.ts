import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { requireOrgRoleAccess } from '@/lib/mobileOrganizationRoles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const orgId = (await params).orgId, access = await requireOrgRoleAccess(request, orgId, 'view_audit')
  if ('response' in access) return access.response
  const { data, error } = await supabaseAdmin.from('org_audit_log').select('*').eq('org_id', orgId)
    .like('action', 'organization.role.%').order('created_at', { ascending: false }).limit(200)
  if (error) return mobileError('Unable to load role audit', 500)
  return NextResponse.json({ items: data || [] })
}
