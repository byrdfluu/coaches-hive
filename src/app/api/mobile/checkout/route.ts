import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'
import { createMobileCheckoutToken } from '@/lib/mobileCheckoutToken'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { FeeTier, calculateMarketplacePlatformFeeCents, getFeePercentage } from '@/lib/platformFees'
import { calculateOrgPlatformFeeForOrg, calculateStripeProcessingFeeCents, getFeeSettings } from '@/lib/orgPlatformFees'
import { resolveBaseUrl } from '@/lib/siteUrl'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireWorkspaceContext } from '@/lib/workspaceAuthority'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => null)
  const type = String(body?.type || '').trim()
  const recordId = String(body?.record_id || '').trim()
  const workspace = await requireWorkspaceContext(user.id, body?.workspace_id)
  if (!workspace) return jsonError('Active workspace access required', 403)
  if (type === 'marketplace') return createMarketplaceCheckout(user.id, recordId, workspace)
  if (type === 'program') return createProgramCheckout(user.id, recordId, workspace)
  if (type === 'fee') return createOrgFeeCheckout(user.id, recordId, workspace)
  if (type !== 'coach_fee') return jsonError('Unsupported checkout type')
  if (!recordId) return jsonError('record_id is required')

  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .from('coach_fee_assignments')
    .select('id, coach_id, athlete_id, name, amount, status, stripe_checkout_session_id, workspace_id')
    .eq('id', recordId)
    .maybeSingle()
  if (assignmentError) return jsonError('Unable to load coach fee', 500)
  if (!assignment) return jsonError('Coach fee not found', 404)
  if (assignment.workspace_id !== workspace.id) return jsonError('Coach fee belongs to a different workspace', 403)
  if (workspace.type === 'independent_coach' && workspace.ownerUserId !== assignment.coach_id) {
    return jsonError('Independent coach workspace ownership mismatch', 403)
  }
  if (workspace.type === 'organization' && !workspace.organizationId) return jsonError('Organization workspace is invalid', 403)
  if (!(await userOwnsAthleteProfile(supabaseAdmin, user.id, assignment.athlete_id))) {
    return jsonError('Forbidden', 403)
  }
  if (String(assignment.status || '').toLowerCase() === 'paid') {
    return jsonError('Coach fee is already paid', 409)
  }
  const assignmentStatus = String(assignment.status || 'pending').toLowerCase()
  if (!['pending', 'expired', 'canceled'].includes(assignmentStatus)) {
    return jsonError('Coach fee is not available for checkout', 409)
  }

  const amountCents = Math.round(Number(assignment.amount || 0) * 100)
  if (!Number.isFinite(amountCents) || amountCents <= 0) return jsonError('Coach fee amount is invalid')
  if (amountCents > 5_000_000) return jsonError('Coach fee amount exceeds the maximum allowed')

  const isOrganizationPayment = workspace.type === 'organization'
  const [connectStatus, { data: plan }, { data: feeRules }, { data: payer }, feeSettings, orgFeeBreakdown] = await Promise.all([
    loadStripeConnectAccountStatus(isOrganizationPayment ? 'org' : 'coach',
      isOrganizationPayment ? workspace.organizationId! : assignment.coach_id, { refresh: true }),
    supabaseAdmin.from('coach_plans').select('tier').eq('coach_id', assignment.coach_id).maybeSingle(),
    supabaseAdmin.from('platform_fee_rules').select('tier, category, percentage').eq('active', true),
    supabaseAdmin.from('profiles').select('email, stripe_customer_id').eq('id', user.id).maybeSingle(),
    getFeeSettings(),
    isOrganizationPayment
      ? calculateOrgPlatformFeeForOrg({ amountCents, orgId: workspace.organizationId!, kind: 'session' })
      : Promise.resolve(null),
  ])
  if (!isStripeConnectEnabled(connectStatus)) {
    return jsonError(`${isOrganizationPayment ? 'Organization' : 'Coach'} must finish Stripe Connect onboarding before accepting payments`, 400)
  }

  const tier = (plan?.tier as FeeTier) || 'starter'
  const feeRate = orgFeeBreakdown?.feeRate ?? getFeePercentage(tier, 'session', feeRules || [])
  const applicationFeeCents = orgFeeBreakdown?.platformFeeCents ?? Math.round(amountCents * feeRate / 100)
  const stripeProcessingFeeCents = orgFeeBreakdown?.stripeProcessingFeeCents ?? calculateStripeProcessingFeeCents(amountCents, feeSettings)
  const baseUrl = resolveBaseUrl()
  const returnQuery = `type=coach_fee&id=${encodeURIComponent(assignment.id)}`
  const { token: cancelToken } = createMobileCheckoutToken({
    type: 'coach_fee',
    userId: user.id,
    resourceId: assignment.id,
  }, 35 * 60)

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: assignment.name || 'Coach fee' },
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/payment/complete?${returnQuery}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment/complete?${returnQuery}&canceled=1&token=${encodeURIComponent(cancelToken)}`,
      client_reference_id: user.id,
      ...(payer?.stripe_customer_id
        ? { customer: payer.stripe_customer_id }
        : { customer_email: payer?.email || undefined }),
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: { destination: connectStatus!.stripeAccountId },
        metadata: {
          checkout_type: 'coach_fee',
          assignment_id: assignment.id,
          coach_id: assignment.coach_id,
          workspace_id: workspace.id,
          payment_owner_type: isOrganizationPayment ? 'organization' : 'independent_coach',
          payment_owner_id: isOrganizationPayment ? workspace.organizationId! : assignment.coach_id,
          athlete_profile_id: assignment.athlete_id,
          platformFeeCents: String(applicationFeeCents),
          platformFeeRate: String(feeRate),
          stripeProcessingFeeCents: String(stripeProcessingFeeCents),
          netAmountCents: String(Math.max(amountCents - applicationFeeCents, 0)),
        },
      },
      metadata: {
        checkout_type: 'coach_fee',
        assignment_id: assignment.id,
        coach_id: assignment.coach_id,
        workspace_id: workspace.id,
        payment_owner_type: isOrganizationPayment ? 'organization' : 'independent_coach',
        payment_owner_id: isOrganizationPayment ? workspace.organizationId! : assignment.coach_id,
        athlete_profile_id: assignment.athlete_id,
        payer_user_id: user.id,
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    })
    if (!session.url) throw new Error('Stripe did not return a checkout URL')

    const { data: boundAssignment, error: updateError } = await supabaseAdmin
      .from('coach_fee_assignments')
      .update({
        status: 'pending',
        stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignment.id)
      .in('status', ['pending', 'expired', 'canceled'])
      .select('id')
      .maybeSingle()
    if (updateError || !boundAssignment) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
      return jsonError(
        updateError ? 'Unable to bind checkout to coach fee' : 'Coach fee is no longer available for checkout',
        updateError ? 500 : 409,
      )
    }

    return NextResponse.json({
      checkout_url: session.url,
      expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      fee_breakdown: {
        gross_cents: amountCents,
        platform_fee_cents: applicationFeeCents,
        stripe_processing_fee_cents: stripeProcessingFeeCents,
        net_cents: Math.max(amountCents - applicationFeeCents, 0),
        fee_rate: feeRate,
        kind: 'session',
      },
    })
  } catch (error: any) {
    return jsonError(error?.message || 'Unable to start coach fee checkout', 500)
  }
}

async function createOrgFeeCheckout(userId: string, assignmentId: string, workspace: Awaited<ReturnType<typeof requireWorkspaceContext>>) {
  if (!workspace || workspace.type !== 'organization' || !workspace.organizationId) return jsonError('Organization workspace required', 403)
  if (!assignmentId) return jsonError('record_id is required')

  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('id, fee_id, athlete_id, status, stripe_checkout_session_id, workspace_id')
    .eq('id', assignmentId)
    .maybeSingle()
  if (assignmentError) return jsonError('Unable to load organization fee', 500)
  if (!assignment) return jsonError('Organization fee not found', 404)
  if (assignment.workspace_id !== workspace.id) return jsonError('Organization fee belongs to a different workspace', 403)
  if (!(await userOwnsAthleteProfile(supabaseAdmin, userId, assignment.athlete_id))) {
    return jsonError('Forbidden', 403)
  }
  if (String(assignment.status || '').toLowerCase() === 'paid') {
    return jsonError('Organization fee is already paid', 409)
  }
  if (String(assignment.status || '').toLowerCase() !== 'unpaid') {
    return jsonError('Organization fee is not available for checkout', 409)
  }

  const { data: fee, error: feeError } = await supabaseAdmin
    .from('org_fees')
    .select('id, org_id, title, amount_cents')
    .eq('id', assignment.fee_id)
    .maybeSingle()
  if (feeError) return jsonError('Unable to load organization fee configuration', 500)
  if (!fee?.org_id) return jsonError('Organization fee configuration not found', 404)
  if (fee.org_id !== workspace.organizationId) return jsonError('Organization fee belongs to a different workspace', 403)

  const rawAmount = Number(fee.amount_cents || 0) / 100
  const amountCents = Math.round(Number(rawAmount) * 100)
  if (!Number.isFinite(amountCents) || amountCents <= 0) return jsonError('Organization fee amount is invalid')
  if (amountCents > 5_000_000) return jsonError('Organization fee amount exceeds the maximum allowed')

  const [connectStatus, feeBreakdown, { data: payer }] = await Promise.all([
    loadStripeConnectAccountStatus('org', fee.org_id, { refresh: true }),
    calculateOrgPlatformFeeForOrg({ amountCents, orgId: fee.org_id, kind: 'org_fee' }),
    supabaseAdmin.from('profiles').select('email, stripe_customer_id').eq('id', userId).maybeSingle(),
  ])
  if (!isStripeConnectEnabled(connectStatus)) {
    return jsonError('Organization must finish Stripe Connect onboarding before accepting payments', 400)
  }

  const baseUrl = resolveBaseUrl()
  const returnQuery = `type=fee&id=${encodeURIComponent(assignment.id)}`
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: fee.title || 'Organization fee' },
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/payment/complete?${returnQuery}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment/complete?${returnQuery}&canceled=1`,
      client_reference_id: userId,
      ...(payer?.stripe_customer_id
        ? { customer: payer.stripe_customer_id }
        : { customer_email: payer?.email || undefined }),
      payment_intent_data: {
        application_fee_amount: feeBreakdown.platformFeeCents,
        transfer_data: { destination: connectStatus!.stripeAccountId },
        metadata: {
          checkout_type: 'org_fee',
          assignment_id: assignment.id,
          org_id: fee.org_id,
          workspace_id: workspace.id,
          athlete_profile_id: assignment.athlete_id,
          payer_user_id: userId,
          platformFeeCents: String(feeBreakdown.platformFeeCents),
          platformFeeRate: String(feeBreakdown.feeRate),
          stripeProcessingFeeCents: String(feeBreakdown.stripeProcessingFeeCents),
          netAmountCents: String(feeBreakdown.netCents),
        },
      },
      metadata: {
        checkout_type: 'org_fee',
        assignment_id: assignment.id,
        org_id: fee.org_id,
        workspace_id: workspace.id,
        athlete_profile_id: assignment.athlete_id,
        payer_user_id: userId,
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    })
    if (!session.url) throw new Error('Stripe did not return a checkout URL')

    const { data: boundAssignment, error: updateError } = await supabaseAdmin
      .from('org_fee_assignments')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', assignment.id)
      .neq('status', 'paid')
      .select('id')
      .maybeSingle()
    if (updateError || !boundAssignment) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
      return jsonError(
        updateError ? 'Unable to bind checkout to organization fee' : 'Organization fee is no longer available for checkout',
        updateError ? 500 : 409,
      )
    }

    return NextResponse.json({
      checkout_url: session.url,
      expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      fee_breakdown: {
        gross_cents: feeBreakdown.grossCents,
        platform_fee_cents: feeBreakdown.platformFeeCents,
        stripe_processing_fee_cents: feeBreakdown.stripeProcessingFeeCents,
        net_cents: feeBreakdown.netCents,
        fee_rate: feeBreakdown.feeRate,
        kind: 'org_fee',
      },
    })
  } catch (error: any) {
    return jsonError(error?.message || 'Unable to start organization fee checkout', 500)
  }
}

