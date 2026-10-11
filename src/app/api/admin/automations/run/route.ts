import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { getAdminConfig, setAdminConfig } from '@/lib/adminConfig'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { insertNotifications } from '@/lib/inAppNotifications'
import { logAdminAction } from '@/lib/auditLog'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { executeRetentionPolicies } from '@/lib/adminRetention'
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

  if (!session) {
    return { error: jsonError('Unauthorized', 401) }
  }
  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (adminAccess.teamRole !== 'ops' && adminAccess.teamRole !== 'superadmin') {
    return { error: jsonError('Forbidden', 403) }
  }
  return { session }
}

export async function POST(request: Request) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const payload = await request.json().catch(() => ({}))
  const runId = String(payload?.run_id || '')
  if (!runId) return jsonError('run_id is required')

  const config = await getAdminConfig('automations')
  const configuredRun = (config?.scheduledRuns || []).find((run: any) => run.id === runId)
  if (!configuredRun) return jsonError('Automation not found', 404)

  const workflow = String(configuredRun.workflow || '').trim().toLowerCase()
  let execution: Record<string, unknown>
  if (workflow === 'retention') {
    const results = await executeRetentionPolicies(session!.user.id)
    execution = { workflow, affected: results.reduce((sum, result) => sum + result.deleted, 0), results }
  } else if (workflow === 'notification' || workflow === 'onboarding' || workflow === 'audience') {
    const roles = Array.isArray(configuredRun.roles)
      ? configuredRun.roles.map((role: unknown) => String(role).trim()).filter(Boolean)
      : []
    if (!roles.length || !String(configuredRun.title || '').trim() || !String(configuredRun.body || '').trim()) {
      return jsonError('Notification automations require roles, title, and body', 422)
    }
    const { data: recipients, error: recipientsError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .in('role', roles)
    if (recipientsError) return jsonError(recipientsError.message, 500)
    await insertNotifications((recipients || []).map((profile) => ({
      user_id: profile.id,
      type: workflow === 'onboarding' ? 'onboarding_automation' : 'admin_automation',
      title: String(configuredRun.title),
      body: String(configuredRun.body),
      action_url: String(configuredRun.action_url || '/'),
      data: { run_id: runId, workflow, category: 'Admin automation' },
    })))
    execution = { workflow, affected: recipients?.length || 0 }
  } else {
    return jsonError('This automation has no supported executable workflow', 422)
  }
  const now = new Date()
  const lastRunLabel = now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const scheduledRuns = (config?.scheduledRuns || []).map((run: any) =>
    run.id === runId ? { ...run, lastRun: lastRunLabel, lastResult: execution } : run
  )

  const nextConfig = {
    ...(config || {}),
    scheduledRuns,
  }

  await setAdminConfig('automations', nextConfig)
  await logAdminAction({
    action: 'admin.automation.run',
    actorId: session?.user.id,
    actorEmail: session?.user.email || null,
    targetType: 'automation',
    targetId: runId,
  })

  const { data: adminProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')

  if (adminProfiles && adminProfiles.length) {
    await insertNotifications(
      adminProfiles.map((profile) => ({
        user_id: profile.id,
        type: 'admin_automation',
        title: 'Automation run recorded',
        body: `Automation "${configuredRun.name || runId}" executed (${String(execution.affected || 0)} affected).`,
        action_url: '/admin/automations',
        data: { run_id: runId, category: 'Admin' },
      }))
    )
  }

  return NextResponse.json({ ok: true, execution, config: nextConfig })
}
