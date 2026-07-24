import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}))
    const email = String(payload?.email || '').trim().toLowerCase()
    const password = String(payload?.password || '')
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    const supabase = await createRouteHandlerClientCompat()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user || !data.session) {
      const message = String(error?.message || '').toLowerCase()
      if (message.includes('invalid login credentials')) {
        return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
      }
      if (message.includes('email not confirmed')) {
        return NextResponse.json({ error: 'Verify your email before signing in.' }, { status: 403 })
      }
      console.error('[api/auth/login] Supabase sign-in failed', error)
      return NextResponse.json({ error: 'Unable to sign in right now. Please try again.' }, { status: 503 })
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        user_metadata: data.user.user_metadata,
      },
    })
  } catch (error) {
    console.error('[api/auth/login] unexpected failure', error)
    return NextResponse.json(
      { error: 'Unable to reach the authentication service. Please try again.' },
      { status: 503 },
    )
  }
}
