import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { updateIntegrationSettings } from '@/lib/integrationSettings'
import { verifyOAuthState } from '@/lib/oauthState'

const getEnv = (name: string) => {
  const value = process.env[name]
  return value || ''
}

const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (!state) {
    return NextResponse.json({ error: 'Missing state' }, { status: 400 })
  }

  const payload = verifyOAuthState(state)
  if (!payload || payload.provider !== 'zoom') {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  const returnTo = payload.returnTo || '/coach/settings'
  const redirectUrl = new URL(returnTo, url.origin)

  if (error) {
    redirectUrl.searchParams.set('integration', 'zoom-error')
    return NextResponse.redirect(redirectUrl.toString())
  }

  if (!code) {
    redirectUrl.searchParams.set('integration', 'zoom-error')
    return NextResponse.redirect(redirectUrl.toString())
  }

  const redirectUri = `${url.origin}/api/integrations/zoom/callback`
  const clientId = getEnv('ZOOM_OAUTH_CLIENT_ID')
  const clientSecret = getEnv('ZOOM_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    redirectUrl.searchParams.set('integration', 'zoom-missing-credentials')
    return NextResponse.redirect(redirectUrl.toString())
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const tokenResponse = await fetch(`${ZOOM_TOKEN_URL}?grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
    },
  })

  if (!tokenResponse.ok) {
    redirectUrl.searchParams.set('integration', 'zoom-error')
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
    .eq('provider', 'zoom')
    .maybeSingle()

  const refreshToken = tokenPayload.refresh_token || existing?.refresh_token || null
  const scopes = tokenPayload.scope ? String(tokenPayload.scope).split(' ') : []

  await supabaseAdmin
    .from('user_integrations')
    .upsert({
      user_id: payload.userId,
      provider: 'zoom',
      access_token: tokenPayload.access_token,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      scopes,
      status: 'active',
      metadata: {
        token_type: tokenPayload.token_type,
        account_id: tokenPayload.account_id,
        zoom_user_id: tokenPayload.user_id,
      },
    }, { onConflict: 'user_id,provider' })

  await updateIntegrationSettings(payload.userId, {
    videoProvider: 'zoom',
    connections: {
      zoom: { connected: true, connected_at: new Date().toISOString() },
    },
  })

  redirectUrl.searchParams.set('integration', 'zoom')
  return NextResponse.redirect(redirectUrl.toString())
}
