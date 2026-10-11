import { NextResponse } from 'next/server'
import { mobileContractError } from '@/lib/mobileApiContract'
import { messageReactionMap, validMessageReaction } from '@/lib/messageReactions'
import { requireMobileThread } from '@/lib/mobileThreadManagement'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseUuid } from '@/lib/uuid'

async function access(request: Request, rawId: string) {
  const id = parseUuid(rawId); if (!id) return { response: mobileContractError('message_unavailable','Message is unavailable.',404) }
  const { data: message } = await supabaseAdmin.from('messages').select('id,thread_id,deleted_at').eq('id', id).maybeSingle()
  if (!message?.thread_id) return { response: mobileContractError('message_unavailable','Message is unavailable.',404) }
  const scope = await requireMobileThread(request, message.thread_id)
  if ('response' in scope) return { response: scope.response }
  return { message, scope }
}

async function mutate(request: Request, rawId: string, remove: boolean) {
  const resolved = await access(request, rawId); if ('response' in resolved) return resolved.response
  if (resolved.message.deleted_at) return mobileContractError('message_deleted','A deleted message cannot be changed.',409)
  const body = await request.json().catch(() => ({})); if (!validMessageReaction(body.emoji)) return mobileContractError('reaction_invalid','Choose a supported reaction.',422)
  const query = remove
    ? supabaseAdmin.from('message_reactions').delete().eq('message_id', resolved.message.id).eq('user_id', resolved.scope.user.id).eq('emoji', body.emoji)
    : supabaseAdmin.from('message_reactions').upsert({ message_id: resolved.message.id, user_id: resolved.scope.user.id, emoji: body.emoji }, { onConflict: 'message_id,user_id,emoji' })
  const { error } = await query
  if (error) return mobileContractError(remove ? 'reaction_remove_failed' : 'reaction_save_failed','The reaction could not be changed.',503,true)
  const reactions = (await messageReactionMap([resolved.message.id], resolved.scope.user.id)).get(resolved.message.id) || []
  return NextResponse.json({ message_id: resolved.message.id, reactions }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PUT(request: Request, { params }: { params: Promise<{ messageId: string }> }) { return mutate(request, (await params).messageId, false) }
export async function DELETE(request: Request, { params }: { params: Promise<{ messageId: string }> }) { return mutate(request, (await params).messageId, true) }
