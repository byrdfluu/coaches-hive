import { ORG_MARKETPLACE_FEE, ORG_SESSION_FEES } from '@/lib/orgPricing'
import { normalizeOrgTier, type OrgTier } from '@/lib/planRules'
import { getAdminConfig } from '@/lib/adminConfig'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type OrgPlatformFeeKind = 'session' | 'program' | 'org_fee' | 'marketplace'

export type OrgSessionVolumeTier = {
  minimumVolumeCents: number
  feePercent: number
}

export type FeeSettings = {
  stripeProcessingFeePercent: number
  stripeProcessingFeeFixedCents: number
  programPlatformFeePercent: number
  orgFeePlatformFeePercent: number
  marketplacePlatformFeePercent: number
  marketplacePlatformFeeCapCents: number
  orgSessionRollingVolumeWindowDays: number
  orgSessionRollingVolumeTiers: OrgSessionVolumeTier[]
}

export type OrgPlatformFeeBreakdown = {
  grossCents: number
  platformFeeCents: number
  stripeProcessingFeeCents: number
  netCents: number
  feeRate: number
  tier: OrgTier
  kind: OrgPlatformFeeKind
  rollingVolumeCents: number | null
  marketplaceFeeCapCents: number | null
}

export const DEFAULT_FEE_SETTINGS: FeeSettings = {
  stripeProcessingFeePercent: 2.9,
  stripeProcessingFeeFixedCents: 30,
  programPlatformFeePercent: ORG_SESSION_FEES.standard,
  orgFeePlatformFeePercent: 2.9,
  marketplacePlatformFeePercent: ORG_MARKETPLACE_FEE,
  marketplacePlatformFeeCapCents: 7500,
  orgSessionRollingVolumeWindowDays: 30,
  orgSessionRollingVolumeTiers: [
    { minimumVolumeCents: 0, feePercent: ORG_SESSION_FEES.standard },
    { minimumVolumeCents: 2_500_000, feePercent: 5 },
  ],
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

const toFiniteNumber = (value: unknown, fallback: number) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

export const normalizeFeeSettings = (settings?: Partial<FeeSettings> | null): FeeSettings => {
  const tiers = Array.isArray(settings?.orgSessionRollingVolumeTiers)
    ? settings!.orgSessionRollingVolumeTiers
        .map((tier) => ({
          minimumVolumeCents: Math.max(0, Math.round(toFiniteNumber(tier?.minimumVolumeCents, 0))),
          feePercent: Math.max(0, toFiniteNumber(tier?.feePercent, 0)),
        }))
        .filter((tier) => tier.feePercent > 0)
        .sort((a, b) => a.minimumVolumeCents - b.minimumVolumeCents)
    : []

  return {
    stripeProcessingFeePercent: toFiniteNumber(
      settings?.stripeProcessingFeePercent,
      DEFAULT_FEE_SETTINGS.stripeProcessingFeePercent,
    ),
    stripeProcessingFeeFixedCents: Math.max(0, Math.round(toFiniteNumber(
      settings?.stripeProcessingFeeFixedCents,
      DEFAULT_FEE_SETTINGS.stripeProcessingFeeFixedCents,
    ))),
    programPlatformFeePercent: Math.max(0, toFiniteNumber(
      settings?.programPlatformFeePercent,
      DEFAULT_FEE_SETTINGS.programPlatformFeePercent,
    )),
    orgFeePlatformFeePercent: Math.max(0, toFiniteNumber(
      settings?.orgFeePlatformFeePercent,
      DEFAULT_FEE_SETTINGS.orgFeePlatformFeePercent,
    )),
    marketplacePlatformFeePercent: toFiniteNumber(
      settings?.marketplacePlatformFeePercent,
      DEFAULT_FEE_SETTINGS.marketplacePlatformFeePercent,
    ),
    marketplacePlatformFeeCapCents: Math.max(0, Math.round(toFiniteNumber(
      settings?.marketplacePlatformFeeCapCents,
      DEFAULT_FEE_SETTINGS.marketplacePlatformFeeCapCents,
    ))),
    orgSessionRollingVolumeWindowDays: Math.max(1, Math.round(toFiniteNumber(
      settings?.orgSessionRollingVolumeWindowDays,
      DEFAULT_FEE_SETTINGS.orgSessionRollingVolumeWindowDays,
    ))),
    orgSessionRollingVolumeTiers: tiers.length ? tiers : DEFAULT_FEE_SETTINGS.orgSessionRollingVolumeTiers,
  }
}

export const getFeeSettings = async () => normalizeFeeSettings(await getAdminConfig<Partial<FeeSettings>>('fee_settings'))

export const calculateStripeProcessingFeeCents = (
  grossCents: number,
  settings: FeeSettings = DEFAULT_FEE_SETTINGS,
) => Math.max(0, Math.round(grossCents * (settings.stripeProcessingFeePercent / 100)) + settings.stripeProcessingFeeFixedCents)

export const getSessionFeeRateForRollingVolume = (
  rollingVolumeCents: number,
  settings: FeeSettings = DEFAULT_FEE_SETTINGS,
) => {
  const normalizedSettings = normalizeFeeSettings(settings)
  const volume = Math.max(0, Math.round(Number(rollingVolumeCents) || 0))
  return normalizedSettings.orgSessionRollingVolumeTiers.reduce((rate, tier) => (
    volume >= tier.minimumVolumeCents ? tier.feePercent : rate
  ), normalizedSettings.orgSessionRollingVolumeTiers[0]?.feePercent ?? ORG_SESSION_FEES.standard)
}

export const getOrgPlatformFeeRate = (
  tier?: string | null,
  kind: OrgPlatformFeeKind = 'marketplace',
) => {
  if (kind === 'session') {
    return ORG_SESSION_FEES[normalizeOrgTier(tier)]
  }
  if (kind === 'program') return DEFAULT_FEE_SETTINGS.programPlatformFeePercent
  if (kind === 'org_fee') return DEFAULT_FEE_SETTINGS.orgFeePlatformFeePercent
  return ORG_MARKETPLACE_FEE
}

export const calculateOrgPlatformFee = ({
  amountCents,
  tier,
  kind,
  rollingVolumeCents,
  settings,
}: {
  amountCents: number
  tier?: string | null
  kind: OrgPlatformFeeKind
  rollingVolumeCents?: number | null
  settings?: Partial<FeeSettings> | null
}): OrgPlatformFeeBreakdown => {
  const grossCents = Math.max(0, Math.round(Number(amountCents) || 0))
  const normalizedTier = normalizeOrgTier(tier)
  const normalizedSettings = normalizeFeeSettings(settings)
  const resolvedRollingVolumeCents = rollingVolumeCents === undefined || rollingVolumeCents === null
    ? null
    : Math.max(0, Math.round(Number(rollingVolumeCents) || 0))
  const feeRate = kind === 'session' && resolvedRollingVolumeCents !== null
    ? getSessionFeeRateForRollingVolume(resolvedRollingVolumeCents, normalizedSettings)
    : kind === 'session'
      ? getOrgPlatformFeeRate(normalizedTier, kind)
      : kind === 'program'
        ? normalizedSettings.programPlatformFeePercent
        : kind === 'org_fee'
          ? normalizedSettings.orgFeePlatformFeePercent
      : normalizedSettings.marketplacePlatformFeePercent
  // Organization dues only pass through the estimated Stripe processing cost.
  // This keeps the platform whole without adding a second material platform cut
  // on top of the organization's All Access subscription.
  const stripeProcessingFeeCents = calculateStripeProcessingFeeCents(grossCents, normalizedSettings)
  const uncappedPlatformFeeCents = kind === 'org_fee'
    ? stripeProcessingFeeCents
    : Math.round(grossCents * (feeRate / 100))
  const marketplaceFeeCapCents = kind === 'marketplace' ? normalizedSettings.marketplacePlatformFeeCapCents : null
  const platformFeeCents = marketplaceFeeCapCents === null
    ? uncappedPlatformFeeCents
    : Math.min(uncappedPlatformFeeCents, marketplaceFeeCapCents)
  return {
    grossCents,
    platformFeeCents,
    stripeProcessingFeeCents,
    netCents: Math.max(0, grossCents - platformFeeCents),
    feeRate,
    tier: normalizedTier,
    kind,
    rollingVolumeCents: resolvedRollingVolumeCents,
    marketplaceFeeCapCents,
  }
}

export const loadOrgRollingSessionVolumeCents = async (
  orgId: string,
  windowDays = DEFAULT_FEE_SETTINGS.orgSessionRollingVolumeWindowDays,
) => {
  const since = new Date(Date.now() - Math.max(1, windowDays) * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from('org_payments')
    .select('amount')
    .eq('org_id', orgId)
    .eq('status', 'paid')
    .gte('created_at', since)

  return (data || []).reduce((sum, row: { amount?: number | string | null }) => {
    const amount = Number(row.amount || 0)
    return sum + (Number.isFinite(amount) ? Math.round(amount * 100) : 0)
  }, 0)
}

export const calculateOrgPlatformFeeForOrg = async ({
  amountCents,
  orgId,
  tier,
  kind,
}: {
  amountCents: number
  orgId: string
  tier?: string | null
  kind: OrgPlatformFeeKind
}) => {
  const settings = await getFeeSettings()
  const rollingVolumeCents = kind === 'session'
    ? await loadOrgRollingSessionVolumeCents(orgId, settings.orgSessionRollingVolumeWindowDays)
    : null
  return calculateOrgPlatformFee({ amountCents, tier, kind, rollingVolumeCents, settings })
}

export const centsToDollars = (amountCents: number) => Math.round(amountCents) / 100
