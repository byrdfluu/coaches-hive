import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { loadAuthorizedContexts } from '@/lib/authorizedContexts'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  try {
    const contexts = await loadAuthorizedContexts(supabase)
    const activeWorkspace = contexts.workspaces.find(workspace => workspace.is_last_used) || null
    const activeRole = activeWorkspace?.roles.includes(String(session.user.user_metadata?.active_role || ''))
      ? String(session.user.user_metadata?.active_role)
      : activeWorkspace?.roles[0] || session.user.user_metadata?.role || null
    return NextResponse.json({
      user_id: session.user.id,
      active_workspace_id: activeWorkspace?.workspace_id || null,
      active_role: activeRole,
      ...contexts,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch {
    return NextResponse.json({ error: 'Unable to load your authorized workspaces.' }, { status: 500 })
  }
}
