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
    return NextResponse.json({
      user_id: session.user.id,
      active_workspace_id: session.user.user_metadata?.active_workspace_id || null,
      active_role: session.user.user_metadata?.active_role || session.user.user_metadata?.role || null,
      ...contexts,
    })
  } catch {
    return NextResponse.json({ error: 'Unable to load your authorized workspaces.' }, { status: 500 })
  }
}
