import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { logAdminAction } from '@/lib/auditLog'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const { data, error } = await supabaseAdmin.rpc('admin_governance_snapshot')
  if (error) return NextResponse.json({ error: 'Unable to load platform governance. Please retry.' }, { status: 500 })
  return NextResponse.json({ snapshot: data })
}

export async function POST(request: Request) {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const body = await request.json().catch(() => null)
  if (body?.action !== 'retry_slack_events' || body?.confirmed !== true) {
    return NextResponse.json({ error: 'Confirm the Slack retry before continuing.' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin.rpc('admin_retry_slack_events')
  if (error) return NextResponse.json({ error: 'Slack retry could not be started. Please retry.' }, { status: 500 })
  await logAdminAction({ action: 'admin.slack_events.retry', actorId: auth.user.id, actorEmail: auth.user.email || null, targetType: 'slack_event_outbox', targetId: null, metadata: { confirmed: true, result: data } })
  return NextResponse.json({ result: data })
}
