import { ORG_MARKETPLACE_FEE, ORG_SESSION_FEES } from '@/lib/orgPricing'
import { normalizeOrgTier, type OrgTier } from '@/lib/planRules'

export type OrgPlatformFeeKind = 'session' | 'marketplace'

export type OrgPlatformFeeBreakdown = {
  grossCents: number
  platformFeeCents: number
  netCents: number
  feeRate: number
  tier: OrgTier
  kind: OrgPlatformFeeKind
}

export const resolveOrgPlatformFeeKind = (source?: string | null, feeCategory?: string | null): OrgPlatformFeeKind => {
  const normalizedCategory = String(feeCategory || '').trim().toLowerCase()
  if (normalizedCategory === 'session') return 'session'
  if (normalizedCategory === 'marketplace_digital' || normalizedCategory === 'marketplace_physical') return 'marketplace'

  const normalizedSource = String(source || '').trim().toLowerCase()
  if (normalizedSource.includes('session') || normalizedSource.includes('fee') || normalizedSource.includes('booking')) {
    return 'session'
  }
  return 'marketplace'
}

export const getOrgPlatformFeeRate = (
  tier?: string | null,
  kind: OrgPlatformFeeKind = 'marketplace',
) => {
  if (kind === 'session') {
    return ORG_SESSION_FEES[normalizeOrgTier(tier)]
  }
  return ORG_MARKETPLACE_FEE
}

export const calculateOrgPlatformFee = ({
  amountCents,
  tier,
  kind,
}: {
  amountCents: number
  tier?: string | null
  kind: OrgPlatformFeeKind
}): OrgPlatformFeeBreakdown => {
  const grossCents = Math.max(0, Math.round(Number(amountCents) || 0))
  const normalizedTier = normalizeOrgTier(tier)
  const feeRate = getOrgPlatformFeeRate(normalizedTier, kind)
  const platformFeeCents = Math.round(grossCents * (feeRate / 100))
  return {
    grossCents,
    platformFeeCents,
    netCents: Math.max(0, grossCents - platformFeeCents),
    feeRate,
    tier: normalizedTier,
    kind,
  }
}

export const centsToDollars = (amountCents: number) => Math.round(amountCents) / 100
