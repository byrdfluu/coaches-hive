import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { requireMobileThread, threadAudit } from '@/lib/mobileThreadManagement'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function DELETE(request: Request, { params }: { params: Promise<{ threadId: string; userId: string }> }) {
  const { threadId, userId } = await params
  const access = await requireMobileThread(request, threadId)
  if ('response' in access) return access.response
  if (!access.admin) return mobileError('Thread owner or administrator permission required', 403)
  if (userId === access.thread.owner_id || userId === access.thread.created_by) return mobileError('Transfer ownership before removing the owner', 422)
  const { data, error } = await supabaseAdmin.from('thread_participants').delete()
    .eq('thread_id', threadId).eq('user_id', userId).select('user_id').maybeSingle()
  if (error) return mobileError('Unable to remove participant', 500)
  if (!data) return mobileError('Participant not found', 404)
  await threadAudit(access.user, access.thread, 'thread.participant_removed', { user_id: userId })
  return NextResponse.json({ ok: true })
}
