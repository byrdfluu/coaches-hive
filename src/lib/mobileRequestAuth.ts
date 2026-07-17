import type { User } from '@supabase/supabase-js'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const getMobileRequestUser = async (request: Request): Promise<User | null> => {
  const authorization = request.headers.get('authorization') || ''
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (bearer) {
    const result = await supabaseAdmin.auth.getUser(bearer)
    if (result.error || !result.data.user) return null
    return result.data.user
  }

  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user || null
}
