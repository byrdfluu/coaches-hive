import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'
import { assertStripeHostedUrl, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, retryable: status === 429 || status >= 500 } }, { status })

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return fail('unauthorized', 'Authentication is required.', 401)
  const body = await request.json().catch(() => ({}))
  const purchaseId = String(body.purchase_id || body.subscription_id || '').trim()
  if (!purchaseId) return fail('purchase_id_required', 'purchase_id is required.', 422)
  const { data: purchase, error } = await supabaseAdmin.from('org_training_package_purchases')
    .select('id,athlete_id,purchaser_user_id,status,stripe_subscription_id,org_training_packages(billing_type)')
    .eq('id', purchaseId).maybeSingle()
  if (error) return fail('billing_portal_unavailable', 'Unable to load this training plan.', 503)
  if (!purchase) return fail('training_plan_unavailable', 'This training plan is unavailable.', 404)
  if (purchase.purchaser_user_id !== user.id && !(await userOwnsAthleteProfile(supabaseAdmin, user.id, purchase.athlete_id))) {
    return fail('forbidden', 'This training plan is unavailable.', 403)
  }
  const pkg = Array.isArray(purchase.org_training_packages) ? purchase.org_training_packages[0] : purchase.org_training_packages
  if (pkg?.billing_type !== 'recurring' || !purchase.stripe_subscription_id || !['active','past_due'].includes(String(purchase.status))) {
    return fail('training_plan_not_manageable', 'This recurring training plan cannot be managed yet.', 409)
  }
  const subscription = await stripe.subscriptions.retrieve(purchase.stripe_subscription_id).catch(() => null)
  const customerId = typeof subscription?.customer === 'string' ? subscription.customer : subscription?.customer?.id || null
  if (!customerId) return fail('billing_account_unavailable', 'The billing account is unavailable.', 409)
  if (!(await enforcePaymentRateLimit(user.id, 'training_package_portal', 5, 60).catch(() => false))) {
    return fail('rate_limited', 'Too many requests. Please try again shortly.', 429)
  }
  const configuration = process.env.STRIPE_TRAINING_PACKAGE_PORTAL_CONFIGURATION_ID
    || process.env.STRIPE_RECURRING_FEES_PORTAL_CONFIGURATION_ID
    || process.env.STRIPE_COACH_MEMBERSHIP_PORTAL_CONFIGURATION_ID
  if (!configuration && process.env.NODE_ENV === 'production') return fail('billing_portal_not_configured', 'Billing management is unavailable.', 503)
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      ...(configuration ? { configuration } : {}),
      return_url: 'coacheshive://billing-updated',
    })
    return NextResponse.json({ portal_url: assertStripeHostedUrl(session.url) })
  } catch (portalError) {
    safePaymentError('[training-packages/billing-portal] failed', portalError, { purchase_id: purchase.id })
    return fail('billing_portal_unavailable', 'Unable to open billing management.', 502)
  }
}
