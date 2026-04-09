import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgTier } from '@/lib/planRules'
import { resolveTierForBillingRoleFromPriceId } from '@/lib/stripeTierResolution'

export const ORG_BILLING_ROLE_SET = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

export type BillingRole = 'coach' | 'athlete' | 'org'

export type BillingInfoSnapshot = {
  status: string | null
  tier: string | null
  current_period_end: string | null
  trial_end: string | null
  cancel_at_period_end: boolean
}

const CANCELABLE_SUBSCRIPTION_STATUSES = new Set([
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
])

const isCancelableStatus = (status?: string | null) =>
  Boolean(status && CANCELABLE_SUBSCRIPTION_STATUSES.has(String(status).toLowerCase()))

export const isBillingAccessActive = (status?: string | null) => {
  const normalized = String(status || '').toLowerCase()
  return normalized === 'active' || normalized === 'trialing' || normalized === 'past_due'
}

const metadataRoleMatches = ({
  billingRole,
  metadata,
}: {
  billingRole: BillingRole
  metadata: Record<string, string>
}) => {
  const mdBillingRole = String(metadata.billing_role || '').toLowerCase()
  const mdRole = String(metadata.role || '').toLowerCase()
  if (!mdBillingRole && !mdRole) return true
  if (billingRole === 'org') {
    return mdBillingRole === 'org' || ORG_BILLING_ROLE_SET.has(mdRole)
  }
  return mdBillingRole === billingRole || mdRole === billingRole
}

const collectSubscriptionsByCustomer = async ({
  customerId,
  billingRole,
  userId,
  orgId,
}: {
  customerId: string
  billingRole: BillingRole
  userId: string
  orgId?: string | null
}) => {
  const matches = new Map<string, { id: string; status?: string | null }>()
  let startingAfter: string | undefined

  for (let page = 0; page < 20; page += 1) {
    const result = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const subscription of result.data) {
      if (!isCancelableStatus(subscription.status)) continue
      const metadata = (subscription.metadata || {}) as Record<string, string>
      if (!metadataRoleMatches({ billingRole, metadata })) continue

      const metadataUserId = String(metadata.user_id || '')
      const metadataOrgId = String(metadata.org_id || '')

      if (billingRole !== 'org' && metadataUserId && metadataUserId !== userId) continue
      if (billingRole === 'org' && orgId && metadataOrgId && metadataOrgId !== orgId) continue

      matches.set(subscription.id, { id: subscription.id, status: subscription.status || null })
    }

    if (!result.has_more || result.data.length === 0) break
    startingAfter = result.data[result.data.length - 1]?.id
  }

  return matches
}

const collectSubscriptionsByMetadata = async ({
  billingRole,
  userId,
  orgId,
}: {
  billingRole: BillingRole
  userId: string
  orgId?: string | null
}) => {
  const matches = new Map<string, { id: string; status?: string | null }>()
  let startingAfter: string | undefined

  for (let page = 0; page < 20; page += 1) {
    const result = await stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const subscription of result.data) {
      if (!isCancelableStatus(subscription.status)) continue
      const metadata = (subscription.metadata || {}) as Record<string, string>
      if (!metadataRoleMatches({ billingRole, metadata })) continue

      const metadataUserId = String(metadata.user_id || '')
      const metadataOrgId = String(metadata.org_id || '')
      if (billingRole === 'org') {
        if (orgId && metadataOrgId !== orgId) continue
        if (!orgId && metadataUserId && metadataUserId !== userId) continue
      } else if (metadataUserId !== userId) {
        continue
      }

      matches.set(subscription.id, { id: subscription.id, status: subscription.status || null })
    }

    if (!result.has_more || result.data.length === 0) break
    startingAfter = result.data[result.data.length - 1]?.id
  }

  return matches
}

export const resolveBillingRole = (role?: string | null): BillingRole | null => {
  if (role === 'coach') return 'coach'
  if (role === 'athlete') return 'athlete'
  if (role && ORG_BILLING_ROLE_SET.has(role)) return 'org'
  return null
}

export const getOrgIdForUser = async (userId: string, currentOrgIdHint?: string | null) => {
  if (currentOrgIdHint) {
    const { data: hintedMembership, error: hintedError } = await supabaseAdmin
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .eq('org_id', currentOrgIdHint)
      .limit(1)
      .maybeSingle()

    if (hintedError) throw new Error(hintedError.message)
    if (hintedMembership?.org_id) return hintedMembership.org_id
  }

  const { data, error } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.org_id || null
}

export const getStripeCustomerIdForUser = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.stripe_customer_id || null
}

const normalizeTierForBillingRole = (billingRole: BillingRole, tier?: string | null) => {
  const normalizedTier = String(tier || '').trim().toLowerCase()
  if (!normalizedTier) return null

  if (billingRole === 'coach') {
    if (normalizedTier === 'starter' || normalizedTier === 'pro' || normalizedTier === 'elite') {
      return normalizeCoachTier(normalizedTier)
    }
    return null
  }

  if (billingRole === 'athlete') {
    if (normalizedTier === 'explore' || normalizedTier === 'train' || normalizedTier === 'family') {
      return normalizeAthleteTier(normalizedTier)
    }
    return null
  }

  if (normalizedTier === 'standard' || normalizedTier === 'growth' || normalizedTier === 'enterprise') {
    return normalizeOrgTier(normalizedTier)
  }
  return null
}

