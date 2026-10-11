import { NextResponse } from 'next/server'
import { mobileContractError } from '@/lib/mobileApiContract'
import { messageReactionMap } from '@/lib/messageReactions'
import { requireMobileThread } from '@/lib/mobileThreadManagement'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseUuid } from '@/lib/uuid'

export async function GET(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const threadId = parseUuid((await params).threadId)
  if (!threadId) return mobileContractError('thread_unavailable','Conversation is unavailable.',404)
  const access = await requireMobileThread(request, threadId); if ('response' in access) return access.response
  const { data, error } = await supabaseAdmin.from('messages').select('id').eq('thread_id', threadId).is('deleted_at', null).limit(500)
  if (error) return mobileContractError('reactions_unavailable','Reactions are temporarily unavailable.',503,true)
  const map = await messageReactionMap((data || []).map((row) => row.id), access.user.id).catch(() => new Map())
  return NextResponse.json({ reactions: Array.from(map, ([message_id, reactions]) => ({ message_id, reactions })) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
