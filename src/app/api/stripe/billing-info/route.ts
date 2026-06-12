import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import {
  getOrgIdForUser,
  getStripeCustomerIdForUser,
  isBillingAccessActive,
  normalizeTierForBillingRole,
  resolveBillingRole,
  resolveDbBillingInfoForActor,
} from '@/lib/billingState'
import { getSessionRoleState } from '@/lib/sessionRoleState'
import { resolveTierForBillingRoleFromPriceId } from '@/lib/stripeTierResolution'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const findStripeSubscription = async ({
  customerId,
  billingRole,
  userId,
  orgId,
}: {
  customerId?: string | null
  billingRole: 'coach' | 'athlete' | 'org'
  userId: string
  orgId?: string | null
}) => {
  // Without a customer ID (coach/athlete) or org ID (org billing), there is no
  // meaningful filter to apply — listing all subscriptions is unsafe and wrong.
  if (billingRole !== 'org' && !customerId) return null
  if (billingRole === 'org' && !orgId) return null

  let startingAfter: string | undefined

  for (let page = 0; page < 20; page += 1) {
    const result = await stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      ...(customerId ? { customer: customerId } : {}),
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const subscription of result.data) {
      if (!isBillingAccessActive(subscription.status)) continue
      const metadata = (subscription.metadata || {}) as Record<string, string>
      const metadataRole = String(metadata.billing_role || metadata.role || '').toLowerCase()
      const metadataUserId = String(metadata.user_id || '')
      const metadataOrgId = String(metadata.org_id || '')

      if (billingRole === 'org') {
        if (metadataRole && metadataRole !== 'org' && metadataRole !== 'org_admin') continue
        if (orgId && metadataOrgId && metadataOrgId !== orgId) continue
        if (!orgId && metadataUserId && metadataUserId !== userId) continue
      } else {
        if (metadataRole && metadataRole !== billingRole) continue
        if (metadataUserId && metadataUserId !== userId) continue
      }

      return subscription
    }

    if (!result.has_more || result.data.length === 0) break
    startingAfter = result.data[result.data.length - 1]?.id
  }

  return null
}

const isMissingStripeCustomerError = (err: unknown) => {
  if (!err || typeof err !== 'object') return false
  const stripeError = err as {
    code?: string
    param?: string
    message?: string
    raw?: { code?: string; param?: string; message?: string }
  }
  const code = stripeError.code || stripeError.raw?.code
  const param = stripeError.param || stripeError.raw?.param
  const message = stripeError.message || stripeError.raw?.message || ''
  return code === 'resource_missing' && (param === 'customer' || message.includes('No such customer'))
}

export async function GET() {
  const { session, role, error } = await getSessionRole([
    'coach',
    'athlete',
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
    'admin',
    'superadmin',
  ])
  if (error || !session) return error

  const billingRole = resolveBillingRole(String(role || ''))
  if (!billingRole) {
    return jsonError('Unsupported role for billing info', 400)
  }
  const roleState = getSessionRoleState(session.user.user_metadata)

  try {
    const dbBilling = await resolveDbBillingInfoForActor({
      userId: session.user.id,
      billingRole,
      selectedTierHint: roleState.selectedTier,
    })

    const orgId = billingRole === 'org' ? await getOrgIdForUser(session.user.id) : null
    const customerId = billingRole === 'org'
      ? null
      : await getStripeCustomerIdForUser(session.user.id)

    let subscription = null
    try {
      subscription = await findStripeSubscription({
        customerId,
        billingRole,
        userId: session.user.id,
        orgId,
      })
    } catch (err: unknown) {
      if (!isMissingStripeCustomerError(err)) {
        throw err
      }
      console.warn('[billing-info] Saved Stripe customer was not found. Falling back to database billing state.', {
        userId: session.user.id,
        billingRole,
        customerId,
      })
    }

    if (!subscription) {
      return NextResponse.json(dbBilling)
    }

    const metadata = (subscription.metadata || {}) as Record<string, string>
    const priceId = subscription.items?.data?.[0]?.price?.id || null
    const subscriptionTiming = subscription as unknown as {
      current_period_end?: number | null
      trial_end?: number | null
    }
    return NextResponse.json({
      status: subscription.status || dbBilling.status,
      tier:
        dbBilling.tier
        || normalizeTierForBillingRole(billingRole, metadata.tier)
        || resolveTierForBillingRoleFromPriceId(billingRole, priceId),
      current_period_end: subscriptionTiming.current_period_end
        ? new Date(subscriptionTiming.current_period_end * 1000).toISOString()
        : dbBilling.current_period_end,
      trial_end: subscriptionTiming.trial_end
        ? new Date(subscriptionTiming.trial_end * 1000).toISOString()
        : dbBilling.trial_end,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    })
  } catch (err: unknown) {
    console.error('[billing-info]', err)
    const message = err instanceof Error ? err.message : 'Unable to fetch billing info'
    return jsonError(message, 500)
  }
}
