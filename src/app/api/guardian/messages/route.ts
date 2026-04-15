import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin, hasSupabaseAdminConfig } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const formatRelativeTime = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

export async function GET() {
  const { session, error } = await getSessionRole(['guardian'])
  if (error || !session) return error

  if (!hasSupabaseAdminConfig) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const guardianId = session.user.id

  // 1. Get all linked athletes for this guardian
  const { data: links } = await supabaseAdmin
    .from('guardian_athlete_links')
    .select('athlete_id')
    .eq('guardian_user_id', guardianId)
    .eq('status', 'active')

  const athleteIds = (links || []).map((l: { athlete_id: string }) => l.athlete_id)
  if (athleteIds.length === 0) {
    return NextResponse.json({ conversations: [], athletes: [] })
  }

  // 2. Get athlete profiles
  const { data: athleteProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email')
    .in('id', athleteIds)

  const athleteMap = new Map(
    (athleteProfiles || []).map((p: { id: string; full_name: string | null; email: string | null }) => [
      p.id,
      p.full_name || p.email || 'Athlete',
    ]),
  )

  // 3. Get all thread_participants rows for linked athletes
  const { data: participantRows } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id, user_id')
    .in('user_id', athleteIds)

  const threadIds = Array.from(new Set((participantRows || []).map((r: { thread_id: string }) => r.thread_id)))
  if (threadIds.length === 0) {
    return NextResponse.json({
      conversations: [],
      athletes: athleteIds.map((id) => ({ id, name: athleteMap.get(id) || 'Athlete' })),
    })
  }

  // 4. Get thread metadata
  const { data: threads } = await supabaseAdmin
    .from('threads')
    .select('id, title, is_group, created_at')
    .in('id', threadIds)

  // 5. Get all participants in these threads to identify coaches
  const { data: allParticipants } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id, user_id')
    .in('thread_id', threadIds)

  // 6. Get last message per thread
  const { data: lastMessages } = await supabaseAdmin
    .from('messages')
    .select('id, thread_id, sender_id, body, content, created_at')
    .in('thread_id', threadIds)
    .order('created_at', { ascending: false })

  // Build a map of thread -> last message
  const lastMessageMap = new Map<string, { content: string; created_at: string; sender_id: string }>()
  for (const msg of (lastMessages || []) as Array<{
    thread_id: string
    body?: string | null
    content?: string | null
    created_at: string
    sender_id: string
  }>) {
    if (!lastMessageMap.has(msg.thread_id)) {
      lastMessageMap.set(msg.thread_id, {
        content: msg.content || msg.body || '',
        created_at: msg.created_at,
        sender_id: msg.sender_id,
      })
    }
  }

  // 7. Collect all unique participant user_ids (excluding athletes) to load profiles
  const threadAthleteMap = new Map<string, string>() // thread_id -> athlete_id
  for (const row of (participantRows || []) as Array<{ thread_id: string; user_id: string }>) {
    if (!threadAthleteMap.has(row.thread_id)) {
      threadAthleteMap.set(row.thread_id, row.user_id)
    }
  }

  const otherParticipantIds = Array.from(
    new Set(
      (allParticipants || [])
        .map((r: { user_id: string }) => r.user_id)
        .filter((id: string) => !athleteIds.includes(id) && id !== guardianId),
    ),
  )

  const { data: otherProfiles } = otherParticipantIds.length > 0
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', otherParticipantIds)
    : { data: [] }

  const profileMap = new Map(
    (otherProfiles || []).map((p: { id: string; full_name: string | null; email: string | null; role: string | null }) => [
      p.id,
      { name: p.full_name || p.email || 'Participant', role: p.role },
    ]),
  )

  // 8. Build conversation list
  const threadMap = new Map(
    (threads || []).map((t: { id: string; title: string | null; is_group: boolean | null; created_at: string }) => [t.id, t]),
  )

  const participantsByThread = new Map<string, string[]>()
  for (const row of (allParticipants || []) as Array<{ thread_id: string; user_id: string }>) {
    const existing = participantsByThread.get(row.thread_id) || []
    existing.push(row.user_id)
    participantsByThread.set(row.thread_id, existing)
  }

  const conversations = threadIds
    .map((threadId) => {
      const thread = threadMap.get(threadId)
      if (!thread) return null
      const athleteId = threadAthleteMap.get(threadId) || ''
      const athleteName = athleteMap.get(athleteId) || 'Athlete'
      const otherIds = (participantsByThread.get(threadId) || []).filter(
        (id) => !athleteIds.includes(id) && id !== guardianId,
      )
      const otherNames = otherIds
        .map((id) => profileMap.get(id)?.name || 'Participant')
        .join(', ')
      const lastMsg = lastMessageMap.get(threadId)
      return {
        thread_id: threadId,
        athlete_id: athleteId,
        athlete_name: athleteName,
        other_participant_names: otherNames || 'No participants',
        last_message: lastMsg?.content || '',
        last_message_at: lastMsg?.created_at || thread.created_at,
        time: formatRelativeTime(lastMsg?.created_at || thread.created_at),
        is_group: thread.is_group || false,
      }
    })
    .filter(Boolean)
    .sort((a, b) =>
      new Date(b!.last_message_at).getTime() - new Date(a!.last_message_at).getTime(),
    )

  return NextResponse.json({
    conversations,
    athletes: athleteIds.map((id) => ({ id, name: athleteMap.get(id) || 'Athlete' })),
  })
}