import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const allowedActions = new Set([
  'mute',
  'unmute',
  'archive',
  'unarchive',
  'block',
  'unblock',
  'pin',
  'unpin',
  'mark_unread',
])

export async function POST(request: Request) {
  const { session, error: sessionError } = await getSessionRole([
    'coach',
    'athlete',
    'admin',
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
  ])
  if (sessionError || !session) return sessionError

  const body = await request.json().catch(() => ({}))
  const { thread_id: threadId, thread_ids: rawThreadIds, action } = body || {}
  const threadIds = Array.from(
    new Set(
      [
        ...(Array.isArray(rawThreadIds) ? rawThreadIds : []),
        ...(threadId ? [threadId] : []),
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  )

  if (threadIds.length === 0) {
    return jsonError('thread_id is required')
  }

  if (!action || !allowedActions.has(action)) {
    return jsonError('Invalid action')
  }

  const userId = session.user.id

  const { data: memberships } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id')
    .eq('user_id', userId)
    .in('thread_id', threadIds)

  const allowedThreadIds = new Set((memberships || []).map((row) => row.thread_id))
  if (allowedThreadIds.size !== threadIds.length) {
    return jsonError('Not authorized for this thread', 403)
  }

  if (action === 'block' || action === 'unblock') {
    const [{ data: threadRows, error: threadError }, { data: participantRows, error: participantError }] = await Promise.all([
      supabaseAdmin.from('threads').select('id, is_group').in('id', threadIds),
      supabaseAdmin.from('thread_participants').select('thread_id, user_id').in('thread_id', threadIds),
    ])
    if (threadError || participantError) {
      return jsonError(threadError?.message || participantError?.message || 'Unable to resolve conversation participants', 500)
    }
    const directThreadIds = new Set(
      (threadRows || []).filter((row) => !row.is_group).map((row) => row.id),
    )
    const otherUserIds = Array.from(new Set(
      (participantRows || [])
        .filter((row) => directThreadIds.has(row.thread_id) && row.user_id !== userId)
        .map((row) => row.user_id),
    ))
    if (action === 'block' && otherUserIds.length > 0) {
      const { error: blockError } = await supabaseAdmin.from('user_blocks').upsert(
        otherUserIds.map((blockedUserId) => ({ blocker_id: userId, blocked_user_id: blockedUserId })),
        { onConflict: 'blocker_id,blocked_user_id', ignoreDuplicates: true },
      )
      if (blockError) return jsonError(blockError.message, 500)
    }
    if (action === 'unblock' && otherUserIds.length > 0) {
      const { error: unblockError } = await supabaseAdmin
        .from('user_blocks')
        .delete()
        .eq('blocker_id', userId)
        .in('blocked_user_id', otherUserIds)
      if (unblockError) return jsonError(unblockError.message, 500)
    }
  }

  const now = new Date().toISOString()
  const updates: Record<string, string | null> = {}

  if (action === 'mute') updates.muted_at = now
  if (action === 'unmute') updates.muted_at = null
  if (action === 'archive') updates.archived_at = now
  if (action === 'unarchive') updates.archived_at = null
  if (action === 'block') updates.blocked_at = now
  if (action === 'unblock') updates.blocked_at = null
  if (action === 'pin') updates.pinned_at = now
  if (action === 'unpin') updates.pinned_at = null

  if (action === 'mark_unread') {
    const { data: messageRows } = await supabaseAdmin
      .from('messages')
      .select('id')
      .in('thread_id', threadIds)
    const messageIds = (messageRows || []).map((row) => row.id)
    if (messageIds.length > 0) {
      await supabaseAdmin
        .from('message_receipts')
        .update({ read_at: null })
        .eq('user_id', userId)
        .in('message_id', messageIds)
    }
    return NextResponse.json({ ok: true })
  }

  const { error: updateError } = await supabaseAdmin
    .from('thread_participants')
    .update(updates)
    .eq('user_id', userId)
    .in('thread_id', threadIds)

  if (updateError) {
    return jsonError(updateError.message, 500)
  }

  return NextResponse.json({ ok: true })
}
