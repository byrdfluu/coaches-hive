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
  const { thread_id: threadId, action } = body || {}

  if (!threadId || typeof threadId !== 'string') {
    return jsonError('thread_id is required')
  }

  if (!action || !allowedActions.has(action)) {
    return jsonError('Invalid action')
  }

  const userId = session.user.id

  const { data: membership } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership) {
    return jsonError('Not authorized for this thread', 403)
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
      .eq('thread_id', threadId)
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
    .eq('thread_id', threadId)
    .eq('user_id', userId)

  if (updateError) {
    return jsonError(updateError.message, 500)
  }

  return NextResponse.json({ ok: true })
}
