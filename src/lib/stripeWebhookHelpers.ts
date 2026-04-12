import { resolveStripePriceTier } from '@/lib/stripeTierResolution'

export type StripeWebhookBillingRole = 'coach' | 'athlete' | 'org'

const ORG_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'org',
])

export const resolveStripeBillingRole = (
  value?: string | null,
): StripeWebhookBillingRole | null => {
  if (value === 'coach') return 'coach'
  if (value === 'athlete') return 'athlete'
  if (value && ORG_ROLES.has(value)) return 'org'
  return null
}

export const resolveStripeSubscriptionContext = ({
  metadata,
  priceId,
  priceMapping,
}: {
  metadata?: Record<string, string> | null
  priceId?: string | null
  priceMapping?: { role: StripeWebhookBillingRole; tier: string } | null
}) => {
  const resolvedPriceMapping = priceMapping ?? resolveStripePriceTier(priceId)
  return {
    billingRole:
      resolveStripeBillingRole(metadata?.billing_role || metadata?.role || null)
      || resolvedPriceMapping?.role
      || null,
    tier: resolvedPriceMapping?.tier || metadata?.tier || null,
  }
}

export const getOrderDisputeRefundStatus = (
  eventType: string,
  disputeStatus?: string | null,
) => {
  if (eventType !== 'charge.dispute.closed') return 'disputed'
  return disputeStatus === 'won' ? 'resolved' : 'chargeback'
}
