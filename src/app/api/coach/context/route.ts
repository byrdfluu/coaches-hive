import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { resolveActiveCoachContext } from '@/lib/activeCoachContext'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  return NextResponse.json(await resolveActiveCoachContext(session.user.id))
}
