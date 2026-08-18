import type Stripe from 'stripe'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type StripeConnectOwnerType = 'coach' | 'org'

export type StripeConnectAccountStatus = {
  ownerType: StripeConnectOwnerType
  ownerId: string
  stripeAccountId: string
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  requirementsDue: string[]
  disabledReason: string | null
  connectStatus: 'enabled' | 'restricted' | 'pending'
}

const isMissingTableError = (error: { code?: string | null; message?: string | null } | null | undefined) =>
  error?.code === '42P01' || /stripe_connect_accounts/i.test(String(error?.message || '')) && /does not exist/i.test(String(error?.message || ''))

export const mapStripeConnectStatus = (account: Stripe.Account): StripeConnectAccountStatus['connectStatus'] => {
  const due = account.requirements?.currently_due || []
  const disabledReason = account.requirements?.disabled_reason || null
  if (account.charges_enabled && account.payouts_enabled && account.details_submitted && due.length === 0 && !disabledReason) {
    return 'enabled'
  }
  if (account.charges_enabled || account.payouts_enabled || account.details_submitted) return 'restricted'
  return 'pending'
}

export const accountStatusFromStripe = (
  ownerType: StripeConnectOwnerType,
  ownerId: string,
  account: Stripe.Account,
): StripeConnectAccountStatus => ({
  ownerType,
  ownerId,
  stripeAccountId: account.id,
  chargesEnabled: Boolean(account.charges_enabled),
  payoutsEnabled: Boolean(account.payouts_enabled),
  detailsSubmitted: Boolean(account.details_submitted),
  requirementsDue: account.requirements?.currently_due || [],
  disabledReason: account.requirements?.disabled_reason || null,
  connectStatus: mapStripeConnectStatus(account),
})

export const isStripeConnectEnabled = (status: Pick<StripeConnectAccountStatus, 'connectStatus' | 'chargesEnabled' | 'payoutsEnabled' | 'detailsSubmitted'> | null | undefined) =>
  Boolean(status?.connectStatus === 'enabled' && status.chargesEnabled && status.payoutsEnabled && status.detailsSubmitted)

const syncLegacyStripeAccountId = async (ownerType: StripeConnectOwnerType, ownerId: string, stripeAccountId: string) => {
  if (ownerType === 'coach') {
    await supabaseAdmin.from('profiles').update({ stripe_account_id: stripeAccountId }).eq('id', ownerId)
    return
  }
  await supabaseAdmin
    .from('org_settings')
    .upsert({ org_id: ownerId, stripe_account_id: stripeAccountId }, { onConflict: 'org_id' })
}

export const upsertStripeConnectAccount = async (status: StripeConnectAccountStatus) => {
  const payload = {
    owner_type: status.ownerType,
    owner_id: status.ownerId,
    coach_id: status.ownerType === 'coach' ? status.ownerId : null,
    org_id: status.ownerType === 'org' ? status.ownerId : null,
    stripe_account_id: status.stripeAccountId,
    charges_enabled: status.chargesEnabled,
    payouts_enabled: status.payoutsEnabled,
    details_submitted: status.detailsSubmitted,
    requirements_due: status.requirementsDue,
    disabled_reason: status.disabledReason,
    connect_status: status.connectStatus,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabaseAdmin
    .from('stripe_connect_accounts')
    .upsert(payload, { onConflict: 'owner_type,owner_id' })
  if (error && !isMissingTableError(error)) throw error

  await syncLegacyStripeAccountId(status.ownerType, status.ownerId, status.stripeAccountId)
  return status
}

const loadStoredConnectAccount = async (ownerType: StripeConnectOwnerType, ownerId: string) => {
  const { data, error } = await supabaseAdmin
    .from('stripe_connect_accounts')
    .select('stripe_account_id, charges_enabled, payouts_enabled, details_submitted, requirements_due, disabled_reason, connect_status')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  if (!data?.stripe_account_id) return null

  return {
    ownerType,
    ownerId,
    stripeAccountId: data.stripe_account_id,
    chargesEnabled: Boolean(data.charges_enabled),
    payoutsEnabled: Boolean(data.payouts_enabled),
    detailsSubmitted: Boolean(data.details_submitted),
    requirementsDue: Array.isArray(data.requirements_due) ? data.requirements_due : [],
    disabledReason: data.disabled_reason || null,
    connectStatus: (data.connect_status || 'pending') as StripeConnectAccountStatus['connectStatus'],
  }
}

const loadLegacyStripeAccountId = async (ownerType: StripeConnectOwnerType, ownerId: string) => {
  if (ownerType === 'coach') {
    const { data } = await supabaseAdmin.from('profiles').select('stripe_account_id').eq('id', ownerId).maybeSingle()
    return data?.stripe_account_id || null
  }
  const { data } = await supabaseAdmin.from('org_settings').select('stripe_account_id').eq('org_id', ownerId).maybeSingle()
  return data?.stripe_account_id || null
}

export const loadStripeConnectAccountStatus = async (
  ownerType: StripeConnectOwnerType,
  ownerId: string,
  options: { refresh?: boolean } = {},
) => {
  const stored = await loadStoredConnectAccount(ownerType, ownerId)
  if (stored && !options.refresh) return stored

  const stripeAccountId = stored?.stripeAccountId || await loadLegacyStripeAccountId(ownerType, ownerId)
  if (!stripeAccountId) return null

  const account = await stripe.accounts.retrieve(stripeAccountId)
  return upsertStripeConnectAccount(accountStatusFromStripe(ownerType, ownerId, account))
}

export const createOrReuseStripeConnectAccount = async (
  ownerType: StripeConnectOwnerType,
  ownerId: string,
  metadata: Record<string, string>,
) => {
  const existing = await loadStripeConnectAccountStatus(ownerType, ownerId, { refresh: true }).catch(() => null)
  if (existing?.stripeAccountId) return existing

  const account = await stripe.accounts.create({
    type: 'express',
    metadata,
    settings: {
      payouts: {
        schedule: { interval: 'daily', delay_days: 2 },
      },
    },
  })
  return upsertStripeConnectAccount(accountStatusFromStripe(ownerType, ownerId, account))
}

export const syncStripeConnectAccountByStripeId = async (stripeAccountId: string, account?: Stripe.Account) => {
  const { data, error } = await supabaseAdmin
    .from('stripe_connect_accounts')
    .select('owner_type, owner_id')
    .eq('stripe_account_id', stripeAccountId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }
  if (!data?.owner_type || !data?.owner_id) return null

  const stripeAccount = account || await stripe.accounts.retrieve(stripeAccountId)
  return upsertStripeConnectAccount(accountStatusFromStripe(data.owner_type as StripeConnectOwnerType, data.owner_id, stripeAccount))
}
