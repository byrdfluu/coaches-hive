import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { requireMobileThread, threadAudit } from '@/lib/mobileThreadManagement'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const threadId = (await params).threadId
  const access = await requireMobileThread(request, threadId)
  if ('response' in access) return access.response
  const body = await request.json().catch(() => ({}))
  const level = body.notification_level == null ? null : String(body.notification_level)
  if (level && !['all', 'mentions', 'none'].includes(level)) return mobileError('Invalid notification_level', 422)
  if (!level && ![body.muted, body.hidden, body.report].some((v) => typeof v === 'boolean' && v !== undefined)) return mobileError('No valid setting supplied', 422)
  const { error } = await supabaseAdmin.rpc('set_thread_user_settings', {
    p_thread_id: threadId, p_muted: typeof body.muted === 'boolean' ? body.muted : null,
    p_notification_level: level, p_hidden: typeof body.hidden === 'boolean' ? body.hidden : null,
  })
  if (error) return mobileError('Unable to update thread settings', 500)
  if (body.report === true) await threadAudit(access.user, access.thread, 'thread.reported', { reason: String(body.reason || '').slice(0, 500) })
  return NextResponse.json({ ok: true })
}
