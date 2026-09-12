import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { asSharedSupabaseClient } from '@/lib/sharedSupabaseContract'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const { data, error } = await asSharedSupabaseClient(supabase).rpc('my_accessible_athlete_profiles')
  if (error) return NextResponse.json({ error: 'Unable to load authorized athlete profiles.' }, { status: 500 })
  return NextResponse.json({ profiles: data || [] })
}
