import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = new Set([
  'org_admin', 'school_admin', 'club_admin', 'travel_admin',
  'athletic_director', 'program_director',
])

export async function GET(request: Request, context: { params: Promise<{ orgId: string }> }) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)
  const { orgId } = await context.params

  const { data: membership, error } = await supabaseAdmin
    .from('organization_memberships')
    .select('role, status')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return jsonError('Unable to load organization membership', 500)
  if (!membership || !['active', 'accepted'].includes(String(membership.status || 'active').toLowerCase())) {
    return jsonError('Forbidden', 403)
  }

  const role = String(membership.role || 'member')
  const { data: configured } = await supabaseAdmin
    .from('org_role_permissions')
    .select('permissions, updated_at')
    .eq('org_id', orgId)
    .eq('role', role)
    .maybeSingle()
  const permissions = (configured?.permissions || {}) as Record<string, boolean>
  const isAdmin = ADMIN_ROLES.has(role)

  return NextResponse.json({
    organization_id: orgId,
    role,
    capabilities: {
      view_dashboard: true,
      manage_members: isAdmin,
      manage_coaches: isAdmin,
      manage_teams: isAdmin || role === 'team_manager',
      manage_schedule: isAdmin || role === 'team_manager' || role === 'coach',
      manage_billing: isAdmin,
      manage_permissions: isAdmin,
      manage_marketplace: isAdmin,
      view_reports: isAdmin,
      ...permissions,
    },
    updated_at: configured?.updated_at || null,
  })
}

