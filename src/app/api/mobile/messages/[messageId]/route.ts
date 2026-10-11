import { NextResponse } from 'next/server'
import { mobileContractError } from '@/lib/mobileApiContract'
import { requireMobileThread, threadAudit } from '@/lib/mobileThreadManagement'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseUuid } from '@/lib/uuid'

const fail = (code: string, message: string, status: number, retryable = false) =>
  mobileContractError(code, message, status, retryable)

async function messageAccess(request: Request, rawMessageId: string) {
  const messageId = parseUuid(rawMessageId)
  if (!messageId) return { response: fail('message_unavailable', 'Message is unavailable.', 404) }
  const { data: message, error } = await supabaseAdmin.from('messages')
    .select('id,thread_id,sender_id,deleted_at')
    .eq('id', messageId).maybeSingle()
  if (error) return { response: fail('message_unavailable', 'Message is temporarily unavailable.', 503, true) }
  if (!message?.thread_id) return { response: fail('message_unavailable', 'Message is unavailable.', 404) }
  const access = await requireMobileThread(request, message.thread_id)
  if ('response' in access) return { response: access.response }
  return { message, access }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const resolved = await messageAccess(request, (await params).messageId)
  if ('response' in resolved) return resolved.response
  if (resolved.message.deleted_at) return fail('message_deleted', 'A deleted message cannot be edited.', 409)
  if (resolved.message.sender_id !== resolved.access.user.id) return fail('message_edit_denied', 'Only the sender can edit this message.', 403)
  const body = await request.json().catch(() => ({}))
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) return fail('message_content_required', 'Enter a message.', 422)
  if (content.length > 5000) return fail('message_too_long', 'The message must be 5,000 characters or fewer.', 422)
  const editedAt = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from('messages')
    .update({ body: content, content, edited_at: editedAt })
    .eq('id', resolved.message.id).is('deleted_at', null)
    .select('id,thread_id,sender_id,body,content,created_at,edited_at,deleted_at').maybeSingle()
  if (error) return fail('message_edit_failed', 'The message could not be updated.', 503, true)
  if (!data) return fail('message_changed', 'The message changed. Refresh the conversation.', 409)
  await threadAudit(resolved.access.user, resolved.access.thread, 'message.edited', { message_id: data.id })
  return NextResponse.json({ message: data }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const resolved = await messageAccess(request, (await params).messageId)
  if ('response' in resolved) return resolved.response
  if (resolved.message.deleted_at) return fail('message_deleted', 'Message is already deleted.', 409)
  const isSender = resolved.message.sender_id === resolved.access.user.id
  if (!isSender && !resolved.access.admin) return fail('message_delete_denied', 'You do not have permission to delete this message.', 403)
  const deletedAt = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from('messages')
    .update({ body: '', content: '', deleted_at: deletedAt })
    .eq('id', resolved.message.id).is('deleted_at', null)
    .select('id,thread_id,deleted_at').maybeSingle()
  if (error) return fail('message_delete_failed', 'The message could not be deleted.', 503, true)
  if (!data) return fail('message_changed', 'The message changed. Refresh the conversation.', 409)
  await threadAudit(resolved.access.user, resolved.access.thread, 'message.deleted', { message_id: data.id })
  return NextResponse.json({ message: data }, { headers: { 'Cache-Control': 'private, no-store' } })
}
