import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { resolvePortalCapabilities } from '@/lib/portalCapabilities'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const url = new URL(request.url)
  const { data: preference } = await supabase.from('active_workspace_preferences')
    .select('workspace_id,acting_role').eq('user_id', session.user.id).maybeSingle()
  const workspaceId = url.searchParams.get('workspace_id') || preference?.workspace_id || null
  // Organization scope is derived from the authorized workspace. Metadata is
  // deliberately not allowed to override a device-shared workspace choice.
  const orgId = url.searchParams.get('org_id') || null
  const activeRole = String(preference?.acting_role || session.user.user_metadata?.active_role || '') || null
  const document = await resolvePortalCapabilities(session.user.id, workspaceId, orgId, activeRole)
  if (!document) return NextResponse.json({ error: 'No active portal access is available.' }, { status: 403 })
  return NextResponse.json({
    ...document,
    selected_athlete_profile_id: session.user.user_metadata?.selected_athlete_profile_id || null,
    selected_coach_team_id: session.user.user_metadata?.selected_coach_team_id || null,
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
