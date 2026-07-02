import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'
import { claimMobileHandoff, consumeMobileHandoff, releaseMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import { verifyMobileCheckoutToken } from '@/lib/mobileCheckoutToken'
import { calculateOrgPlatformFeeForOrg } from '@/lib/orgPlatformFees'
import { resolveBaseUrl } from '@/lib/siteUrl'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const token = String(body?.token || '')
  let claims
  try {
    claims = verifyMobileCheckoutToken(token)
  } catch (error: any) {
    return jsonError(error?.message || 'Invalid checkout token', 401)
  }
  if (claims.type !== 'fee' || !claims.resourceId) return jsonError('Invalid fee checkout token', 400)

  try {
    const handoff = await claimMobileHandoff(claims)
    if (handoff.status === 'consumed' && handoff.checkout_url) {
      return NextResponse.json({ url: handoff.checkout_url })
    }

    const { data: assignment } = await supabaseAdmin.from('org_fee_assignments').select('*').eq('id', claims.resourceId).maybeSingle()
    if (!assignment) throw new Error('Fee assignment not found')
    if (!(await userOwnsAthleteProfile(supabaseAdmin, claims.userId, assignment.athlete_id))) throw new Error('Forbidden')
    if (String(assignment.status || '').toLowerCase() === 'paid') throw new Error('Fee is already paid')

    const { data: fee } = await supabaseAdmin.from('org_fees').select('*').eq('id', assignment.fee_id).maybeSingle()
    if (!fee?.org_id) throw new Error('Fee configuration not found')
    const amountCents = Math.round(Number(assignment.amount ?? (fee.amount_cents ? Number(fee.amount_cents) / 100 : fee.amount) ?? 0) * 100)
    if (amountCents <= 0) throw new Error('Fee amount is invalid')

    const [{ data: orgSettings }, connectStatus] = await Promise.all([
      supabaseAdmin.from('org_settings').select('plan').eq('org_id', fee.org_id).maybeSingle(),
      loadStripeConnectAccountStatus('org', fee.org_id),
    ])
    if (!isStripeConnectEnabled(connectStatus)) throw new Error('Organization must finish Stripe Connect onboarding before accepting payments')
    const feeBreakdown = await calculateOrgPlatformFeeForOrg({
      amountCents,
      orgId: fee.org_id,
      tier: orgSettings?.plan,
      kind: 'session',
    })
    const { data: profile } = await supabaseAdmin.from('profiles').select('email, stripe_customer_id').eq('id', claims.userId).maybeSingle()
    const baseUrl = resolveBaseUrl()
    const returnQuery = `token=${encodeURIComponent(token)}&type=fee`
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price_data: { currency: 'usd', unit_amount: amountCents, product_data: { name: fee.title || fee.name || 'Organization fee' } }, quantity: 1 }],
      success_url: `${baseUrl}/payment/complete?${returnQuery}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment/complete?${returnQuery}&canceled=1`,
      client_reference_id: claims.userId,
      ...(profile?.stripe_customer_id ? { customer: profile.stripe_customer_id } : { customer_email: profile?.email || undefined }),
      payment_intent_data: {
        application_fee_amount: feeBreakdown.platformFeeCents,
        transfer_data: { destination: connectStatus!.stripeAccountId },
        metadata: {
          checkout_type: 'org_fee',
          assignment_id: assignment.id,
          handoff_nonce: claims.nonce,
          platformFeeCents: String(feeBreakdown.platformFeeCents),
          platformFeeRate: String(feeBreakdown.feeRate),
          stripeProcessingFeeCents: String(feeBreakdown.stripeProcessingFeeCents),
          netAmountCents: String(feeBreakdown.netCents),
          rollingVolumeCents: String(feeBreakdown.rollingVolumeCents ?? 0),
        },
      },
      metadata: {
        checkout_type: 'org_fee',
        assignment_id: assignment.id,
        athlete_profile_id: assignment.athlete_id,
        payer_user_id: claims.userId,
        org_id: fee.org_id,
        handoff_nonce: claims.nonce,
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    }, { idempotencyKey: `mobile_fee_checkout:${claims.nonce}` })
    await consumeMobileHandoff(claims.nonce, session.id, session.url)
    return NextResponse.json({
      url: session.url,
      fee_breakdown: {
        gross_cents: feeBreakdown.grossCents,
        platform_fee_cents: feeBreakdown.platformFeeCents,
        stripe_processing_fee_cents: feeBreakdown.stripeProcessingFeeCents,
        net_cents: feeBreakdown.netCents,
        fee_rate: feeBreakdown.feeRate,
        kind: feeBreakdown.kind,
      },
    })
  } catch (error: any) {
    await releaseMobileHandoff(claims.nonce, error?.message || 'Fee checkout failed')
    const status = error?.message === 'Forbidden' ? 403 : 400
    return jsonError(error?.message || 'Unable to start fee checkout', status)
  }
}