const resolveSubscriptionTier = ({
  billingRole,
  savedTier,
  metadataTier,
  priceId,
}: {
  billingRole: BillingRole
  savedTier?: string | null
  metadataTier?: string | null
  priceId?: string | null
}) => {
  return (
    normalizeTierForBillingRole(billingRole, savedTier)
    || normalizeTierForBillingRole(billingRole, metadataTier)
    || resolveTierForBillingRoleFromPriceId(billingRole, priceId)
  )
}

const findPrimarySubscriptionByCustomer = async ({
  customerId,
  billingRole,
  userId,
  orgId,
}: {
  customerId: string
  billingRole: BillingRole
  userId: string
  orgId?: string | null
}) => {
  let startingAfter: string | undefined

  for (let page = 0; page < 20; page += 1) {
    const result = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const subscription of result.data) {
      if (!isBillingAccessActive(subscription.status)) continue
      const metadata = (subscription.metadata || {}) as Record<string, string>
      if (!metadataRoleMatches({ billingRole, metadata })) continue

      const metadataUserId = String(metadata.user_id || '')
      const metadataOrgId = String(metadata.org_id || '')

      if (billingRole !== 'org' && metadataUserId && metadataUserId !== userId) continue
      if (billingRole === 'org' && orgId && metadataOrgId && metadataOrgId !== orgId) continue

      return subscription
    }

    if (!result.has_more || result.data.length === 0) break
    startingAfter = result.data[result.data.length - 1]?.id
  }

  return null
}

const findPrimarySubscriptionByMetadata = async ({
  billingRole,
  userId,
  orgId,
}: {
  billingRole: BillingRole
  userId: string
  orgId?: string | null
}) => {
  let startingAfter: string | undefined

  for (let page = 0; page < 20; page += 1) {
    const result = await stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const subscription of result.data) {
      if (!isBillingAccessActive(subscription.status)) continue
      const metadata = (subscription.metadata || {}) as Record<string, string>
      if (!metadataRoleMatches({ billingRole, metadata })) continue

      const metadataUserId = String(metadata.user_id || '')
      const metadataOrgId = String(metadata.org_id || '')
      if (billingRole === 'org') {
        if (orgId && metadataOrgId !== orgId) continue
        if (!orgId && metadataUserId && metadataUserId !== userId) continue
      } else if (metadataUserId && metadataUserId !== userId) {
        continue
      }

      return subscription
    }

    if (!result.has_more || result.data.length === 0) break
    startingAfter = result.data[result.data.length - 1]?.id
  }

  return null
}

const toBillingSnapshot = ({
  status,
  tier,
  currentPeriodEnd,
  trialEnd,
  cancelAtPeriodEnd,
}: {
  status?: string | null
  tier?: string | null
  currentPeriodEnd?: number | null
  trialEnd?: number | null
  cancelAtPeriodEnd?: boolean | null
}): BillingInfoSnapshot => ({
  status: status || null,
  tier: tier || null,
  current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
  trial_end: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
  cancel_at_period_end: Boolean(cancelAtPeriodEnd),
})

