import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const isMissingParticipantPrefsColumnError = (message?: string | null) =>
  /column .* does not exist|could not find the '.*' column/i.test(String(message || ''))

const isMissingMessageColumnError = (message?: string | null) =>
  /column .* does not exist|could not find the '.*' column/i.test(String(message || ''))

type ParticipantPreferenceRow = {
  thread_id: string
  muted_at?: string | null
  archived_at?: string | null
  blocked_at?: string | null
}

type ThreadRow = {
  id: string
  title: string | null
  is_group: boolean | null
  created_at: string
}

type ParticipantRow = {
  thread_id: string
  user_id: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  email?: string | null
  role: string | null
}

type MessageRow = {
  id: string
  thread_id: string
  sender_id: string
  body?: string | null
  content?: string | null
  created_at: string
}

const loadMessagesCompat = async (threadIds: string[]) => {
  const contentAttempt = await supabaseAdmin
    .from('messages')
    .select('id, thread_id, sender_id, body, content, created_at')
    .in('thread_id', threadIds)
    .order('created_at', { ascending: false })

  if (!contentAttempt.error || !isMissingMessageColumnError(contentAttempt.error.message)) {
    return contentAttempt
  }

  return supabaseAdmin
    .from('messages')
    .select('id, thread_id, sender_id, body, created_at')
    .in('thread_id', threadIds)
    .order('created_at', { ascending: false })
}

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

const getDisplayName = (profile?: ProfileRow | null, fallback = 'Participant') => {
  const fullName = String(profile?.full_name || '').trim()
  if (fullName) return fullName
  const email = String(profile?.email || '').trim()
  if (email.includes('@')) return email.split('@')[0].trim()
  return email || fallback
}

