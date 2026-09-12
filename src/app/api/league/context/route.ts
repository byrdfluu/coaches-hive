import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { asSharedSupabaseClient } from '@/lib/sharedSupabaseContract'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const sharedSupabase = asSharedSupabaseClient(supabase)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const requested = new URL(request.url).searchParams.get('league_id')
  const { data: contexts, error } = await sharedSupabase.rpc('my_league_contexts')
  if (error) return NextResponse.json({ error: 'Unable to load league access. Please retry.' }, { status: 500 })
  const normalized = ((contexts || []) as Array<Record<string,unknown>>).map(item => ({ ...item, id: item.league_id }))
  const preferredId = requested || String(session.user.user_metadata?.current_league_id || '')
  return NextResponse.json({ contexts: normalized, active: normalized.find((item) => item.id === preferredId) || normalized[0] || null })
}