export const resolveBillingInfoForActor = async ({
  userId,
  billingRole,
  orgIdHint,
}: {
  userId: string
  billingRole: BillingRole
  orgIdHint?: string | null
}): Promise<BillingInfoSnapshot> => {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id, subscription_status')
    .eq('id', userId)
    .maybeSingle()

  let savedTier: string | null = null
  let orgId: string | null = null

  if (billingRole === 'coach') {
    const { data: coachPlan } = await supabaseAdmin
      .from('coach_plans')
      .select('tier')
      .eq('coach_id', userId)
      .maybeSingle()
    savedTier = normalizeTierForBillingRole(billingRole, coachPlan?.tier)
  } else if (billingRole === 'athlete') {
    const { data: athletePlan } = await supabaseAdmin
      .from('athlete_plans')
      .select('tier')
      .eq('athlete_id', userId)
      .maybeSingle()
    savedTier = normalizeTierForBillingRole(billingRole, athletePlan?.tier)
  } else {
    orgId = await getOrgIdForUser(userId, orgIdHint)
    if (!orgId) {
      return toBillingSnapshot({})
    }

    const { data: orgSettings } = await supabaseAdmin
      .from('org_settings')
      .select('plan, plan_status')
      .eq('org_id', orgId)
      .maybeSingle()
    savedTier = normalizeTierForBillingRole(billingRole, orgSettings?.plan)

    const customerSubscription = profile?.stripe_customer_id
      ? await findPrimarySubscriptionByCustomer({
          customerId: profile.stripe_customer_id,
          billingRole,
          userId,
          orgId,
        })
      : null
    const metadataSubscription = customerSubscription
      ? null
      : await findPrimarySubscriptionByMetadata({
          billingRole,
          userId,
          orgId,
        })
    const subscription = customerSubscription || metadataSubscription

    if (!subscription) {
      return toBillingSnapshot({
        status: String(orgSettings?.plan_status || '').trim() || null,
        tier: savedTier,
      })
    }

    const metadata = (subscription.metadata || {}) as Record<string, string>
    const priceId = subscription.items?.data?.[0]?.price?.id || null
    return toBillingSnapshot({
      status: subscription.status || String(orgSettings?.plan_status || '').trim() || null,
      tier: resolveSubscriptionTier({
        billingRole,
        savedTier,
        metadataTier: metadata.tier,
        priceId,
      }),
      currentPeriodEnd: (subscription as { current_period_end?: number | null }).current_period_end,
      trialEnd: (subscription as { trial_end?: number | null }).trial_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    })
  }

  const customerSubscription = profile?.stripe_customer_id
    ? await findPrimarySubscriptionByCustomer({
        customerId: profile.stripe_customer_id,
        billingRole,
        userId,
      })
    : null
  const metadataSubscription = customerSubscription
    ? null
    : await findPrimarySubscriptionByMetadata({
        billingRole,
        userId,
      })
  const subscription = customerSubscription || metadataSubscription

  if (!subscription) {
    return toBillingSnapshot({
      status: String(profile?.subscription_status || '').trim() || null,
      tier: savedTier,
    })
  }

  const metadata = (subscription.metadata || {}) as Record<string, string>
  const priceId = subscription.items?.data?.[0]?.price?.id || null
  return toBillingSnapshot({
    status: subscription.status || String(profile?.subscription_status || '').trim() || null,
    tier: resolveSubscriptionTier({
      billingRole,
      savedTier,
      metadataTier: metadata.tier,
      priceId,
    }),
    currentPeriodEnd: (subscription as { current_period_end?: number | null }).current_period_end,
    trialEnd: (subscription as { trial_end?: number | null }).trial_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  })
}

export const cancelStripeSubscriptionsForActor = async ({
  userId,
  billingRole,
  orgId,
  customerId,
  atPeriodEnd = false,
}: {
  userId: string
  billingRole: BillingRole
  orgId?: string | null
  customerId?: string | null
  atPeriodEnd?: boolean
}) => {
  const candidateSubscriptions = customerId
    ? await collectSubscriptionsByCustomer({
      customerId,
      billingRole,
      userId,
      orgId,
    })
    : new Map<string, { id: string; status?: string | null }>()

  if (candidateSubscriptions.size === 0) {
    const fromMetadata = await collectSubscriptionsByMetadata({
      billingRole,
      userId,
      orgId,
    })
    fromMetadata.forEach((value, key) => candidateSubscriptions.set(key, value))
  }

  const affectedIds: string[] = []
  let latestCurrentPeriodEnd: string | null = null
  let latestStatus: string | null = null

  for (const subscription of Array.from(candidateSubscriptions.values())) {
    if (atPeriodEnd) {
      const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
      })
      affectedIds.push(updatedSubscription.id)
      latestStatus = updatedSubscription.status || latestStatus
      const updatedCurrentPeriodEnd = (updatedSubscription as { current_period_end?: number | null }).current_period_end
      if (updatedCurrentPeriodEnd) {
        const currentPeriodEndIso = new Date(updatedCurrentPeriodEnd * 1000).toISOString()
        if (!latestCurrentPeriodEnd || currentPeriodEndIso > latestCurrentPeriodEnd) {
          latestCurrentPeriodEnd = currentPeriodEndIso
        }
      }
      continue
    }

    const canceledSubscription = await stripe.subscriptions.cancel(subscription.id)
    affectedIds.push(canceledSubscription.id)
    latestStatus = canceledSubscription.status || latestStatus
  }

  return {
    affectedIds,
    affectedCount: affectedIds.length,
    currentPeriodEnd: latestCurrentPeriodEnd,
    status: latestStatus,
    cancelAtPeriodEnd: atPeriodEnd && affectedIds.length > 0,
  }
}

export const markSubscriptionCancellationScheduled = async ({
  userId,
  metadata,
  subscriptionStatus,
  currentPeriodEnd,
}: {
  userId: string
  metadata?: Record<string, unknown>
  subscriptionStatus?: string | null
  currentPeriodEnd?: string | null
}) => {
  const nowIso = new Date().toISOString()

  if (subscriptionStatus) {
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ subscription_status: subscriptionStatus })
      .eq('id', userId)
    if (profileError) throw new Error(profileError.message)
  }

  const { error: userUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...(metadata || {}),
      ...(subscriptionStatus ? { subscription_status: subscriptionStatus } : {}),
      cancel_at_period_end: true,
      ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
      lifecycle_updated_at: nowIso,
    },
  })
  if (userUpdateError) throw new Error(userUpdateError.message)
}
