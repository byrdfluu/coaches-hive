import stripe from '@/lib/stripeServer'
import {
  ALL_ACCESS_PRICING,
  getOrgCoachSeatPriceKeys,
  normalizeBillingInterval,
  resolveFirstConfiguredPrice,
} from '@/lib/allAccessPricing'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const BILLABLE_ROLES = new Set([
  'coach', 'assistant_coach', 'head_coach',
  'org_admin', 'club_admin', 'travel_admin', 'school_admin',
  'athletic_director', 'program_director', 'team_manager',
])

export type OrgCoachBillingSummary = {
  activeCoachCount: number
  includedCoachCount: number
  additionalCoachCount: number
  coachIds: string[]
  reasons: Record<string, string[]>
}

export type OrgCoachSeatChangePreview = {
  activeCoachCount: number
  includedCoachCount: number
  currentAdditionalCoachCount: number
  nextAdditionalCoachCount: number
  createsPaidSeat: boolean
  amountDueNow: number
  currency: string
  billingInterval: 'month' | 'year'
  recurringSeatAmount: number
  deltaCoachCount: 1 | -1
}

const getOrgSubscription = async (orgId: string) => {
  const { data, error } = await supabaseAdmin
    .from('platform_subscriptions')
    .select('id, stripe_subscription_id, stripe_coach_seat_item_id, billing_interval')
    .eq('owner_type', 'org')
    .eq('owner_id', orgId)
    .maybeSingle()
  if (error) throw error
  return data
}

const getSeatUpdate = async ({
  subscriptionId,
  seatItemId,
  interval,
  quantity,
}: {
  subscriptionId: string
  seatItemId?: string | null
  interval: 'month' | 'year'
  quantity: number
}) => {
  if (seatItemId) return { id: seatItemId, quantity }
  const { priceId, keysTried } = resolveFirstConfiguredPrice(getOrgCoachSeatPriceKeys(interval))
  if (!priceId) {
    throw new Error(`Missing Stripe coach-seat price. Configure ${keysTried.join(' or ')}.`)
  }
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const existingItem = subscription.items.data.find((item) => item.price.id === priceId)
  return existingItem
    ? { id: existingItem.id, quantity }
    : { price: priceId, quantity }
}

export const calculateActiveOrgCoachCount = async (orgId: string): Promise<OrgCoachBillingSummary> => {
  const { data: memberships, error } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id, role, status')
    .eq('org_id', orgId)
    .in('role', Array.from(BILLABLE_ROLES))

  if (error) throw error
  const active = (memberships || []).filter((row) => !row.status || row.status === 'active')
  const coachIds = Array.from(new Set(active.map((row) => String(row.user_id)).filter(Boolean)))
  const reasons = Object.fromEntries(coachIds.map((id) => [id, ['active_organization_membership']]))
  const includedCoachCount = Math.min(ALL_ACCESS_PRICING.org.includedCoaches, coachIds.length)
  return {
    activeCoachCount: coachIds.length,
    includedCoachCount,
    additionalCoachCount: Math.max(0, coachIds.length - ALL_ACCESS_PRICING.org.includedCoaches),
    coachIds,
    reasons,
  }
}

export const snapshotOrgCoachBilling = async (orgId: string, summary?: OrgCoachBillingSummary) => {
  const resolved = summary || await calculateActiveOrgCoachCount(orgId)
  const { data: subscription } = await supabaseAdmin
    .from('platform_subscriptions')
    .select('id')
    .eq('owner_type', 'org')
    .eq('owner_id', orgId)
    .maybeSingle()

  await supabaseAdmin.from('org_coach_billing_snapshots').insert({
    org_id: orgId,
    subscription_id: subscription?.id || null,
    active_coach_count: resolved.activeCoachCount,
    included_coach_count: resolved.includedCoachCount,
    additional_coach_count: resolved.additionalCoachCount,
    coach_ids: resolved.coachIds,
    reasons: resolved.reasons,
  })
  return resolved
}

export const syncOrgCoachSeatQuantity = async (orgId: string) => {
  const summary = await snapshotOrgCoachBilling(orgId)
  const subscription = await getOrgSubscription(orgId)

  if (subscription?.stripe_subscription_id && summary.additionalCoachCount > 0) {
    const interval = normalizeBillingInterval(subscription.billing_interval)
    const item = await getSeatUpdate({
      subscriptionId: subscription.stripe_subscription_id,
      seatItemId: subscription.stripe_coach_seat_item_id,
      interval,
      quantity: summary.additionalCoachCount,
    })
    const updated = await stripe.subscriptions.update(
      subscription.stripe_subscription_id,
      { items: [item], proration_behavior: 'create_prorations' },
      { idempotencyKey: `org_coach_seats:${orgId}:${summary.additionalCoachCount}` },
    )
    const seatPriceId = resolveFirstConfiguredPrice(getOrgCoachSeatPriceKeys(interval)).priceId
    const seatItem = updated.items.data.find((candidate) =>
      candidate.id === subscription.stripe_coach_seat_item_id || candidate.price.id === seatPriceId)
    if (seatItem && seatItem.id !== subscription.stripe_coach_seat_item_id) {
      await supabaseAdmin.from('platform_subscriptions')
        .update({ stripe_coach_seat_item_id: seatItem.id })
        .eq('id', subscription.id)
    }
  } else if (subscription?.stripe_coach_seat_item_id && subscription.stripe_subscription_id) {
    await stripe.subscriptionItems.del(subscription.stripe_coach_seat_item_id, {
      proration_behavior: 'create_prorations',
    })
    await supabaseAdmin.from('platform_subscriptions')
      .update({ stripe_coach_seat_item_id: null })
      .eq('id', subscription.id)
  }

  if (subscription?.id) {
    await supabaseAdmin.from('platform_subscriptions').update({
      included_coach_quantity: ALL_ACCESS_PRICING.org.includedCoaches,
      billable_coach_quantity: summary.additionalCoachCount,
      updated_at: new Date().toISOString(),
    }).eq('id', subscription.id)
  }
  return summary
}

