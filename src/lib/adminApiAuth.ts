import { NextResponse } from 'next/server'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'

export async function requireSuperadminApi(request?: Request) {
  const bearerUser = request ? await getMobileRequestUser(request) : null
  const supabase = bearerUser ? null : await createRouteHandlerClientCompat()
  const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
  const user = bearerUser || session?.user || null
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const access = resolveAdminAccess({ ...(user.user_metadata || {}), role: profile?.role || user.user_metadata?.role })
  if (!access.isSuperadmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user, error: null }
}
