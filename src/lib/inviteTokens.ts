import { createHash, randomBytes } from 'node:crypto'

export const INVITE_TOKEN_TTL_DAYS = 14

export const createInviteToken = () => randomBytes(32).toString('base64url')

export const createInvitationCode = () => String(Number.parseInt(randomBytes(4).toString('hex'), 16) % 1_000_000).padStart(6, '0')

export const hashInviteToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex')

export const inviteTokenExpiresAt = () => {
  const expiresAt = new Date()
  expiresAt.setUTCDate(expiresAt.getUTCDate() + INVITE_TOKEN_TTL_DAYS)
  return expiresAt.toISOString()
}
