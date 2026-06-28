import type { User } from '@supabase/supabase-js'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const getMobileRequestUser = async (request: Request): Promise<User | null> => {
  const authorization = request.headers.get('authorization') || ''
  console.log('[getMobileRequestUser] authorization header raw:', JSON.stringify(authorization.slice(0, 40)))
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  console.log('[getMobileRequestUser] bearer extracted:', bearer ? bearer.slice(0, 20) + '...' : 'null/undefined')
  if (bearer) {
    const result = await supabaseAdmin.auth.getUser(bearer)
    console.log('[getMobileRequestUser] getUser full result:', JSON.stringify({
      userId: result.data?.user?.id ?? null,
      email: result.data?.user?.email ?? null,
      errorMessage: result.error?.message ?? null,
      errorStatus: (result.error as any)?.status ?? null,
      errorName: result.error?.name ?? null,
    }))
    if (result.error || !result.data.user) return null
    return result.data.user
  }

  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user || null
}

