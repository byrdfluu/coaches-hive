import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import stripe from '@/lib/stripeServer'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileError, money } from '@/lib/mobilePaymentApi'
import { loadStripeConnectAccountStatus, isStripeConnectEnabled } from '@/lib/stripeConnectAccounts'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeRecurringFeePayer, isSuperadminUser, RECURRING_FEE_PLATFORM_PERCENT, RECURRING_FEE_SOURCE } from '@/lib/recurringFees'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.coacheshive.com'

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return mobileError('Unauthorized', 401)
  const body = await request.json().catch(() => ({}))
  const orgId = String(body.org_id || '').trim()
  const athleteId = String(body.athlete_id || '').trim()
  const amountCents = money(body.amount_cents)
  const interval = String(body.interval || '')
  const description = String(body.description || '').trim()
  const startDate = String(body.start_date || '')
  if (!orgId || !athleteId || amountCents < 50 || !description || !['month', 'year'].includes(interval)) {
    return mobileError('org_id, athlete_id, amount_cents, description, and a valid interval are required')
  }
  const start = new Date(`${startDate}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(start.getTime()) || start.getTime() < Date.now() - 86_400_000) {
    return mobileError('start_date must be a current or future ISO date')
  }
  const startsInFutureButBeforeStripeMinimum = start.getTime() > Date.now() + 60_000
    && start.getTime() <= Date.now() + 48 * 60 * 60 * 1000
  if (startsInFutureButBeforeStripeMinimum) {
    return mobileError('A future start_date must be at least 48 hours from now')
  }

  const superadmin = await isSuperadminUser(user)
  if (!superadmin) {
    const access = await authorizeRecurringFeePayer(user.id, athleteId, orgId)
    if (!access.ok) return mobileError(access.reason, 403)
  } else {
    const { data: membership } = await supabaseAdmin.from('athlete_organization_memberships').select('athlete_id')
      .eq('athlete_id', athleteId).eq('org_id', orgId).eq('status', 'active').maybeSingle()
    if (!membership) return mobileError('Athlete does not belong to this organization', 403)
  }

  const [{ data: settings }, connect, { data: workspace }, { data: profile }] = await Promise.all([
    supabaseAdmin.from('org_settings').select('org_name,plan_status').eq('org_id', orgId).maybeSingle(),
    loadStripeConnectAccountStatus('org', orgId, { refresh: true }).catch(() => null),
    supabaseAdmin.from('business_workspaces').select('id').eq('organization_id', orgId).eq('workspace_type', 'organization').maybeSingle(),
    supabaseAdmin.from('profiles').select('email,stripe_customer_id').eq('id', user.id).maybeSingle(),
  ])
  if (!settings || !['active', 'trialing'].includes(String(settings.plan_status || ''))) return mobileError('Organization cannot create recurring fees', 403)
  if (!isStripeConnectEnabled(connect)) return mobileError('Organization payouts are not ready', 409)

  let customerId = profile?.stripe_customer_id || null
  if (!customerId) {
    const customer = await stripe.customers.create({ email: profile?.email || user.email || undefined, metadata: { user_id: user.id } })
    customerId = customer.id
    const { error } = await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    if (error) return mobileError('Unable to save Stripe customer', 500)
  }

  const { data: fee, error: feeError } = await supabaseAdmin.from('organization_recurring_fees').insert({
    organization_id: orgId, workspace_id: workspace?.id || null, athlete_id: athleteId, payer_user_id: user.id,
    amount_cents: amountCents, currency: 'usd', interval, description, start_date: startDate,
    platform_fee_bps: 400, stripe_customer_id: customerId, stripe_connected_account_id: connect!.stripeAccountId,
    status: 'checkout_pending', created_by: user.id,
  }).select('id').single()
  if (feeError || !fee) return mobileError(feeError?.message || 'Unable to create recurring fee', 500)

  const metadata = {
    source: RECURRING_FEE_SOURCE, recurring_fee_id: fee.id, org_id: orgId, athlete_id: athleteId,
    payer_user_id: user.id, workspace_id: workspace?.id || '', platform_fee_bps: '400',
  }
  try {
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata,
      application_fee_percent: RECURRING_FEE_PLATFORM_PERCENT,
      transfer_data: { destination: connect!.stripeAccountId },
    }
    const startSeconds = Math.floor(start.getTime() / 1000)
    if (start.getTime() > Date.now() + 48 * 60 * 60 * 1000) subscriptionData.trial_end = startSeconds
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer: customerId, payment_method_types: ['card', 'us_bank_account'],
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: amountCents, recurring: { interval: interval as 'month' | 'year' }, product_data: { name: description, metadata: { org_id: orgId } } } }],
      metadata, subscription_data: subscriptionData,
      success_url: `${APP_URL}/mobile/payment-return?status=processing&fee_id=${fee.id}`,
      cancel_url: `${APP_URL}/mobile/payment-return?status=canceled&fee_id=${fee.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    }, { idempotencyKey: `recurring-fee:${fee.id}` })
    await supabaseAdmin.from('organization_recurring_fees').update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() }).eq('id', fee.id)
    return NextResponse.json({ checkout_url: session.url, expires_at: new Date(session.expires_at * 1000).toISOString() })
  } catch (error) {
    await supabaseAdmin.from('organization_recurring_fees').update({ status: 'checkout_failed', updated_at: new Date().toISOString() }).eq('id', fee.id)
    console.error('[recurring-fees/start] Stripe checkout failed', { fee_id: fee.id, error })
    return mobileError('Unable to start recurring fee checkout', 500)
  }
}
