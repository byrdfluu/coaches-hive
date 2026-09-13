import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { resolvePortalCapabilities } from '@/lib/portalCapabilities'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const url = new URL(request.url)
  const workspaceId = url.searchParams.get('workspace_id') || String(session.user.user_metadata?.active_workspace_id || '') || null
  const orgId = url.searchParams.get('org_id') || String(session.user.user_metadata?.current_org_id || '') || null
  const activeRole = String(session.user.user_metadata?.active_role || '') || null
  const document = await resolvePortalCapabilities(session.user.id, workspaceId, orgId, activeRole)
  if (!document) return NextResponse.json({ error: 'No active portal access is available.' }, { status: 403 })
  return NextResponse.json({
    ...document,
    selected_athlete_profile_id: session.user.user_metadata?.selected_athlete_profile_id || null,
    selected_coach_team_id: session.user.user_metadata?.selected_coach_team_id || null,
  })
}
