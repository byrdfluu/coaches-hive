import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { asSharedSupabaseClient } from '@/lib/sharedSupabaseContract'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const sharedSupabase = asSharedSupabaseClient(supabase)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const requestedWorkspaceId = request.headers.get('x-workspace-id')
  const { data: contexts, error } = await sharedSupabase.rpc('my_league_contexts')
  if (error) return NextResponse.json({ error: 'Unable to load league access. Please retry.' }, { status: 500 })
  const normalized = ((contexts || []) as Array<Record<string,unknown>>).map(item => ({ ...item, id: item.league_id }))
  const { data: selectedWorkspace } = requestedWorkspaceId
    ? await sharedSupabase.from('workspace_memberships').select('workspace_id,business_workspaces!inner(league_id,workspace_type)')
      .eq('user_id', session.user.id).eq('workspace_id', requestedWorkspaceId).eq('status', 'active').maybeSingle()
    : { data: null }
  const selected = Array.isArray((selectedWorkspace as any)?.business_workspaces)
    ? (selectedWorkspace as any).business_workspaces[0] : (selectedWorkspace as any)?.business_workspaces
  const activeLeagueId = selected?.workspace_type === 'league' ? selected.league_id : null
  return NextResponse.json({ contexts: normalized, active: normalized.find((item) => item.id === activeLeagueId) || null })
}
