import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const { id } = await context.params
  const [{ data: profile }, { data: preference }, { data: memberships, error }] = await Promise.all([
    supabaseAdmin.from('profiles').select('id,email,full_name,role').eq('id', id).maybeSingle(),
    supabaseAdmin.from('active_workspace_preferences').select('workspace_id,acting_role,updated_at').eq('user_id', id).maybeSingle(),
    supabaseAdmin.from('workspace_memberships')
      .select('id,workspace_id,roles,permissions,status,created_at,updated_at,business_workspaces!inner(id,display_name,workspace_type,organization_id,owner_user_id,status)')
      .eq('user_id', id).order('created_at'),
  ])
  if (error) return NextResponse.json({ error: 'Unable to load user workspaces.' }, { status: 500 })
  if (!profile) return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  const items = (memberships || []).map((membership: any) => {
    const workspace = Array.isArray(membership.business_workspaces)
      ? membership.business_workspaces[0]
      : membership.business_workspaces
    const organizationCoveredCoach = workspace?.workspace_type === 'organization'
      && Array.isArray(membership.roles) && membership.roles.includes('coach')
    const independentlyActivated = workspace?.workspace_type === 'independent_coach'
      && workspace?.owner_user_id === id && membership.status === 'active'
    return {
      membership_id: membership.id,
      workspace_id: membership.workspace_id,
      workspace_name: workspace?.display_name || null,
      workspace_type: workspace?.workspace_type || null,
      workspace_status: workspace?.status || null,
      organization_id: workspace?.organization_id || null,
      roles: membership.roles || [],
      permissions: membership.permissions || {},
      membership_status: membership.status,
      is_active_context: preference?.workspace_id === membership.workspace_id,
      active_acting_role: preference?.workspace_id === membership.workspace_id ? preference?.acting_role || null : null,
      organization_covered_coaching_access: organizationCoveredCoach,
      independent_business_activated: independentlyActivated,
    }
  })
  return NextResponse.json({ user: profile, active_workspace_preference: preference || null, workspaces: items })
}
