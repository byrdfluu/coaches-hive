import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


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
  const { message_ids = [], receipt = 'read' } = body || {}

  if (!Array.isArray(message_ids) || message_ids.length === 0) {
    return jsonError('message_ids are required')
  }

  const userId = session.user.id

  const { data: messageRows } = await supabaseAdmin
    .from('messages')
    .select('id, thread_id')
    .in('id', message_ids)

  if (!messageRows || messageRows.length === 0) {
    return NextResponse.json({ updated: 0 })
  }

  const threadIds = Array.from(new Set(messageRows.map((row) => row.thread_id)))
  const { data: membershipRows } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id')
    .eq('user_id', userId)
    .in('thread_id', threadIds)

  const allowedThreads = new Set((membershipRows || []).map((row) => row.thread_id))
  const allowedMessageIds = messageRows
    .filter((row) => allowedThreads.has(row.thread_id))
    .map((row) => row.id)

  if (allowedMessageIds.length === 0) {
    return jsonError('Not authorized for these messages', 403)
  }

  const now = new Date().toISOString()
  const updates = allowedMessageIds.map((messageId) => {
    const record: {
      message_id: string
      user_id: string
      delivered_at: string
      read_at?: string
      updated_at: string
    } = {
      message_id: messageId,
      user_id: userId,
      delivered_at: now,
      updated_at: now,
    }

    if (receipt === 'read') {
      record.read_at = now
    }

    return record
  })

  const { error: upsertError } = await supabaseAdmin
    .from('message_receipts')
    .upsert(updates, { onConflict: 'message_id,user_id' })

  if (upsertError) {
    return jsonError(upsertError.message, 500)
  }

  return NextResponse.json({ updated: allowedMessageIds.length })
}
