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

const isMissingMessageColumnError = (message?: string | null) =>
  /column .* does not exist|could not find the '.*' column/i.test(String(message || ''))

const isMissingRelationError = (message?: string | null) =>
  /relation .* does not exist|table .* does not exist/i.test(String(message || ''))

type MessageRow = {
  id: string
  thread_id: string
  sender_id: string
  body?: string | null
  content?: string | null
  created_at: string
  edited_at?: string | null
  deleted_at?: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email?: string | null
  role?: string | null
}

const getDisplayName = (profile?: ProfileRow | null, fallback = 'Participant') => {
  const fullName = String(profile?.full_name || '').trim()
  if (fullName) return fullName
  const email = String(profile?.email || '').trim()
  if (email.includes('@')) return email.split('@')[0].trim()
  return email || fallback
}

const loadMessagesCompat = async (
  threadIds: string[],
  { limit, before }: { limit: number; before?: string | null },
) => {
  const buildQuery = (selectClause: string) => {
    let query = supabaseAdmin
      .from('messages')
      .select(selectClause)
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false })
      .limit(limit + 1)

    if (before) {
      query = query.lt('created_at', before)
    }

    return query
  }

  const fullAttempt = await buildQuery('id, thread_id, sender_id, body, content, created_at, edited_at, deleted_at')

  if (!fullAttempt.error) {
    return fullAttempt
  }

  if (!isMissingMessageColumnError(fullAttempt.error.message)) {
    return fullAttempt
  }

  const bodyContentAttempt = await buildQuery('id, thread_id, sender_id, body, content, created_at')

  if (!bodyContentAttempt.error || !isMissingMessageColumnError(bodyContentAttempt.error.message)) {
    return bodyContentAttempt
  }

  return buildQuery('id, thread_id, sender_id, body, created_at')
}

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(ALLOWED_ROLES)
  if (error || !session) return error

  const { searchParams } = new URL(request.url)
  const threadIds = Array.from(
    new Set(
      (searchParams.get('thread_ids') || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  )
  const parsedLimit = Number.parseInt(searchParams.get('limit') || '50', 10)
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 50)
    : 50
  const before = searchParams.get('before')

  if (threadIds.length === 0) {
    return jsonError('thread_ids is required', 400)
  }

  const currentUserId = session.user.id
  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id')
    .eq('user_id', currentUserId)
    .in('thread_id', threadIds)

  if (membershipError) {
    return jsonError('Unable to load conversation', 500)
  }

  const allowedThreadIds = Array.from(new Set((memberships || []).map((row) => row.thread_id).filter(Boolean)))
  if (allowedThreadIds.length === 0) {
    return NextResponse.json({ messages: [], participants: [], thread_ids: [] })
  }

  const { data: messages, error: messagesError } = await loadMessagesCompat(allowedThreadIds, { limit, before })
  if (messagesError) {
    return jsonError('Unable to load conversation', 500)
  }

  const messageRowsDesc = (messages || []) as MessageRow[]
  const hasMore = messageRowsDesc.length > limit
  const visibleMessageRowsDesc = hasMore ? messageRowsDesc.slice(0, limit) : messageRowsDesc
  const messageRows = [...visibleMessageRowsDesc].reverse()
  const senderIds = Array.from(new Set(messageRows.map((message) => message.sender_id).filter(Boolean)))
  const participantRows = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id, user_id')
    .in('thread_id', allowedThreadIds)

  if (participantRows.error) {
    return jsonError('Unable to load conversation', 500)
  }

  const participantIds = Array.from(
    new Set(((participantRows.data || []) as Array<{ thread_id: string; user_id: string }>).map((row) => row.user_id)),
  )
  const profileIds = Array.from(new Set([...senderIds, ...participantIds]))
  const { data: profiles, error: profilesError } = profileIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', profileIds)
    : { data: [], error: null }

  if (profilesError) {
    return jsonError('Unable to load conversation', 500)
  }

  const messageIds = messageRows.map((message) => message.id)
  let attachmentRows:
    | Array<{
        message_id: string
        file_url: string
        file_name?: string | null
        file_type?: string | null
        file_size?: number | null
      }>
    | null = []

  if (messageIds.length) {
    const attachmentResult = await supabaseAdmin
      .from('message_attachments')
      .select('message_id, file_url, file_name, file_type, file_size')
      .in('message_id', messageIds)

    if (attachmentResult.error && !isMissingRelationError(attachmentResult.error.message)) {
      console.error('[messages/conversation] attachment load error:', attachmentResult.error)
      attachmentRows = []
    } else {
      attachmentRows = (attachmentResult.data || []) as typeof attachmentRows
    }
  }

  let receiptRows:
    | Array<{
        message_id: string
        delivered_at?: string | null
        read_at?: string | null
        user_id?: string | null
      }>
    | null = []

  if (messageIds.length) {
    const receiptResult = await supabaseAdmin
      .from('message_receipts')
      .select('message_id, delivered_at, read_at, user_id')
      .in('message_id', messageIds)

    if (receiptResult.error && !isMissingRelationError(receiptResult.error.message)) {
      console.error('[messages/conversation] receipt load error:', receiptResult.error)
      receiptRows = []
    } else {
      receiptRows = (receiptResult.data || []) as typeof receiptRows
    }
  }

  const profileMap = new Map<string, ProfileRow>()
  ;((profiles || []) as ProfileRow[]).forEach((profile) => profileMap.set(profile.id, profile))

  const attachmentMap = new Map<string, Array<{
    url: string
    name: string
    type?: string
    size?: number
  }>>()

  ;((attachmentRows || []) as Array<{
    message_id: string
    file_url: string
    file_name?: string | null
    file_type?: string | null
    file_size?: number | null
  }>).forEach((row) => {
    const list = attachmentMap.get(row.message_id) || []
    list.push({
      url: row.file_url,
      name: row.file_name || 'Attachment',
      type: row.file_type || undefined,
      size: row.file_size || undefined,
    })
    attachmentMap.set(row.message_id, list)
  })

  const receiptMap = new Map<string, { delivered: boolean; read: boolean }>()
  ;((receiptRows || []) as Array<{
    message_id: string
    delivered_at?: string | null
    read_at?: string | null
    user_id?: string | null
  }>).forEach((receipt) => {
    if (receipt.user_id === currentUserId) return
    const existing = receiptMap.get(receipt.message_id) || { delivered: false, read: false }
    if (receipt.delivered_at) existing.delivered = true
    if (receipt.read_at) existing.read = true
    receiptMap.set(receipt.message_id, existing)
  })

  const participants = participantIds
    .filter((participantId) => participantId !== currentUserId)
    .map((participantId) => {
      const profile = profileMap.get(participantId)
      return {
        id: participantId,
        name: getDisplayName(profile, `User ${participantId.slice(0, 6)}`),
        role: profile?.role || null,
      }
    })

  return NextResponse.json({
    thread_ids: allowedThreadIds,
    participants,
    has_more: hasMore,
    messages: messageRows.map((message) => {
      const isOwn = message.sender_id === currentUserId
      const receiptStatus = receiptMap.get(message.id)
      return {
        id: message.id,
        thread_id: message.thread_id,
        sender_id: message.sender_id,
        sender_name: isOwn ? 'You' : getDisplayName(profileMap.get(message.sender_id), `User ${message.sender_id.slice(0, 6)}`),
        sender_role: profileMap.get(message.sender_id)?.role || null,
        content: message.body || message.content || '',
        created_at: message.created_at,
        edited_at: message.edited_at || null,
        deleted_at: message.deleted_at || null,
        attachments: attachmentMap.get(message.id) || [],
        status: isOwn
          ? receiptStatus?.read
            ? 'Read'
            : receiptStatus?.delivered
              ? 'Delivered'
              : 'Sent'
          : null,
      }
    }),
  })
}
