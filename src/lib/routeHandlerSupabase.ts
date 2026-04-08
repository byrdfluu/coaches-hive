import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const createRouteHandlerClientCompat = async () => {
  const cookieStore = await cookies()
  const resolvedCookies = (() => cookieStore) as unknown as typeof cookies

  return createRouteHandlerClient({
    cookies: resolvedCookies,
  })
}
