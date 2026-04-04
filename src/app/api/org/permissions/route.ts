import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
]

export async function GET(request: Request) {
  const { session, error } = await getSessionRole()
  if (error || !session) return error

  const url = new URL(request.url)
  const orgId = url.searchParams.get('org_id')
  if (!orgId) return jsonError('org_id is required')

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!membership) return jsonError('Forbidden', 403)

  const { data, error: queryError } = await supabaseAdmin
    .from('org_role_permissions')
    .select('role, permissions, updated_at')
    .eq('org_id', orgId)

  if (queryError) return jsonError(queryError.message, 500)

  return NextResponse.json({ permissions: data || [] })
}

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole()
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const { org_id, role: targetRole, permissions } = body || {}

  if (!org_id || !targetRole) {
    return jsonError('org_id and role are required')
  }

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('role')
    .eq('org_id', org_id)
    .eq('user_id', session.user.id)
    .maybeSingle()

  const memberRole = membership?.role || role

  if (!membership || !ADMIN_ROLES.includes(String(memberRole || ''))) {
    return jsonError('Forbidden', 403)
  }

  const payload = {
    org_id,
    role: targetRole,
    permissions: permissions || {},
    updated_at: new Date().toISOString(),
  }

  const { data, error: upsertError } = await supabaseAdmin
    .from('org_role_permissions')
    .upsert(payload, { onConflict: 'org_id,role' })
    .select('role, permissions, updated_at')
    .maybeSingle()

  if (upsertError) {
    return jsonError(upsertError.message, 500)
  }

  return NextResponse.json({ permission: data })
}
