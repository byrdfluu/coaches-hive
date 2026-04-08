import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { createOAuthState } from '@/lib/oauthState'
export const dynamic = 'force-dynamic'


const getEnv = (name: string) => {
  const value = process.env[name]
  return value || ''
}

const ZOOM_AUTH_URL = 'https://zoom.us/oauth/authorize'
const ZOOM_SCOPES = ['meeting:write', 'meeting:read', 'user:read'].join(' ')

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const returnTo = url.searchParams.get('returnTo') || '/coach/settings'
  const redirectUri = `${url.origin}/api/integrations/zoom/callback`
  const state = createOAuthState({ userId: session.user.id, provider: 'zoom', returnTo })

  const clientId = getEnv('ZOOM_OAUTH_CLIENT_ID')
  if (!clientId) {
    const envPath = `${process.cwd()}/.env.local`
    return NextResponse.json(
      { error: `Missing ZOOM_OAUTH_CLIENT_ID. Add it to ${envPath} and restart the dev server.` },
      { status: 500 },
    )
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: ZOOM_SCOPES,
    state,
  })

  return NextResponse.redirect(`${ZOOM_AUTH_URL}?${params.toString()}`)
}