async function createProgramCheckout(userId: string, registrationId: string, workspace: Awaited<ReturnType<typeof requireWorkspaceContext>>) {
  if (!workspace || workspace.type !== 'organization' || !workspace.organizationId) return jsonError('Organization workspace required', 403)
  if (!registrationId) return jsonError('record_id is required')

  const { data: registration, error: registrationError } = await supabaseAdmin
    .from('program_registrations')
    .select('id, program_id, athlete_profile_id, owner_user_id, status, stripe_checkout_session_id')
    .eq('id', registrationId)
    .maybeSingle()
  if (registrationError) return jsonError('Unable to load program registration', 500)
  if (!registration) return jsonError('Program registration not found', 404)
  if (registration.owner_user_id !== userId) return jsonError('Forbidden', 403)
  if (!(await userOwnsAthleteProfile(supabaseAdmin, userId, registration.athlete_profile_id))) {
    return jsonError('Forbidden', 403)
  }
  if (String(registration.status || '').toLowerCase() === 'paid') {
    return jsonError('Program registration is already paid', 409)
  }

  const { data: program, error: programError } = await supabaseAdmin
    .from('programs')
    .select('id, org_id, name, type, price, status')
    .eq('id', registration.program_id)
    .maybeSingle()
  if (programError) return jsonError('Unable to load program', 500)
  if (!program || String(program.status || '').toLowerCase() !== 'active') {
    return jsonError('Program is unavailable', 404)
  }
  if (program.org_id !== workspace.organizationId) return jsonError('Program belongs to a different workspace', 403)

  const amountCents = Math.round(Number(program.price || 0) * 100)
  if (!Number.isFinite(amountCents) || amountCents <= 0) return jsonError('Program price is invalid')
  if (amountCents > 5_000_000) return jsonError('Program amount exceeds the maximum allowed')

  const [connectStatus, feeBreakdown, { data: payer }] = await Promise.all([
    loadStripeConnectAccountStatus('org', program.org_id),
    calculateOrgPlatformFeeForOrg({
      amountCents,
      orgId: program.org_id,
      kind: 'program',
    }),
    supabaseAdmin.from('profiles').select('email, stripe_customer_id').eq('id', userId).maybeSingle(),
  ])
  if (!isStripeConnectEnabled(connectStatus)) {
    return jsonError('Organization must finish Stripe Connect onboarding before accepting program payments', 400)
  }

  const baseUrl = resolveBaseUrl()
  const returnQuery = `type=program&id=${encodeURIComponent(registration.id)}`

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: program.name || 'Program registration',
            description: program.type ? String(program.type).replace(/_/g, ' ') : undefined,
          },
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/payment/complete?${returnQuery}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment/complete?${returnQuery}&canceled=1`,
      client_reference_id: userId,
      ...(payer?.stripe_customer_id
        ? { customer: payer.stripe_customer_id }
        : { customer_email: payer?.email || undefined }),
      payment_intent_data: {
        application_fee_amount: feeBreakdown.platformFeeCents,
        transfer_data: { destination: connectStatus!.stripeAccountId },
        metadata: {
          checkout_type: 'mobile_program',
          registration_id: registration.id,
          program_id: program.id,
          org_id: program.org_id,
          workspace_id: workspace.id,
          athlete_profile_id: registration.athlete_profile_id,
          payer_user_id: userId,
          platformFeeCents: String(feeBreakdown.platformFeeCents),
          platformFeeRate: String(feeBreakdown.feeRate),
          stripeProcessingFeeCents: String(feeBreakdown.stripeProcessingFeeCents),
          netAmountCents: String(feeBreakdown.netCents),
          rollingVolumeCents: String(feeBreakdown.rollingVolumeCents ?? ''),
        },
      },
      metadata: {
        checkout_type: 'mobile_program',
        registration_id: registration.id,
        program_id: program.id,
        org_id: program.org_id,
        workspace_id: workspace.id,
        athlete_profile_id: registration.athlete_profile_id,
        payer_user_id: userId,
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    })
    if (!session.url) throw new Error('Stripe did not return a checkout URL')

    const { error: updateError } = await supabaseAdmin
      .from('program_registrations')
      .update({
        stripe_checkout_session_id: session.id,
      })
      .eq('id', registration.id)
      .neq('status', 'paid')
    if (updateError) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
      return jsonError('Unable to bind checkout to program registration', 500)
    }

    return NextResponse.json({
      checkout_url: session.url,
      expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      fee_breakdown: {
        gross_cents: amountCents,
        platform_fee_cents: feeBreakdown.platformFeeCents,
        stripe_processing_fee_cents: feeBreakdown.stripeProcessingFeeCents,
        net_cents: feeBreakdown.netCents,
        fee_rate: feeBreakdown.feeRate,
        kind: 'program',
      },
    })
  } catch (error: any) {
    return jsonError(error?.message || 'Unable to start program checkout', 500)
  }
}

async function createMarketplaceCheckout(userId: string, itemId: string, workspace: Awaited<ReturnType<typeof requireWorkspaceContext>>) {
  if (!workspace) return jsonError('Active workspace required', 403)
  if (!itemId) return jsonError('record_id is required')

  const { data: item, error: itemError } = await supabaseAdmin
    .from('marketplace_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle()
  if (itemError) return jsonError('Unable to load marketplace item', 500)
  if (!item || !item.is_active) return jsonError('Marketplace item not found', 404)
  if (item.workspace_id !== workspace.id) return jsonError('Marketplace item belongs to a different workspace', 403)
  if (workspace.type === 'organization' && item.org_id !== workspace.organizationId) return jsonError('Organization seller mismatch', 403)
  if (workspace.type === 'independent_coach' && item.coach_id !== workspace.ownerUserId) return jsonError('Independent seller mismatch', 403)
  if (item.inventory_count !== null && Number(item.inventory_count) <= 0) {
    return jsonError('Marketplace item is out of stock', 409)
  }

  const amountCents = Math.round(Number(item.price || 0) * 100)
  if (!Number.isFinite(amountCents) || amountCents <= 0) return jsonError('Marketplace item price is invalid')
  if (amountCents > 5_000_000) return jsonError('Marketplace item amount exceeds the maximum allowed')

  let destination: string | null = null
  let platformFeeCents = 0
  let stripeProcessingFeeCents = 0
  let feeRate = 0
  let sellerType: 'coach' | 'org' | null = null
  let sellerId: string | null = null

  if (item.coach_id) {
    sellerType = 'coach'
    sellerId = item.coach_id
    const [connectStatus, feeSettings] = await Promise.all([
      loadStripeConnectAccountStatus('coach', item.coach_id),
      getFeeSettings(),
    ])
    destination = isStripeConnectEnabled(connectStatus) ? connectStatus!.stripeAccountId : null
    platformFeeCents = calculateMarketplacePlatformFeeCents(
      amountCents,
      feeSettings.marketplacePlatformFeePercent,
      feeSettings.marketplacePlatformFeeCapCents,
    )
    stripeProcessingFeeCents = calculateStripeProcessingFeeCents(amountCents, feeSettings)
    feeRate = feeSettings.marketplacePlatformFeePercent
  } else if (item.org_id) {
    sellerType = 'org'
    sellerId = item.org_id
    const [connectStatus, feeBreakdown] = await Promise.all([
      loadStripeConnectAccountStatus('org', item.org_id),
      calculateOrgPlatformFeeForOrg({
        amountCents,
        orgId: item.org_id,
        kind: 'marketplace',
      }),
    ])
    destination = isStripeConnectEnabled(connectStatus) ? connectStatus!.stripeAccountId : null
    platformFeeCents = feeBreakdown.platformFeeCents
    stripeProcessingFeeCents = feeBreakdown.stripeProcessingFeeCents
    feeRate = feeBreakdown.feeRate
  }

  if (!destination || !sellerType || !sellerId) {
    return jsonError('Seller must finish Stripe Connect onboarding before accepting purchases', 400)
  }

  const { token, claims } = createMobileCheckoutToken({
    type: 'marketplace',
    userId,
    resourceId: item.id,
  })
  const expiresAt = new Date(claims.expiresAt * 1000).toISOString()
  const { error: handoffError } = await supabaseAdmin.from('mobile_checkout_handoffs').insert({
    nonce: claims.nonce,
    user_id: userId,
    checkout_type: 'marketplace',
    resource_id: item.id,
    token_expires_at: expiresAt,
    expires_at: expiresAt,
    status: 'processing',
    workspace_id: workspace.id,
    metadata: { seller_type: sellerType, seller_id: sellerId, workspace_id: workspace.id },
  })
  if (handoffError) return jsonError('Unable to create checkout handoff', 500)

  try {
    const { data: buyer } = await supabaseAdmin
      .from('profiles')
      .select('email, stripe_customer_id')
      .eq('id', userId)
      .maybeSingle()
    const baseUrl = resolveBaseUrl()
    const returnQuery = `token=${encodeURIComponent(token)}&type=marketplace`
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: item.name || 'Marketplace item',
            description: item.description || undefined,
          },
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/payment/complete?${returnQuery}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment/complete?${returnQuery}&canceled=1`,
      client_reference_id: userId,
      ...(buyer?.stripe_customer_id
        ? { customer: buyer.stripe_customer_id }
        : { customer_email: buyer?.email || undefined }),
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: { destination },
        metadata: {
          checkout_type: 'mobile_marketplace',
          item_id: item.id,
          buyer_id: userId,
          handoff_nonce: claims.nonce,
          workspace_id: workspace.id,
          platformFeeCents: String(platformFeeCents),
          platformFeeRate: String(feeRate),
          stripeProcessingFeeCents: String(stripeProcessingFeeCents),
          netAmountCents: String(Math.max(amountCents - platformFeeCents, 0)),
        },
      },
      metadata: {
        checkout_type: 'mobile_marketplace',
        item_id: item.id,
        buyer_id: userId,
        coach_id: item.coach_id || '',
        org_id: item.org_id || '',
        handoff_nonce: claims.nonce,
        workspace_id: workspace.id,
      },
      expires_at: claims.expiresAt,
    }, { idempotencyKey: `mobile_marketplace_direct_checkout:${claims.nonce}` })
    if (!session.url) throw new Error('Stripe did not return a checkout URL')

    const { error: updateError } = await supabaseAdmin
      .from('mobile_checkout_handoffs')
      .update({
        status: 'consumed',
        stripe_checkout_session_id: session.id,
        checkout_url: session.url,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('nonce', claims.nonce)
    if (updateError) {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
      return jsonError('Unable to bind checkout to marketplace purchase', 500)
    }

    return NextResponse.json({
      checkout_url: session.url,
      expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      fee_breakdown: {
        gross_cents: amountCents,
        platform_fee_cents: platformFeeCents,
        stripe_processing_fee_cents: stripeProcessingFeeCents,
        net_cents: Math.max(amountCents - platformFeeCents, 0),
        fee_rate: feeRate,
        kind: 'marketplace',
      },
    })
  } catch (error: any) {
    await supabaseAdmin
      .from('mobile_checkout_handoffs')
      .update({ status: 'issued', last_error: error?.message || 'Marketplace checkout failed', updated_at: new Date().toISOString() })
      .eq('nonce', claims.nonce)
    return jsonError(error?.message || 'Unable to start marketplace checkout', 500)
  }
}
