import { createHmac, randomUUID, timingSafeEqual } from 'crypto'

export type MobileCheckoutType = 'fee' | 'marketplace' | 'onboarding'

export type MobileCheckoutClaims = {
  version: 1
  nonce: string
  type: MobileCheckoutType
  userId: string
  resourceId?: string
  athleteProfileId?: string
  role?: string
  tier?: string
  issuedAt: number
  expiresAt: number
}

const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64url')
const decode = (value: string) => Buffer.from(value, 'base64url').toString('utf8')

const getSecret = () => {
  const secret = process.env.MOBILE_CHECKOUT_TOKEN_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('MOBILE_CHECKOUT_TOKEN_SECRET must be configured with at least 32 characters')
  }
  return secret
}

const signPayload = (payload: string) =>
  createHmac('sha256', getSecret()).update(payload).digest('base64url')

export const createMobileCheckoutToken = (
  input: Omit<MobileCheckoutClaims, 'version' | 'nonce' | 'issuedAt' | 'expiresAt'>,
  lifetimeSeconds = 2 * 60 * 60,
) => {
  const now = Math.floor(Date.now() / 1000)
  const claims: MobileCheckoutClaims = {
    ...input,
    version: 1,
    nonce: randomUUID(),
    issuedAt: now,
    expiresAt: now + lifetimeSeconds,
  }
  const payload = encode(JSON.stringify(claims))
  return { token: `${payload}.${signPayload(payload)}`, claims }
}

export const verifyMobileCheckoutToken = (token: string): MobileCheckoutClaims => {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) throw new Error('Invalid checkout token')

  const expected = Buffer.from(signPayload(payload))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error('Invalid checkout token')
  }

  let claims: MobileCheckoutClaims
  try {
    claims = JSON.parse(decode(payload)) as MobileCheckoutClaims
  } catch {
    throw new Error('Invalid checkout token')
  }

  const now = Math.floor(Date.now() / 1000)
  if (claims.version !== 1 || !claims.nonce || !claims.userId || claims.expiresAt <= now) {
    throw new Error('Checkout token has expired')
  }
  if (!['fee', 'marketplace', 'onboarding'].includes(claims.type)) {
    throw new Error('Invalid checkout token')
  }
  return claims
}

