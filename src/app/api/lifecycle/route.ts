import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import {
  applyLifecycleEvent,
  buildLifecycleSnapshot,
  getActiveTierForUser,
  normalizeRoleForLifecycle,
  resolveBillingInfoForLifecycle,
  type LifecycleEvent,
} from '@/lib/lifecycleOrchestration'
import { resolveBillingInfoForActor } from '@/lib/subscriptionLifecycle'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const getAuthUser = async () => {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return { supabase, session: null, user: null, error: jsonError('Unauthorized', 401) }
  }
  return { supabase, session, user: session.user, error: null }
}

const buildSnapshotForUser = async (supabase: any, user: any) => {
  const metadata = (user.user_metadata || {}) as Record<string, any>
  const role = normalizeRoleForLifecycle(metadata.active_role || metadata.role)
  const activeTier = await getActiveTierForUser({
    supabase,
    userId: user.id,
    role,
    selectedTierHint: metadata.selected_tier || null,
    orgIdHint: metadata.current_org_id || null,
    resolveLiveBillingInfo: resolveBillingInfoForActor,
  })
  const emailConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at)
  const suspended = Boolean(metadata.suspended)
  return buildLifecycleSnapshot({
    role,
    emailConfirmed,
    suspended,
    selectedTier: metadata.selected_tier,
    activeTier,
    lifecycleStateHint: metadata.lifecycle_state,
  })
}

const repairBillingBackfillForUser = async ({
  user,
  snapshot,
}: {
  user: any
  snapshot: Awaited<ReturnType<typeof buildSnapshotForUser>>
}) => {
  const metadata = (user.user_metadata || {}) as Record<string, any>
  const role = normalizeRoleForLifecycle(metadata.active_role || metadata.role)

  if ((role !== 'coach' && role !== 'athlete' && role !== 'org_admin') || snapshot.state !== 'active') {
    return
  }

  const resolvedTier = snapshot.activeTier || snapshot.selectedTier || null
  const billingInfo = await resolveBillingInfoForLifecycle({
    userId: user.id,
    role,
    selectedTierHint: resolvedTier || metadata.selected_tier || null,
    orgIdHint: metadata.current_org_id || null,
    resolveLiveBillingInfo: resolveBillingInfoForActor,
  })
  const nowIso = new Date().toISOString()

  if (role === 'coach' && resolvedTier) {
    await supabaseAdmin
      .from('coach_plans')
      .upsert({ coach_id: user.id, tier: resolvedTier }, { onConflict: 'coach_id' })
  }

  if (role === 'athlete' && resolvedTier) {
    await supabaseAdmin
      .from('athlete_plans')
      .upsert({ athlete_id: user.id, tier: resolvedTier }, { onConflict: 'athlete_id' })
  }

  const profileUpdates: Record<string, any> = { id: user.id }
  if (billingInfo?.status) profileUpdates.subscription_status = billingInfo.status
  if (Object.keys(profileUpdates).length > 1) {
    await supabaseAdmin.from('profiles').upsert(profileUpdates, { onConflict: 'id' })
  }

  const nextMetadata: Record<string, any> = {
    ...metadata,
    lifecycle_state: 'active',
    lifecycle_updated_at: nowIso,
  }
  if (resolvedTier) nextMetadata.selected_tier = resolvedTier
  if (billingInfo?.status) nextMetadata.subscription_status = billingInfo.status

  const needsMetadataRepair =
    metadata.lifecycle_state !== 'active'
    || (resolvedTier && metadata.selected_tier !== resolvedTier)
    || (billingInfo?.status && metadata.subscription_status !== billingInfo.status)

  if (needsMetadataRepair) {
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: nextMetadata,
    })
  }
}

export async function GET() {
  const { supabase, user, error } = await getAuthUser()
  if (error || !user) return error

  const snapshot = await buildSnapshotForUser(supabase, user)
  await repairBillingBackfillForUser({ user, snapshot })

  return NextResponse.json({ snapshot })
}

export async function POST(request: Request) {
  const { supabase, user, error } = await getAuthUser()
  if (error || !user) return error

  const payload = await request.json().catch(() => ({}))
  const event = String(payload?.event || '').trim() as LifecycleEvent
  if (!event) return jsonError('event is required')
  const allowedEvents: LifecycleEvent[] = [
    'signup_submitted',
    'verification_confirmed',
    'plan_selected',
    'checkout_started',
    'checkout_completed',
    'account_suspended',
    'account_unsuspended',
  ]
  if (!allowedEvents.includes(event)) return jsonError('Unsupported event')

  const metadata = (user.user_metadata || {}) as Record<string, any>
  const nextMetadata = applyLifecycleEvent(metadata, event, {
    tier: payload?.tier || null,
  })
  const { error: updateError } = await supabase.auth.updateUser({ data: nextMetadata })
  if (updateError) return jsonError(updateError.message, 500)

  // When confirming verification, explicitly set email_confirmed_at via the admin API
  // so computeLifecycleState sees emailConfirmed=true and doesn't revert the state back
  // to awaiting_verification during the reconciliation pass below.
  if (event === 'verification_confirmed') {
    await supabaseAdmin.auth.admin.updateUserById(user.id, { email_confirm: true }).catch(() => null)
  }

  // Use admin API to get the freshest user object (reflects email_confirm update above).
  const { data: adminUserData } = await supabaseAdmin.auth.admin.getUserById(user.id).catch(() => ({ data: null }))
  const snapshotUser = adminUserData?.user || user

  const snapshot = await buildSnapshotForUser(supabase, snapshotUser)

  // Skip reconciliation for verification_confirmed — the event is authoritative.
  // Allowing the computed state to overwrite it would revert to awaiting_verification
  // when email_confirmed_at hasn't propagated to the JWT yet.
  if (event !== 'verification_confirmed' && snapshot.state !== nextMetadata.lifecycle_state) {
    await supabase.auth.updateUser({
      data: {
        ...nextMetadata,
        lifecycle_state: snapshot.state,
        lifecycle_updated_at: new Date().toISOString(),
      },
    })
  }

  return NextResponse.json({ snapshot })
}
