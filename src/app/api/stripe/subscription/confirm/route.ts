import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgStatus, normalizeOrgTier } from '@/lib/planRules'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { applyLifecycleEvent } from '@/lib/lifecycleOrchestration'
import { queueOperationTaskSafely } from '@/lib/operations'
import { syncCoachStripePayoutSchedule } from '@/lib/coachPayoutSync'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ORG_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

type BillingRole = 'coach' | 'athlete' | 'org'

const resolveBillingRole = (role?: string | null): BillingRole | null => {
  if (role === 'coach') return 'coach'
  if (role === 'athlete') return 'athlete'
  if (role && ORG_ROLES.has(role)) return 'org'
  return null
}

const normalizeTierForRole = (role: BillingRole, tier?: string | null) => {
  if (role === 'coach') return normalizeCoachTier(tier)
  if (role === 'athlete') return normalizeAthleteTier(tier)
  return normalizeOrgTier(tier)
}

export async function POST(request: Request) {
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
  ])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const sessionId = String(body?.sessionId || '').trim()
  if (!sessionId) {
    return jsonError('sessionId is required', 400)
  }

  let checkoutSession: any
  try {
    checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    })
  } catch (error: any) {
    await queueOperationTaskSafely({
      type: 'billing_recovery',
      title: 'Unable to load Stripe checkout session for confirmation',
      priority: 'high',
      owner: 'Finance Ops',
      entity_type: 'user',
      entity_id: session.user.id,
      max_attempts: 3,
      idempotency_key: `sub_confirm:${sessionId}`,
      last_error: error?.message || 'checkout session retrieve failed',
      metadata: { session_id: sessionId },
    })
    return jsonError(error?.message || 'Unable to confirm checkout session', 500)
  }

  const sessionOwnerId =
    checkoutSession.client_reference_id
    || checkoutSession.metadata?.user_id
    || null

  if (sessionOwnerId !== session.user.id) {
    return jsonError('Forbidden', 403)
  }

  if (checkoutSession.status !== 'complete') {
    return jsonError('Checkout is not complete', 400)
  }

  const billingRoleFromMetadata = (checkoutSession.metadata?.billing_role || '') as BillingRole
  const billingRole = billingRoleFromMetadata || resolveBillingRole(String(role || ''))
  if (!billingRole) {
    return jsonError('Unsupported billing role', 400)
  }

  const tier = normalizeTierForRole(billingRole, checkoutSession.metadata?.tier)
  const subscription = checkoutSession.subscription as { status?: string } | null
  const normalizedPlanStatus = normalizeOrgStatus(subscription?.status || 'active')
  let confirmedOrgId: string | null = null

  if (billingRole === 'coach') {
    const { error: upsertError } = await supabaseAdmin
      .from('coach_plans')
      .upsert({ coach_id: session.user.id, tier }, { onConflict: 'coach_id' })
    if (upsertError) {
      return jsonError(upsertError.message, 500)
    }
    await supabaseAdmin.from('profiles').update({ plan_tier: tier }).eq('id', session.user.id)
    try {
      await syncCoachStripePayoutSchedule(session.user.id)
    } catch {
      // Non-fatal; the platform scheduler still uses the plan rules.
    }
  } else if (billingRole === 'athlete') {
    const { error: upsertError } = await supabaseAdmin
      .from('athlete_plans')
      .upsert({ athlete_id: session.user.id, tier }, { onConflict: 'athlete_id' })
    if (upsertError) {
      return jsonError(upsertError.message, 500)
    }
    await supabaseAdmin.from('profiles').update({ plan_tier: tier }).eq('id', session.user.id)
  } else {
    const orgIdFromMetadata = checkoutSession.metadata?.org_id || null
    let orgId = orgIdFromMetadata

    if (!orgId) {
      const { data: membership } = await supabaseAdmin
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      orgId = membership?.org_id || null
    }

    if (!orgId) {
      return jsonError('Organization not found', 404)
    }
    confirmedOrgId = orgId

    const { error: upsertError } = await supabaseAdmin
      .from('org_settings')
      .upsert(
        {
          org_id: orgId,
          plan: tier,
          plan_status: normalizedPlanStatus,
        },
        { onConflict: 'org_id' }
      )
    if (upsertError) {
      return jsonError(upsertError.message, 500)
    }
  }

  const customerId = typeof checkoutSession.customer === 'string' ? checkoutSession.customer : null

  if (customerId || subscription?.status) {
    const updates: Record<string, string> = {}
    if (customerId) updates.stripe_customer_id = customerId
    if (subscription?.status) updates.subscription_status = subscription.status
    await supabaseAdmin.from('profiles').update(updates).eq('id', session.user.id)
  }

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(session.user.id)
  const currentMetadata = (authUser?.user?.user_metadata || {}) as Record<string, any>
  const orgCheckoutRole = billingRole === 'org'
    ? String(checkoutSession.metadata?.role || currentMetadata.active_role || currentMetadata.role || 'org_admin')
    : null
  const nextMetadata = applyLifecycleEvent(
    orgCheckoutRole
      ? {
          ...currentMetadata,
          active_role: orgCheckoutRole,
        }
      : currentMetadata,
    'checkout_completed',
    { tier },
  )
  const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
    user_metadata: orgCheckoutRole
      ? {
          ...nextMetadata,
          active_role: orgCheckoutRole,
          ...(billingRole === 'org' && confirmedOrgId ? { current_org_id: confirmedOrgId } : {}),
        }
      : nextMetadata,
  })
  if (metadataError) {
    await queueOperationTaskSafely({
      type: 'lifecycle_repair',
      title: 'Lifecycle state update failed after checkout confirmation',
      priority: 'medium',
      owner: 'Growth Ops',
      entity_type: 'user',
      entity_id: session.user.id,
      max_attempts: 3,
      idempotency_key: `lifecycle_confirm:${session.user.id}:${tier}`,
      last_error: metadataError.message,
      metadata: { billing_role: billingRole, tier },
    })
  }

  return NextResponse.json({ ok: true, billingRole, tier })
}
