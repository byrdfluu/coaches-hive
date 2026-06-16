import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { FeeCategory, FeeTier, getFeePercentage, resolveProductCategory } from '@/lib/platformFees'
import { isSchoolOrg } from '@/lib/orgPricing'
import { calculateOrgPlatformFee, resolveOrgPlatformFeeKind } from '@/lib/orgPlatformFees'
export const dynamic = 'force-dynamic'

const resolveFeeCategory = (
  metadata: Record<string, any>,
  productType: string,
): FeeCategory => {
  const explicitCategory = String(metadata?.feeCategory || '').toLowerCase()
  if (explicitCategory === 'session') return 'session'
  if (explicitCategory === 'marketplace_digital') return 'marketplace_digital'
  if (explicitCategory === 'marketplace_physical') return 'marketplace_physical'

  const source = String(metadata?.source || '').toLowerCase()
  if (source.includes('session') || source.includes('booking')) return 'session'

  if (productType) return resolveProductCategory(productType)
  return 'session'
}


export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(['coach', 'athlete', 'admin'])
  if (error || !session) return error

  // Fetch athlete's Stripe customer ID so the card is saved for future use
  let stripeCustomerId: string | null = null
  if (role === 'athlete') {
    const { data: athleteProfile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', session.user.id)
      .maybeSingle()
    stripeCustomerId = athleteProfile?.stripe_customer_id || null
  }

  const body = await request.json().catch(() => ({}))
  const { amount, currency = 'usd', metadata = {} } = body || {}

  if (!amount || amount <= 0) {
    return jsonError('amount is required')
  }

  try {
    const normalizedAmount = Math.round(amount)

    if (normalizedAmount <= 0) {
      return jsonError('Amount must be at least $0.01.', 400)
    }

    if (normalizedAmount > 5_000_000) {
      return jsonError('Amount exceeds the maximum allowed ($50,000).', 400)
    }
    const productId = metadata?.productId
    const coachId = metadata?.coachId
    const orgId = metadata?.orgId

    let productType = ''
    let productOrgId = ''
    if (productId) {
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('type, category, org_id')
        .eq('id', productId)
        .maybeSingle()
      productType = product?.type || product?.category || ''
      productOrgId = product?.org_id || ''
    }

    const resolvedOrgId = orgId || productOrgId
    const source = String(metadata?.source || '').toLowerCase()


    if (resolvedOrgId) {
      // Check org_type — school orgs sponsor sessions; no Stripe PI needed.
      const { data: orgRow } = await supabaseAdmin
        .from('organizations')
        .select('org_type')
        .eq('id', resolvedOrgId)
        .maybeSingle()

      if (isSchoolOrg(orgRow?.org_type)) {
        return NextResponse.json({ clientSecret: null, free: true })
      }

      const { data: orgSettings, error: orgError } = await supabaseAdmin
        .from('org_settings')
        .select('stripe_account_id, plan')
        .eq('org_id', resolvedOrgId)
        .maybeSingle()

      if (orgError) {
        return jsonError('Unable to load org payout account', 500)
      }

      if (!orgSettings?.stripe_account_id) {
        return jsonError('Organization must connect Stripe before accepting payments.', 400)
      }

      const feeKind = resolveOrgPlatformFeeKind(source, metadata?.feeCategory)
      const feeBreakdown = calculateOrgPlatformFee({
        amountCents: normalizedAmount,
        tier: orgSettings?.plan,
        kind: feeKind,
      })

      const paymentIntent = await stripe.paymentIntents.create({
        amount: normalizedAmount,
        currency,
        payment_method_types: ['card'],
        application_fee_amount: feeBreakdown.platformFeeCents,
        transfer_data: {
          destination: orgSettings.stripe_account_id,
        },
        ...(stripeCustomerId ? { customer: stripeCustomerId, setup_future_usage: 'on_session' as const } : {}),
        metadata: {
          ...metadata,
          feeCategory:
            feeKind === 'session'
              ? 'session'
              : metadata?.feeCategory || 'marketplace_digital',
          platformFeeCents: String(feeBreakdown.platformFeeCents),
          platformFeeRate: String(feeBreakdown.feeRate),
          netAmountCents: String(feeBreakdown.netCents),
          orgTier: feeBreakdown.tier,
        },
      })

      return NextResponse.json({ clientSecret: paymentIntent.client_secret })
    }

    if (!coachId) {
      return jsonError('coachId is required', 400)
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', coachId)
      .maybeSingle()

    if (profileError) {
      return jsonError('Unable to load coach payout account', 500)
    }

    if (!profile?.stripe_account_id) {
      return jsonError('Coach must connect Stripe before accepting payments.', 400)
    }

    const { data: planRow } = await supabaseAdmin
      .from('coach_plans')
      .select('tier')
      .eq('coach_id', coachId)
      .maybeSingle()

    const { data: feeRuleRows } = await supabaseAdmin
      .from('platform_fee_rules')
      .select('tier, category, percentage')
      .eq('active', true)

    const tier = (planRow?.tier as FeeTier) || 'starter'
    const category = resolveFeeCategory(metadata, productType)
    const percent = getFeePercentage(tier, category, feeRuleRows || [])
    const applicationFee = Math.round(normalizedAmount * (percent / 100))

    const paymentIntent = await stripe.paymentIntents.create({
      amount: normalizedAmount,
      currency,
      payment_method_types: ['card'],
      application_fee_amount: applicationFee,
      transfer_data: {
        destination: profile.stripe_account_id,
      },
      ...(stripeCustomerId ? { customer: stripeCustomerId, setup_future_usage: 'on_session' as const } : {}),
      metadata: {
        ...metadata,
        feeCategory: metadata?.feeCategory || category,
      },
    })

    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (error: any) {
    return jsonError(error?.message || 'Unable to create payment intent', 500)
  }
}
