import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { updateIntegrationSettings } from '@/lib/integrationSettings'
import { verifyOAuthState } from '@/lib/oauthState'

const getEnv = (name: string) => {
  const value = process.env[name]
  return value || ''
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (!state) {
    return NextResponse.json({ error: 'Missing state' }, { status: 400 })
  }

  const payload = verifyOAuthState(state)
  if (!payload || payload.provider !== 'google') {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  const returnTo = payload.returnTo || '/coach/settings'
  const redirectUrl = new URL(returnTo, url.origin)

  if (error) {
    redirectUrl.searchParams.set('integration', 'google-error')
    return NextResponse.redirect(redirectUrl.toString())
  }

  if (!code) {
    redirectUrl.searchParams.set('integration', 'google-error')
    return NextResponse.redirect(redirectUrl.toString())
  }

  const redirectUri = `${url.origin}/api/integrations/google/callback`

  const clientId = getEnv('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = getEnv('GOOGLE_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    redirectUrl.searchParams.set('integration', 'google-missing-credentials')
    return NextResponse.redirect(redirectUrl.toString())
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenResponse.ok) {
    redirectUrl.searchParams.set('integration', 'google-error')
    return NextResponse.redirect(redirectUrl.toString())
  }

  const tokenPayload = await tokenResponse.json()
  const expiresAt = tokenPayload.expires_in
    ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000).toISOString()
    : null

  const { data: existing } = await supabaseAdmin
    .from('user_integrations')
    .select('refresh_token')
    .eq('user_id', payload.userId)
    .eq('provider', 'google')
    .maybeSingle()

  const refreshToken = tokenPayload.refresh_token || existing?.refresh_token || null
  const scopes = tokenPayload.scope ? String(tokenPayload.scope).split(' ') : []

  await supabaseAdmin
    .from('user_integrations')
    .upsert({
      user_id: payload.userId,
      provider: 'google',
      access_token: tokenPayload.access_token,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      scopes,
      status: 'active',
      metadata: {
        token_type: tokenPayload.token_type,
      },
    }, { onConflict: 'user_id,provider' })

  await updateIntegrationSettings(payload.userId, {
    calendarProvider: 'google',
    videoProvider: 'google_meet',
    connections: {
      google: { connected: true, connected_at: new Date().toISOString() },
    },
  })

  redirectUrl.searchParams.set('integration', 'google')
  return NextResponse.redirect(redirectUrl.toString())
}
