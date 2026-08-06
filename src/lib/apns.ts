import { createSign } from 'node:crypto'
import * as http2 from 'node:http2'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type PushNotification = {
  user_id: string
  title?: string | null
  body?: string | null
  action_url?: string | null
  data?: Record<string, unknown> | null
}

type ApnsResult = {
  token: string
  delivered: boolean
  status: number
  reason?: string
}

let cachedProviderToken: { value: string; issuedAt: number } | null = null

const base64Url = (value: string | Buffer) => Buffer.from(value).toString('base64url')

const getApnsConfig = () => {
  const rawKey = process.env.APNS_PRIVATE_KEY || process.env.APNS_KEY || ''
  const privateKey = rawKey.startsWith('base64:')
    ? Buffer.from(rawKey.slice('base64:'.length), 'base64').toString('utf8')
    : rawKey.replace(/\\n/g, '\n')
  const keyId = process.env.APNS_KEY_ID || ''
  const teamId = process.env.APNS_TEAM_ID || ''
  const bundleId = process.env.APNS_BUNDLE_ID || 'com.coacheshive.mobile'
  const environment = process.env.APNS_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production'
  if (!privateKey || !keyId || !teamId || !bundleId) return null
  return { privateKey, keyId, teamId, bundleId, environment }
}

const createProviderToken = (config: NonNullable<ReturnType<typeof getApnsConfig>>) => {
  const now = Math.floor(Date.now() / 1000)
  if (cachedProviderToken && now - cachedProviderToken.issuedAt < 50 * 60) {
    return cachedProviderToken.value
  }

  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: config.keyId }))
  const claims = base64Url(JSON.stringify({ iss: config.teamId, iat: now }))
  const signingInput = `${header}.${claims}`
  const signature = createSign('SHA256')
    .update(signingInput)
    .end()
    .sign({ key: config.privateKey, dsaEncoding: 'ieee-p1363' })
  const value = `${signingInput}.${base64Url(signature)}`
  cachedProviderToken = { value, issuedAt: now }
  return value
}

const sendToDevice = async ({
  token,
  notification,
  config,
}: {
  token: string
  notification: PushNotification
  config: NonNullable<ReturnType<typeof getApnsConfig>>
}): Promise<ApnsResult> => {
  const authority = config.environment === 'sandbox'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com'
  const providerToken = createProviderToken(config)
  const payload = JSON.stringify({
    ...(notification.data || {}),
    action_url: notification.action_url || null,
    aps: {
      alert: {
        title: notification.title || 'Coaches Hive',
        body: notification.body || '',
      },
      sound: 'default',
    },
  })

  return new Promise((resolve) => {
    const client = http2.connect(authority)
    client.once('error', () => {
      client.close()
      resolve({ token, delivered: false, status: 0, reason: 'connection_error' })
    })
    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${providerToken}`,
      'apns-topic': config.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload),
    })
    let status = 0
    let responseBody = ''
    request.setEncoding('utf8')
    request.on('response', (headers) => {
      status = Number(headers[':status'] || 0)
    })
    request.on('data', (chunk) => {
      responseBody += chunk
    })
    request.on('error', () => {
      client.close()
      resolve({ token, delivered: false, status, reason: 'request_error' })
    })
    request.on('end', () => {
      client.close()
      let reason: string | undefined
      try {
        reason = responseBody ? JSON.parse(responseBody)?.reason : undefined
      } catch {
        reason = responseBody || undefined
      }
      resolve({ token, delivered: status === 200, status, reason })
    })
    request.end(payload)
  })
}

export const deliverNotificationPush = async (notification: PushNotification) => {
  const config = getApnsConfig()
  if (!config || !notification.user_id) return { configured: false, delivered: 0, failed: 0 }

  const { data: tokens, error } = await supabaseAdmin
    .from('device_tokens')
    .select('token')
    .eq('user_id', notification.user_id)
    .eq('platform', 'ios')
  if (error) throw error
  if (!tokens?.length) return { configured: true, delivered: 0, failed: 0 }

  const results = await Promise.all(tokens.map(({ token }) =>
    sendToDevice({ token, notification, config })))
  const invalidTokens = results
    .filter((result) => result.status === 410 || [
      'BadDeviceToken',
      'DeviceTokenNotForTopic',
      'Unregistered',
    ].includes(result.reason || ''))
    .map((result) => result.token)
  try { await supabaseAdmin.from('push_notification_deliveries').insert(results.map((result) => ({
    user_id: notification.user_id,
    device_token_suffix: result.token.slice(-8),
    environment: config.environment,
    status: result.delivered ? 'delivered' : (invalidTokens.includes(result.token) ? 'invalid' : 'failed'),
    apns_status: result.status,
    failure_reason: result.reason || null,
    action_url: notification.action_url || null,
  }))) } catch { /* Delivery must not fail if health logging is unavailable. */ }
  if (invalidTokens.length) {
    await supabaseAdmin.from('device_tokens')
      .delete()
      .eq('user_id', notification.user_id)
      .in('token', invalidTokens)
  }

  return {
    configured: true,
    delivered: results.filter((result) => result.delivered).length,
    failed: results.filter((result) => !result.delivered).length,
  }
}
