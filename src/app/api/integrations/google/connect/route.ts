import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createOAuthState } from '@/lib/oauthState'
export const dynamic = 'force-dynamic'


const getEnv = (name: string) => {
  const value = process.env[name]
  return value || ''
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ')

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const returnTo = url.searchParams.get('returnTo') || '/coach/settings'
  const redirectUri = `${url.origin}/api/integrations/google/callback`
  const state = createOAuthState({ userId: session.user.id, provider: 'google', returnTo })

  const clientId = getEnv('GOOGLE_OAUTH_CLIENT_ID')
  if (!clientId) {
    const envPath = `${process.cwd()}/.env.local`
    return NextResponse.json(
      { error: `Missing GOOGLE_OAUTH_CLIENT_ID. Add it to ${envPath} and restart the dev server.` },
      { status: 500 },
    )
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
  })

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`)
}
