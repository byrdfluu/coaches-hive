import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { logAdminAction } from '@/lib/auditLog'
import { queueOperationTaskSafely } from '@/lib/operations'
import { getReleaseOpsConfig, saveReleaseOpsConfig } from '@/lib/releaseOps'
import { resolveAdminAccess } from '@/lib/adminRoles'

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

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const config = await getReleaseOpsConfig()
  return NextResponse.json({ config })
}

export async function POST(request: Request) {
  const { error, session } = await requireAdmin()
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const payload = await request.json().catch(() => ({}))
  const action = String(payload?.action || '').trim()
  const current = await getReleaseOpsConfig()
  let next = current
  let targetId: string | null = null

  if (action === 'set_flag') {
    const key = String(payload?.key || '').trim()
    if (!key) return jsonError('key is required')
    const enabled = Boolean(payload?.enabled)
    const rolloutPercent = Math.max(0, Math.min(100, Number(payload?.rollout_percent ?? 100)))
    next = {
      ...current,
      featureFlags: current.featureFlags.map((flag) =>
        flag.key === key
          ? { ...flag, enabled, rollout_percent: rolloutPercent }
          : flag
      ),
    }
    targetId = key
  } else if (action === 'set_post_deploy_check') {
    const checkId = String(payload?.check_id || '').trim()
    const status = String(payload?.status || '').trim()
    if (!checkId) return jsonError('check_id is required')
    if (status !== 'pending' && status !== 'pass' && status !== 'fail') return jsonError('Invalid status')
    next = {
      ...current,
      postDeployChecks: current.postDeployChecks.map((check) =>
        check.id === checkId
          ? { ...check, status: status as 'pending' | 'pass' | 'fail' }
          : check
      ),
    }
    targetId = checkId
  } else if (action === 'start_release_verification') {
    const releaseId = String(payload?.release_id || 'release-main').trim()
    targetId = releaseId
    await queueOperationTaskSafely({
      type: 'release_validation',
      title: `Run post-deploy verification for ${releaseId}`,
      priority: 'high',
      owner: 'Engineering',
      entity_type: 'deployment',
      entity_id: releaseId,
      max_attempts: 3,
      idempotency_key: `release_verify:${releaseId}`,
      metadata: {
        checks: current.postDeployChecks.map((item) => item.id),
      },
    })
  } else {
    return jsonError('Unsupported action')
  }

  const saved = await saveReleaseOpsConfig(next)
  await logAdminAction({
    action: `admin.release.${action}`,
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'release_ops',
    targetId,
    metadata: {
      action,
      target_id: targetId,
    },
  })
  return NextResponse.json({ config: saved })
}
