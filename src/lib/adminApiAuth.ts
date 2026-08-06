import { NextResponse } from 'next/server'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function requireSuperadminApi() {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
  const access = resolveAdminAccess({ ...(session.user.user_metadata || {}), role: profile?.role || session.user.user_metadata?.role })
  if (!access.isSuperadmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user: session.user, error: null }
}
