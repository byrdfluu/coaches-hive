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

const ORG_ADMIN_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

const isMissingMessageColumnError = (message?: string | null) =>
  /column .* does not exist|could not find the '.*' column/i.test(String(message || ''))

const updateMessageCompat = async (id: string, newBody: string) => {
  const editedAt = new Date().toISOString()

  const bothAttempt = await supabaseAdmin
    .from('messages')
    .update({ body: newBody, content: newBody, edited_at: editedAt })
    .eq('id', id)
    .select('id, body, content, edited_at')
    .single()

  if (!bothAttempt.error || !isMissingMessageColumnError(bothAttempt.error.message)) {
    return bothAttempt
  }

  const contentAttempt = await supabaseAdmin
    .from('messages')
    .update({ content: newBody, edited_at: editedAt })
    .eq('id', id)
    .select('id, content, edited_at')
    .single()

  if (!contentAttempt.error || !isMissingMessageColumnError(contentAttempt.error.message)) {
    return contentAttempt
  }

  return supabaseAdmin
    .from('messages')
    .update({ body: newBody, edited_at: editedAt })
    .eq('id', id)
    .select('id, body, edited_at')
    .single()
}

const deleteMessageCompat = async (id: string) => {
  const deletedAt = new Date().toISOString()

  const bothAttempt = await supabaseAdmin
    .from('messages')
    .update({ deleted_at: deletedAt, body: '', content: '' })
    .eq('id', id)
    .select('id, deleted_at')
    .single()

  if (!bothAttempt.error || !isMissingMessageColumnError(bothAttempt.error.message)) {
    return bothAttempt
  }

  const contentAttempt = await supabaseAdmin
    .from('messages')
    .update({ deleted_at: deletedAt, content: '' })
    .eq('id', id)
    .select('id, deleted_at')
    .single()

  if (!contentAttempt.error || !isMissingMessageColumnError(contentAttempt.error.message)) {
    return contentAttempt
  }

  return supabaseAdmin
    .from('messages')
    .update({ deleted_at: deletedAt, body: '' })
    .eq('id', id)
    .select('id, deleted_at')
    .single()
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { session, error: authError } = await getSessionRole(ALLOWED_ROLES)
  if (authError || !session) return authError

  const { id } = params
  if (!id) return jsonError('Message id is required')

  const body = await request.json().catch(() => null)
  const newBody = typeof body?.body === 'string' ? body.body.trim() : null
  if (!newBody) return jsonError('body is required')

  const { data: message, error: fetchError } = await supabaseAdmin
    .from('messages')
    .select('id, sender_id, deleted_at')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !message) return jsonError('Message not found', 404)
  if (message.deleted_at) return jsonError('Cannot edit a deleted message', 400)
  if (message.sender_id !== session.user.id) return jsonError('Forbidden', 403)

  const { data: updated, error: updateError } = await updateMessageCompat(id, newBody)

  if (updateError) {
    console.error('[messages/id] update error:', updateError.message)
    return jsonError('Unable to update message. Please try again.', 500)
  }

  return NextResponse.json(updated)
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { session, role, error: authError } = await getSessionRole(ALLOWED_ROLES)
  if (authError || !session) return authError

  const { id } = params
  if (!id) return jsonError('Message id is required')

  const { data: message, error: fetchError } = await supabaseAdmin
    .from('messages')
    .select('id, sender_id, thread_id, deleted_at')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !message) return jsonError('Message not found', 404)
  if (message.deleted_at) return jsonError('Message already deleted', 400)

  const isSender = message.sender_id === session.user.id

  if (!isSender) {
    // Org admins can delete messages in threads where all participants belong to their org.
    if (!role || !ORG_ADMIN_ROLES.has(role)) return jsonError('Forbidden', 403)

    const { data: membership } = await supabaseAdmin
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
      .maybeSingle()

    const orgId = membership?.org_id
    if (!orgId) return jsonError('Forbidden', 403)

    const { data: participants } = await supabaseAdmin
      .from('thread_participants')
      .select('user_id')
      .eq('thread_id', message.thread_id)

    const participantIds = (participants || []).map((row) => row.user_id)
    if (participantIds.length === 0) return jsonError('Forbidden', 403)

    const { data: memberships } = await supabaseAdmin
      .from('organization_memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .in('user_id', participantIds)

    const orgMemberIds = new Set((memberships || []).map((row) => row.user_id))
    const allInOrg = participantIds.every((pid) => orgMemberIds.has(pid))
    if (!allInOrg) return jsonError('Forbidden', 403)
  }

  const { data: deleted, error: deleteError } = await deleteMessageCompat(id)

  if (deleteError) return jsonError(deleteError.message, 500)

  return NextResponse.json(deleted)
}
