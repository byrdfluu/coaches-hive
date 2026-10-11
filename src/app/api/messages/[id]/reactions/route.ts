import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { messageReactionMap, validMessageReaction } from '@/lib/messageReactions'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ROLES = ['coach','athlete','admin','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager']

async function access(messageId: string, userId: string) {
  const { data: message } = await supabaseAdmin.from('messages').select('id,thread_id,deleted_at').eq('id', messageId).maybeSingle()
  if (!message) return null
  const { data: participant } = await supabaseAdmin.from('thread_participants').select('thread_id')
    .eq('thread_id', message.thread_id).eq('user_id', userId).maybeSingle()
  return participant ? message : null
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(ROLES); if (error || !session) return error
  const id = (await params).id, message = await access(id, session.user.id)
  if (!message) return jsonError('Message not found', 404)
  if (message.deleted_at) return jsonError('Cannot react to a deleted message', 409)
  const body = await request.json().catch(() => ({})); if (!validMessageReaction(body.emoji)) return jsonError('Choose a supported reaction', 422)
  const result = await supabaseAdmin.from('message_reactions').upsert({ message_id: id, user_id: session.user.id, emoji: body.emoji }, { onConflict: 'message_id,user_id,emoji' })
  if (result.error) return jsonError('Unable to save reaction', 500)
  const reactions = (await messageReactionMap([id], session.user.id)).get(id) || []
  return NextResponse.json({ message_id: id, reactions }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(ROLES); if (error || !session) return error
  const id = (await params).id; if (!await access(id, session.user.id)) return jsonError('Message not found', 404)
  const body = await request.json().catch(() => ({})); if (!validMessageReaction(body.emoji)) return jsonError('Choose a supported reaction', 422)
  const result = await supabaseAdmin.from('message_reactions').delete().eq('message_id', id).eq('user_id', session.user.id).eq('emoji', body.emoji)
  if (result.error) return jsonError('Unable to remove reaction', 500)
  const reactions = (await messageReactionMap([id], session.user.id)).get(id) || []
  return NextResponse.json({ message_id: id, reactions }, { headers: { 'Cache-Control': 'private, no-store' } })
}
