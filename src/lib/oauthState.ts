import crypto from 'crypto'

const getSecret = () => {
  const secret = process.env.INTEGRATIONS_STATE_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing INTEGRATIONS_STATE_SECRET')
  }
  return 'dev-integrations-secret'
}

type OAuthStatePayload = {
  userId: string
  provider: 'google' | 'zoom'
  returnTo?: string
  ts: number
}

const encodeBase64Url = (value: string) => Buffer.from(value).toString('base64url')
const decodeBase64Url = (value: string) => Buffer.from(value, 'base64url').toString('utf-8')

export const createOAuthState = (payload: Omit<OAuthStatePayload, 'ts'>) => {
  const body: OAuthStatePayload = { ...payload, ts: Date.now() }
  const encoded = encodeBase64Url(JSON.stringify(body))
  const signature = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export const verifyOAuthState = (value: string, maxAgeMs = 15 * 60 * 1000) => {
  const [encoded, signature] = value.split('.')
  if (!encoded || !signature) return null
  const expected = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url')
  if (expected !== signature) return null
  const payload = JSON.parse(decodeBase64Url(encoded)) as OAuthStatePayload
  if (!payload?.userId || !payload?.provider || !payload?.ts) return null
  if (Date.now() - payload.ts > maxAgeMs) return null
  return payload
}
