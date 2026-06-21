import type { User } from '@supabase/supabase-js'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const getMobileRequestUser = async (request: Request): Promise<User | null> => {
  const authorization = request.headers.get('authorization') || ''
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (bearer) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearer)
    if (error || !data.user) return null
    return data.user
  }

  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user || null
}

