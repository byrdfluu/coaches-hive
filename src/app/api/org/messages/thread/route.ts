import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
] as const

const getOrgMembership = async (userId: string) => {
  return supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .maybeSingle()
}

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const membership = await getOrgMembership(session.user.id)
  const orgId = membership.data?.org_id
  const role = membership.data?.role
  if (!orgId) {
    return jsonError('No organization found', 404)
  }

  if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
    return jsonError('Forbidden', 403)
  }

  const url = new URL(request.url)
  const threadId = url.searchParams.get('thread_id')

  if (!threadId) {
    return jsonError('thread_id is required')
  }

  const { data: orgMembers } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId)

  const memberIdSet = new Set((orgMembers || []).map((row) => row.user_id))

  const { data: participantRows } = await supabaseAdmin
    .from('thread_participants')
    .select('user_id')
    .eq('thread_id', threadId)

  const participantIds = (participantRows || []).map((row) => row.user_id)
  if (participantIds.length === 0) {
    return jsonError('Thread not found', 404)
  }

  if (!participantIds.every((id) => memberIdSet.has(id))) {
    return jsonError('Forbidden', 403)
  }

  const { data: messageRows } = await supabaseAdmin
    .from('messages')
    .select('id, sender_id, body, content, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  const messageIds = Array.from(new Set((messageRows || []).map((message) => message.id)))
  const { data: attachmentRows } = messageIds.length
    ? await supabaseAdmin
        .from('message_attachments')
        .select('message_id, file_url, file_name')
        .in('message_id', messageIds)
    : { data: [] }
  const attachmentMap = new Map<string, Array<{ url: string; name: string }>>()
  ;(attachmentRows || []).forEach((row: { message_id?: string | null; file_url?: string | null; file_name?: string | null }) => {
    if (!row.message_id || !row.file_url) return
    const list = attachmentMap.get(row.message_id) || []
    list.push({
      url: row.file_url,
      name: row.file_name || 'Attachment',
    })
    attachmentMap.set(row.message_id, list)
  })

  const senderIds = Array.from(new Set((messageRows || []).map((message) => message.sender_id)))
  const { data: senders } = senderIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', senderIds)
    : { data: [] }

  const senderMap = new Map<string, { full_name?: string | null; email?: string | null }>()
  ;(senders || []).forEach((sender) => senderMap.set(sender.id, sender))

  const messages = (messageRows || []).map((message) => ({
    id: message.id,
    sender_id: message.sender_id,
    sender_name: senderMap.get(message.sender_id)?.full_name || senderMap.get(message.sender_id)?.email || 'User',
    body: message.body || message.content || '',
    created_at: message.created_at,
    attachments: attachmentMap.get(message.id) || [],
  }))

  return NextResponse.json({ messages })
}
