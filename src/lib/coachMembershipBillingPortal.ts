import type Stripe from 'stripe'
import stripe from '@/lib/stripeServer'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'
import { assertStripeHostedUrl, auditPaymentAction, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { loadWorkspaceContext } from '@/lib/workspaceAuthority'
import { normalizeUuid } from '@/lib/uuid'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.coacheshive.com'
const MANAGEABLE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused'])

export class CoachMembershipPortalError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message)
  }
}

const objectId = (value: unknown) => typeof value === 'string'
  ? value
  : value && typeof value === 'object' && 'id' in value ? String((value as { id: unknown }).id) : null

async function retrieveSubscription(subscriptionId: string, connectedAccountId: string) {
  try {
    return { subscription: await stripe.subscriptions.retrieve(subscriptionId), stripeAccount: null as string | null }
  } catch (platformError) {
    try {
      return {
        subscription: await stripe.subscriptions.retrieve(subscriptionId, { stripeAccount: connectedAccountId }),
        stripeAccount: connectedAccountId,
      }
    } catch {
      throw platformError
    }
  }
}

export async function createCoachMembershipBillingPortal(input: {
  authenticatedUserId: string
  subscriptionId: string
  requestedWorkspaceId?: string | null
}) {
  const { data: membership, error } = await supabaseAdmin
    .from('coach_membership_subscriptions')
    .select('id,coach_id,athlete_id,athlete_profile_id,owner_user_id,stripe_customer_id,stripe_subscription_id,status')
    .eq('id', input.subscriptionId)
    .maybeSingle()

  if (error) throw new CoachMembershipPortalError('membership_lookup_failed', 'Unable to load this membership.', 500)
  if (!membership) throw new CoachMembershipPortalError('membership_not_found', 'Membership not found.', 404)

  const athleteId = membership.athlete_profile_id || membership.athlete_id
  const ownsMembership = membership.owner_user_id === input.authenticatedUserId
    || Boolean(athleteId && await userOwnsAthleteProfile(supabaseAdmin, input.authenticatedUserId, athleteId))
  if (!ownsMembership) throw new CoachMembershipPortalError('membership_forbidden', 'You cannot manage this membership.', 403)

  if (!MANAGEABLE_STATUSES.has(String(membership.status || '').toLowerCase())) {
    throw new CoachMembershipPortalError('membership_not_manageable', 'This membership is no longer available to manage.', 409)
  }
  if (!membership.stripe_customer_id || !membership.stripe_subscription_id) {
    throw new CoachMembershipPortalError('membership_billing_not_ready', 'Billing is not ready for this membership.', 409)
  }

  const requestedWorkspaceId = normalizeUuid(input.requestedWorkspaceId)
  if (requestedWorkspaceId) {
    const workspace = await loadWorkspaceContext(requestedWorkspaceId)
    if (!workspace || workspace.type !== 'independent_coach' || workspace.ownerUserId !== membership.coach_id) {
      throw new CoachMembershipPortalError('workspace_context_mismatch', 'The selected workspace does not match this membership.', 409)
    }
  }

  const connect = await loadStripeConnectAccountStatus('coach', membership.coach_id, { refresh: true })
  if (!isStripeConnectEnabled(connect)) {
    throw new CoachMembershipPortalError('seller_payment_setup_incomplete', 'This coach is still setting up payments. Please try again later.', 409)
  }

  if (!(await enforcePaymentRateLimit(input.authenticatedUserId, 'coach_membership_portal', 5, 60).catch(() => false))) {
    throw new CoachMembershipPortalError('rate_limited', 'Too many billing requests. Please try again shortly.', 429)
  }

  try {
    const located = await retrieveSubscription(membership.stripe_subscription_id, connect!.stripeAccountId)
    const stripeSubscription = located.subscription as Stripe.Subscription & { transfer_data?: { destination?: unknown } | null }
    if (objectId(stripeSubscription.customer) !== membership.stripe_customer_id) {
      throw new CoachMembershipPortalError('billing_record_mismatch', 'Billing is not ready for this membership.', 409)
    }

    // Platform-owned subscriptions must route proceeds to this exact coach. A
    // direct connected-account subscription is already isolated by account.
    if (!located.stripeAccount && objectId(stripeSubscription.transfer_data?.destination) !== connect!.stripeAccountId) {
      throw new CoachMembershipPortalError('billing_record_mismatch', 'Billing is not ready for this membership.', 409)
    }

    const configuration = process.env.STRIPE_COACH_MEMBERSHIP_PORTAL_CONFIGURATION_ID
    const session = await stripe.billingPortal.sessions.create({
      customer: membership.stripe_customer_id,
      ...(configuration ? { configuration } : {}),
      return_url: `${APP_URL}/open-app?from=coach-membership-billing&subscription_id=${membership.id}`,
    }, located.stripeAccount ? { stripeAccount: located.stripeAccount } : undefined)

    await auditPaymentAction({
      actorUserId: input.authenticatedUserId,
      action: 'coach_membership_billing_portal_created',
      targetType: 'coach_membership_subscription',
      targetId: membership.id,
      stripeObjectId: session.id,
      result: 'succeeded',
      metadata: { coach_id: membership.coach_id, stripe_account_id: connect!.stripeAccountId },
    })
    return { portal_url: assertStripeHostedUrl(session.url) }
  } catch (portalError) {
    if (portalError instanceof CoachMembershipPortalError) throw portalError
    safePaymentError('[memberships/billing-portal] Stripe portal failed', portalError, {
      membership_subscription_id: membership.id,
      coach_id: membership.coach_id,
    })
    throw new CoachMembershipPortalError('billing_portal_unavailable', 'Unable to open membership billing management.', 502)
  }
}