export async function GET() {
  const { session, role, error } = await getSessionRole([
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
  if (error || !session) return error

  const currentUserId = session.user.id

  let { data: membershipRows, error: membershipError } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id, muted_at, archived_at, blocked_at')
    .eq('user_id', currentUserId)

  let participantMembershipRows = (membershipRows || []) as ParticipantPreferenceRow[]

  if (membershipError && isMissingParticipantPrefsColumnError(membershipError.message)) {
    const fallback = await supabaseAdmin
      .from('thread_participants')
      .select('thread_id')
      .eq('user_id', currentUserId)

    if (fallback.error) {
      console.error('[messages/inbox] membership fallback error:', fallback.error)
      return NextResponse.json({ error: 'Unable to load inbox' }, { status: 500 })
    }

    participantMembershipRows = ((fallback.data || []) as Array<{ thread_id: string }>).map((row) => ({
      thread_id: row.thread_id,
      muted_at: null,
      archived_at: null,
      blocked_at: null,
    }))
    membershipError = null
  }

  if (membershipError) {
    console.error('[messages/inbox] membership error:', membershipError)
    return NextResponse.json({ error: 'Unable to load inbox' }, { status: 500 })
  }

  const threadIds = Array.from(new Set(participantMembershipRows.map((row) => row.thread_id)))
  if (threadIds.length === 0) {
    return NextResponse.json({ threads: [], muted_thread_ids: [], archived_thread_ids: [], blocked_thread_ids: [] })
  }

  const [{ data: threads, error: threadsError }, { data: participants, error: participantsError }] = await Promise.all([
    supabaseAdmin
      .from('threads')
      .select('id, title, is_group, created_at')
      .in('id', threadIds)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('thread_participants')
      .select('thread_id, user_id')
      .in('thread_id', threadIds),
  ])

  if (threadsError) {
    console.error('[messages/inbox] threads error:', threadsError)
    return NextResponse.json({ error: 'Unable to load inbox' }, { status: 500 })
  }
  if (participantsError) {
    console.error('[messages/inbox] participants error:', participantsError)
    return NextResponse.json({ error: 'Unable to load inbox' }, { status: 500 })
  }

  const threadRows = (threads || []) as ThreadRow[]
  const participantRows = (participants || []) as ParticipantRow[]
  if (threadRows.length === 0) {
    return NextResponse.json({ threads: [], muted_thread_ids: [], archived_thread_ids: [], blocked_thread_ids: [] })
  }

  const participantUserIds = Array.from(new Set(participantRows.map((participant) => participant.user_id)))
  const { data: profiles, error: profilesError } = participantUserIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', participantUserIds)
    : { data: [], error: null }

  if (profilesError) {
    console.error('[messages/inbox] profiles error:', profilesError)
    return NextResponse.json({ error: 'Unable to load inbox' }, { status: 500 })
  }

  const { data: messages, error: messagesError } = await loadMessagesCompat(threadIds)

  if (messagesError) {
    console.error('[messages/inbox] messages error:', messagesError)
    return NextResponse.json({ error: 'Unable to load inbox' }, { status: 500 })
  }

  const messageRows = (messages || []) as MessageRow[]
  const messageIds = messageRows.map((message) => message.id)
  const { data: receiptRows, error: receiptsError } = messageIds.length
    ? await supabaseAdmin
        .from('message_receipts')
        .select('message_id, read_at')
        .eq('user_id', currentUserId)
        .in('message_id', messageIds)
    : { data: [], error: null }

  if (receiptsError) {
    console.error('[messages/inbox] receipts error:', receiptsError)
    return NextResponse.json({ error: 'Unable to load inbox' }, { status: 500 })
  }

  const readSet = new Set(
    ((receiptRows || []) as Array<{ message_id: string; read_at?: string | null }>)
      .filter((receipt) => receipt.read_at)
      .map((receipt) => receipt.message_id),
  )

  const profileMap = new Map<string, ProfileRow>()
  ;((profiles || []) as ProfileRow[]).forEach((profile) => profileMap.set(profile.id, profile))

  const lastMessageByThread = new Map<string, MessageRow>()
  messageRows.forEach((message) => {
    if (!lastMessageByThread.has(message.thread_id)) {
      lastMessageByThread.set(message.thread_id, message)
    }
  })

  const threadItems = threadRows.map((thread) => {
    const threadParticipants = participantRows.filter((participant) => participant.thread_id === thread.id)
    const otherParticipants = threadParticipants.filter((participant) => participant.user_id !== currentUserId)
    const otherProfiles = otherParticipants.map((participant) => profileMap.get(participant.user_id) || null)
    const otherNames = otherProfiles.map((profile) => getDisplayName(profile)).filter(Boolean)
    const otherRoles = otherProfiles.map((profile) => String(profile?.role || '').toLowerCase()).filter(Boolean)

    const lastMessage = lastMessageByThread.get(thread.id)
    const isCoachThread = otherRoles.some((participantRole) => participantRole.includes('coach'))
    const firstOtherRole = otherRoles[0] || ''
    const lastSenderName =
      lastMessage?.sender_id === currentUserId
        ? 'You'
        : getDisplayName(lastMessage?.sender_id ? profileMap.get(lastMessage.sender_id) : null)

    const name =
      (thread.is_group && thread.title) ||
      (!thread.is_group && otherNames.join(', ')) ||
      thread.title ||
      otherNames[0] ||
      'New thread'

    const tag = role === 'athlete'
      ? isCoachThread
        ? 'Coach'
        : thread.is_group
          ? 'Group'
          : firstOtherRole
            ? firstOtherRole.charAt(0).toUpperCase() + firstOtherRole.slice(1)
            : 'Direct'
      : thread.is_group
        ? (() => {
            const normalizedTitle = String(thread.title || '').toLowerCase()
            if (normalizedTitle.startsWith('org:')) return 'Org'
            if (normalizedTitle.startsWith('team:')) return 'Team'
            return 'Group'
          })()
        : firstOtherRole
          ? firstOtherRole.charAt(0).toUpperCase() + firstOtherRole.slice(1)
          : 'Direct'

    const unread = messageRows.some(
      (message) =>
        message.thread_id === thread.id &&
        message.sender_id !== currentUserId &&
        !readSet.has(message.id),
    )

    return {
      id: thread.id,
      name,
      preview: lastMessage?.body || lastMessage?.content || 'Start the conversation',
      time: formatRelativeTime(lastMessage?.created_at || thread.created_at),
      activityAt: lastMessage?.created_at || thread.created_at,
      unread,
      status: 'Active',
      tag,
      lastSender: lastSenderName,
      responseTime: role === 'athlete' && isCoachThread ? 'Responds in ~2h' : undefined,
      verified: role === 'athlete' ? isCoachThread : undefined,
    }
  })

  threadItems.sort((a, b) => new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime())

  return NextResponse.json({
    threads: threadItems,
    muted_thread_ids: participantMembershipRows.filter((row) => row.muted_at).map((row) => row.thread_id),
    archived_thread_ids: participantMembershipRows.filter((row) => row.archived_at).map((row) => row.thread_id),
    blocked_thread_ids: participantMembershipRows.filter((row) => row.blocked_at).map((row) => row.thread_id),
  })
}
