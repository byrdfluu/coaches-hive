import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { getAdminConfig, setAdminConfig } from '@/lib/adminConfig'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import { resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireAdmin = async () => {
  const supabase = createRouteHandlerClient({ cookies })
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
  const now = new Date()
  const lastRunLabel = now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const scheduledRuns = (config?.scheduledRuns || []).map((run: any) =>
    run.id === runId ? { ...run, lastRun: lastRunLabel } : run
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
    await supabaseAdmin.from('notifications').insert(
      adminProfiles.map((profile) => ({
        user_id: profile.id,
        type: 'admin_automation',
        title: 'Automation run recorded',
        body: `Automation "${scheduledRuns.find((run: any) => run.id === runId)?.name || runId}" was executed.`,
        action_url: '/admin/automations',
        data: { run_id: runId, category: 'Admin' },
      }))
    )
  }

  return NextResponse.json({ ok: true, config: nextConfig })
}
