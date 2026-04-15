import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin, hasSupabaseAdminConfig } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['guardian'])
  if (error || !session) return error

  if (!hasSupabaseAdminConfig) return jsonError('Service unavailable', 503)

  const { searchParams } = new URL(request.url)
  const threadId = searchParams.get('thread_id')?.trim() || ''

  if (!threadId) return jsonError('thread_id is required', 400)

  const guardianId = session.user.id

  // Verify guardian is linked to an athlete in this thread
  const { data: threadParticipants } = await supabaseAdmin
    .from('thread_participants')
    .select('user_id')
    .eq('thread_id', threadId)

  const participantIds = (threadParticipants || []).map((r: { user_id: string }) => r.user_id)

  const { data: links } = await supabaseAdmin
    .from('guardian_athlete_links')
    .select('athlete_id')
    .eq('guardian_user_id', guardianId)
    .eq('status', 'active')
    .in('athlete_id', participantIds.length > 0 ? participantIds : ['__none__'])

  if (!links || links.length === 0) {
    return jsonError('Forbidden', 403)
  }

  // Load messages
  const { data: messages, error: msgError } = await supabaseAdmin
    .from('messages')
    .select('id, thread_id, sender_id, body, content, created_at, edited_at, deleted_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (msgError) return jsonError('Unable to load messages', 500)

  // Load sender profiles
  const senderIds = Array.from(
    new Set((messages || []).map((m: { sender_id: string }) => m.sender_id)),
  )
  const { data: profiles } = senderIds.length > 0
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', senderIds)
    : { data: [] }

  const profileMap = new Map(
    (profiles || []).map((p: { id: string; full_name: string | null; email: string | null; role: string | null }) => [
      p.id,
      { name: p.full_name || p.email || 'Participant', role: p.role },
    ]),
  )

  const formatted = (messages || []).map(
    (m: {
      id: string
      thread_id: string
      sender_id: string
      body?: string | null
      content?: string | null
      created_at: string
      edited_at?: string | null
      deleted_at?: string | null
    }) => ({
      id: m.id,
      thread_id: m.thread_id,
      sender_id: m.sender_id,
      sender_name: profileMap.get(m.sender_id)?.name || 'Participant',
      sender_role: profileMap.get(m.sender_id)?.role || null,
      content: m.deleted_at ? '[Message deleted]' : (m.content || m.body || ''),
      created_at: m.created_at,
      edited_at: m.edited_at || null,
      deleted: Boolean(m.deleted_at),
      is_guardian: m.sender_id === guardianId,
    }),
  )

  return NextResponse.json({ messages: formatted, thread_id: threadId })
}