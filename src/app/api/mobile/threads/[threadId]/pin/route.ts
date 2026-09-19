import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { requireMobileThread, threadAudit } from '@/lib/mobileThreadManagement'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const threadId = (await params).threadId, access = await requireMobileThread(request, threadId)
  if ('response' in access) return access.response
  if (!access.admin) return mobileError('Thread owner or administrator permission required', 403)
  const body = await request.json().catch(() => ({})), pinned = body.pinned !== false
  await supabaseAdmin.from('thread_participants').update({ pinned_at: pinned ? new Date().toISOString() : null }).eq('thread_id', threadId).eq('user_id', access.user.id)
  await threadAudit(access.user, access.thread, pinned ? 'thread.pinned' : 'thread.unpinned')
  return NextResponse.json({ ok: true, pinned })
}
