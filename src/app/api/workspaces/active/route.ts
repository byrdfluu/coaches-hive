import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { roleToPath } from '@/lib/roleRedirect'

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const workspaceId = String(body?.workspace_id || '')
  const leagueId = String(body?.league_id || '')
  if (leagueId) {
    const { data: membership } = await supabaseAdmin.from('league_memberships').select('role').eq('league_id',leagueId).eq('user_id',session.user.id).eq('status','active').maybeSingle()
    if (!membership) return NextResponse.json({ error: 'That league is no longer available to your account.' }, { status: 403 })
    const { error } = await supabase.auth.updateUser({ data: { ...session.user.user_metadata, active_role: membership.role, current_league_id: leagueId } })
    if (error) return NextResponse.json({ error: 'Unable to switch leagues. Please retry.' }, { status: 500 })
    return NextResponse.json({ next_path: '/league' })
  }
  const { data: membership } = await supabaseAdmin.from('workspace_memberships').select('roles,business_workspaces!inner(organization_id)')
    .eq('workspace_id',workspaceId).eq('user_id',session.user.id).eq('status','active').maybeSingle()
  if (!membership) return NextResponse.json({ error: 'That workspace is no longer available to your account.' }, { status: 403 })
  const role = (membership.roles || [])[0] || 'athlete'
  await supabaseAdmin.from('active_workspace_preferences').upsert({ user_id: session.user.id, workspace_id: workspaceId, acting_role: role, updated_at: new Date().toISOString() })
  const raw = Array.isArray((membership as any).business_workspaces) ? (membership as any).business_workspaces[0] : (membership as any).business_workspaces
  const { error } = await supabase.auth.updateUser({ data: { ...session.user.user_metadata, active_role: role, ...(raw?.organization_id ? { current_org_id: raw.organization_id } : {}) } })
  if (error) return NextResponse.json({ error: 'Unable to switch workspaces. Please retry.' }, { status: 500 })
  return NextResponse.json({ next_path: roleToPath(role) })
}
