import { createRouteHandlerClient, createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const createRouteHandlerClientCompat = async () => {
  const cookieStore = await cookies()
  const resolvedCookies = (() => cookieStore) as unknown as typeof cookies

  return createRouteHandlerClient({
    cookies: resolvedCookies,
  })
}

// Use this in Server Components. createRouteHandlerClient will attempt to
// write refreshed session tokens back to cookies, which Next.js forbids
// inside a Server Component render. createServerComponentClient uses a
// read-only cookie adapter and never mutates cookies.
export const createServerComponentClientCompat = async () => {
  const cookieStore = await cookies()
  const resolvedCookies = (() => cookieStore) as unknown as typeof cookies

  return createServerComponentClient({
    cookies: resolvedCookies,
  })
}
