import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'

export async function createAuthenticatedRequestClient(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token) return createRouteHandlerClientCompat()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase public configuration is missing')
  return createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
}
