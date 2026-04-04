import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = [
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
]

export async function GET(request: Request) {
  const { session, error: authError } = await getSessionRole(ALLOWED_ROLES)
  if (authError || !session) return authError

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  if (q.length < 2) return jsonError('Query must be at least 2 characters')

  const userId = session.user.id

  // Fetch thread IDs the user participates in.
  const { data: participantRows } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id')
    .eq('user_id', userId)

  const threadIds = (participantRows || []).map((row) => row.thread_id)
  if (threadIds.length === 0) {
    return NextResponse.json({ results: [] })
  }

  // Search message bodies.
  const { data: messages, error: searchError } = await supabaseAdmin
    .from('messages')
    .select('id, thread_id, sender_id, content, created_at')
    .in('thread_id', threadIds)
    .ilike('content', `%${q}%`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(30)

  if (searchError) return jsonError(searchError.message, 500)
  if (!messages || messages.length === 0) {
    return NextResponse.json({ results: [] })
  }

  // Resolve sender names.
  const senderIds = Array.from(new Set(messages.map((m) => m.sender_id).filter(Boolean)))
  const { data: profiles } = senderIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', senderIds)
    : { data: [] }
  const senderMap = new Map<string, string>()
  ;(profiles || []).forEach((p: { id: string; full_name: string | null }) => {
    if (p.full_name) senderMap.set(p.id, p.full_name)
  })

  // Resolve thread titles.
  const uniqueThreadIds = Array.from(new Set(messages.map((m) => m.thread_id)))
  const { data: threads } = await supabaseAdmin
    .from('threads')
    .select('id, title')
    .in('id', uniqueThreadIds)
  const threadTitleMap = new Map<string, string>()
  ;(threads || []).forEach((t: { id: string; title: string | null }) => {
    threadTitleMap.set(t.id, t.title || 'Conversation')
  })

  const lowerQ = q.toLowerCase()
  const results = messages.map((m) => {
    const body = m.content || ''
    const matchIndex = body.toLowerCase().indexOf(lowerQ)
    const start = Math.max(0, matchIndex - 40)
    const snippet = (start > 0 ? '…' : '') + body.slice(start, matchIndex + q.length + 40) + (start + matchIndex + q.length + 40 < body.length ? '…' : '')
    return {
      message_id: m.id,
      thread_id: m.thread_id,
      thread_name: threadTitleMap.get(m.thread_id) || 'Conversation',
      body_snippet: snippet,
      sender_name: senderMap.get(m.sender_id) || 'Unknown',
      created_at: m.created_at,
    }
  })

  return NextResponse.json({ results })
}
