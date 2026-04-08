import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import { queueOperationTaskSafely } from '@/lib/operations'
import {
  applyLifecycleEvent,
  buildLifecycleSnapshot,
  getActiveTierForUser,
  normalizeRoleForLifecycle,
  normalizeTierForLifecycleRole,
} from '@/lib/lifecycleOrchestration'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { resolveBillingInfoForActor } from '@/lib/subscriptionLifecycle'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireAdmin = async () => {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { error: jsonError('Unauthorized', 401), session: null as any }
  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (adminAccess.teamRole !== 'ops' && adminAccess.teamRole !== 'superadmin') {
    return { error: jsonError('Forbidden', 403), session: null as any }
  }
  return { error: null, session }
}

const loadUser = async (userId: string) => {
  const { data: userPayload, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !userPayload?.user) return null
  return userPayload.user
}

const buildSnapshot = async (user: any) => {
  const metadata = (user.user_metadata || {}) as Record<string, any>
  const role = normalizeRoleForLifecycle(metadata.active_role || metadata.role)
  const activeTier = await getActiveTierForUser({
    supabase: supabaseAdmin,
    userId: user.id,
    role,
    selectedTierHint: metadata.selected_tier || null,
    orgIdHint: metadata.current_org_id || null,
    resolveLiveBillingInfo: resolveBillingInfoForActor,
  })
  return buildLifecycleSnapshot({
    role,
    emailConfirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
    suspended: Boolean(metadata.suspended),
    selectedTier: metadata.selected_tier || null,
    activeTier,
    lifecycleStateHint: metadata.lifecycle_state || null,
  })
}

export async function POST(request: Request) {
  const { error, session } = await requireAdmin()
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const payload = await request.json().catch(() => ({}))
  const action = String(payload?.action || '').trim()
  const userId = String(payload?.user_id || '').trim()
  if (!action) return jsonError('action is required')
  if (!userId) return jsonError('user_id is required')

  const user = await loadUser(userId)
  if (!user) return jsonError('User not found', 404)

  const currentMetadata = (user.user_metadata || {}) as Record<string, any>
  const role = normalizeRoleForLifecycle(currentMetadata.active_role || currentMetadata.role)
  let nextMetadata = { ...currentMetadata }

  if (action === 'repair_role_plan_mismatch') {
    const activeTier = await getActiveTierForUser({
      supabase: supabaseAdmin,
      userId,
      role,
      selectedTierHint: currentMetadata.selected_tier || null,
      orgIdHint: currentMetadata.current_org_id || null,
      resolveLiveBillingInfo: resolveBillingInfoForActor,
    })
    const selectedTier = normalizeTierForLifecycleRole(role, currentMetadata.selected_tier || activeTier)
    nextMetadata = {
      ...nextMetadata,
      role: currentMetadata.role || role,
      selected_tier: selectedTier || undefined,
      lifecycle_updated_at: new Date().toISOString(),
    }
  } else if (action === 'force_rerun_lifecycle') {
    nextMetadata = applyLifecycleEvent(nextMetadata, 'plan_selected', {
      tier: payload?.tier || nextMetadata.selected_tier || null,
    })
  } else if (action === 'unlock_user') {
    nextMetadata = applyLifecycleEvent({ ...nextMetadata, suspended: false }, 'account_unsuspended')
  } else if (action === 'force_logout_user') {
    const nowIso = new Date().toISOString()
    nextMetadata = {
      ...nextMetadata,
      force_logout_after: nowIso,
      auth_session_version: Number(nextMetadata.auth_session_version || 0) + 1,
      lifecycle_updated_at: nowIso,
    }
  } else if (action === 'mark_suspicious_login') {
    const nowIso = new Date().toISOString()
    nextMetadata = {
      ...nextMetadata,
      suspicious_login: true,
      force_logout_after: nowIso,
      auth_session_version: Number(nextMetadata.auth_session_version || 0) + 1,
      lifecycle_updated_at: nowIso,
    }
  } else {
    return jsonError('Unsupported action')
  }

  const snapshotInput = await buildSnapshot({
    ...user,
    user_metadata: nextMetadata,
  })
  nextMetadata.lifecycle_state = snapshotInput.state

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: nextMetadata,
  })
  if (updateError) {
    await queueOperationTaskSafely({
      type: 'lifecycle_repair',
      title: `Intervention failed: ${action}`,
      priority: 'high',
      owner: 'Support Ops',
      entity_type: 'user',
      entity_id: userId,
      max_attempts: 3,
      idempotency_key: `intervention:${action}:${userId}`,
      last_error: updateError.message,
      metadata: { action },
    })
    return jsonError(updateError.message, 500)
  }

  await logAdminAction({
    action: `admin.operations.intervention.${action}`,
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'user',
    targetId: userId,
    metadata: { action },
  })

  const refreshed = await loadUser(userId)
  const snapshot = refreshed ? await buildSnapshot(refreshed) : snapshotInput
  return NextResponse.json({ ok: true, snapshot })
}
