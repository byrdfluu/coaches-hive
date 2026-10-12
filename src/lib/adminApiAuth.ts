import { NextResponse } from 'next/server'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'

export async function requireSuperadminApi(request?: Request) {
  const auth = await requireAdminApi(request)
  if (auth.error || !auth.user || !auth.access) return auth
  if (!auth.access.isSuperadmin) {
    return { user: null, access: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return auth
}

export async function requireAdminApi(request?: Request) {
  const bearerUser = request ? await getMobileRequestUser(request) : null
  const supabase = bearerUser ? null : await createRouteHandlerClientCompat()
  const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
  const user = bearerUser || session?.user || null
  if (!user) return { user: null, access: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const access = resolveAdminAccess({ ...(user.user_metadata || {}), role: profile?.role || user.user_metadata?.role })
  if (!access.isAdmin) {
    return { user: null, access: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user, access, error: null }
}
