export type SessionRateKey = 'oneOnOne' | 'team' | 'group' | 'virtual' | 'assessment'

export type SessionRates = Partial<Record<SessionRateKey, string | number | null | undefined>>

const toNormalizedNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const cleaned = String(value).replace(/[^0-9.-]/g, '').trim()
  if (!cleaned) return null
  const parsed = Number.parseFloat(cleaned)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export const parseCurrencyToCents = (value: string | number | null | undefined) => {
  const amount = toNormalizedNumber(value)
  if (amount === null) return 0
  return Math.max(0, Math.round(amount * 100))
}

export const resolveSessionRateKey = (
  sessionType?: string | null,
  meetingMode?: string | null,
): SessionRateKey => {
  if (meetingMode === 'online') return 'virtual'
  const normalized = String(sessionType || '').toLowerCase()
  if (normalized.includes('team')) return 'team'
  if (normalized.includes('group')) return 'group'
  if (normalized.includes('assessment')) return 'assessment'
  return 'oneOnOne'
}

export const resolveSessionRateCents = (params: {
  rates?: SessionRates | null
  sessionType?: string | null
  meetingMode?: string | null
}) => {
  const rates = params.rates || {}
  const rateKey = resolveSessionRateKey(params.sessionType, params.meetingMode)
  const exact = parseCurrencyToCents(rates[rateKey])
  if (exact > 0) return exact
  if (rateKey === 'virtual') {
    return parseCurrencyToCents(rates.oneOnOne)
  }
  return 0
}
