import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { requireMobileThread, threadAudit } from '@/lib/mobileThreadManagement'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const threadId = (await params).threadId
  const access = await requireMobileThread(request, threadId)
  if ('response' in access) return access.response
  if (access.thread.owner_id === access.user.id || access.thread.created_by === access.user.id) return mobileError('Transfer ownership before leaving', 422)
  await supabaseAdmin.from('thread_participants').delete().eq('thread_id', threadId).eq('user_id', access.user.id)
  await threadAudit(access.user, access.thread, 'thread.participant_left', { user_id: access.user.id, history_preserved: true })
  return NextResponse.json({ ok: true, history_preserved: true })
}