export const previewOrgCoachSeatChange = async (
  orgId: string,
  action: 'invite' | 'remove',
  prorationDate = Math.floor(Date.now() / 1000),
): Promise<OrgCoachSeatChangePreview & { prorationDate: number }> => {
  const summary = await calculateActiveOrgCoachCount(orgId)
  const deltaCoachCount = action === 'invite' ? 1 : -1
  const nextActiveCoachCount = Math.max(0, summary.activeCoachCount + deltaCoachCount)
  const nextAdditionalCoachCount = Math.max(
    0,
    nextActiveCoachCount - ALL_ACCESS_PRICING.org.includedCoaches,
  )
  const createsPaidSeat = nextAdditionalCoachCount !== summary.additionalCoachCount
  const subscription = await getOrgSubscription(orgId)
  const billingInterval = normalizeBillingInterval(subscription?.billing_interval)
  const recurringSeatAmount = ALL_ACCESS_PRICING.org.additionalCoach[billingInterval]

  if (!createsPaidSeat) {
    return {
      activeCoachCount: summary.activeCoachCount,
      includedCoachCount: summary.includedCoachCount,
      currentAdditionalCoachCount: summary.additionalCoachCount,
      nextAdditionalCoachCount,
      createsPaidSeat,
      amountDueNow: 0,
      currency: 'usd',
      billingInterval,
      recurringSeatAmount,
      deltaCoachCount,
      prorationDate,
    }
  }
  if (!subscription?.stripe_subscription_id) {
    throw new Error('The organization needs an active Stripe subscription before adding a paid coach seat.')
  }

  const item = nextAdditionalCoachCount === 0 && subscription.stripe_coach_seat_item_id
    ? { id: subscription.stripe_coach_seat_item_id, deleted: true }
    : await getSeatUpdate({
        subscriptionId: subscription.stripe_subscription_id,
        seatItemId: subscription.stripe_coach_seat_item_id,
        interval: billingInterval,
        quantity: nextAdditionalCoachCount,
      })
  const invoice = await stripe.invoices.createPreview({
    subscription: subscription.stripe_subscription_id,
    subscription_details: {
      items: [item],
      proration_behavior: 'always_invoice',
      proration_date: prorationDate,
    },
  })
  const prorationLines = invoice.lines.data.filter((line) =>
    Boolean((line.parent as any)?.subscription_item_details?.proration))
  const prorationAmount = prorationLines.reduce((sum, line) => sum + line.amount, 0)
  const amountDueNow = action === 'invite'
    ? Math.max(0, prorationAmount)
    : Math.abs(Math.min(0, prorationAmount))

  return {
    activeCoachCount: summary.activeCoachCount,
    includedCoachCount: summary.includedCoachCount,
    currentAdditionalCoachCount: summary.additionalCoachCount,
    nextAdditionalCoachCount,
    createsPaidSeat,
    amountDueNow,
    currency: invoice.currency || 'usd',
    billingInterval,
    recurringSeatAmount,
    deltaCoachCount,
    prorationDate,
  }
}

export const previewOrgCoachSeatAddition = async (
  orgId: string,
  prorationDate = Math.floor(Date.now() / 1000),
) => previewOrgCoachSeatChange(orgId, 'invite', prorationDate)

export const purchaseOrgCoachSeatAddition = async ({
  orgId,
  inviteId,
  expectedAdditionalCoachCount,
  prorationDate,
}: {
  orgId: string
  inviteId: string
  expectedAdditionalCoachCount: number
  prorationDate: number
}) => {
  const preview = await previewOrgCoachSeatAddition(orgId, prorationDate)
  if (!preview.createsPaidSeat) return preview
  if (preview.nextAdditionalCoachCount !== expectedAdditionalCoachCount) {
    throw new Error('Coach seat count changed. Review the updated charge before approving.')
  }
  const subscription = await getOrgSubscription(orgId)
  if (!subscription?.stripe_subscription_id) throw new Error('Organization subscription not found.')
  const item = await getSeatUpdate({
    subscriptionId: subscription.stripe_subscription_id,
    seatItemId: subscription.stripe_coach_seat_item_id,
    interval: preview.billingInterval,
    quantity: preview.nextAdditionalCoachCount,
  })
  const updated = await stripe.subscriptions.update(
    subscription.stripe_subscription_id,
    {
      items: [item],
      payment_behavior: 'error_if_incomplete',
      proration_behavior: 'always_invoice',
      proration_date: prorationDate,
    },
    { idempotencyKey: `org_coach_approval:${inviteId}:${preview.nextAdditionalCoachCount}` },
  )
  const seatPriceId = resolveFirstConfiguredPrice(getOrgCoachSeatPriceKeys(preview.billingInterval)).priceId
  const seatItem = updated.items.data.find((candidate) =>
    candidate.id === subscription.stripe_coach_seat_item_id || candidate.price.id === seatPriceId)
  if (seatItem) {
    await supabaseAdmin.from('platform_subscriptions').update({
      stripe_coach_seat_item_id: seatItem.id,
      billable_coach_quantity: preview.nextAdditionalCoachCount,
      updated_at: new Date().toISOString(),
    }).eq('id', subscription.id)
  }
  return preview
}
