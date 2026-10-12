import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

const removeOwnedAttachment = async (userId: string, path: unknown) => {
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath.startsWith(`${userId}/`)) return
  await supabaseAdmin.storage.from('attachments').remove([normalizedPath])
}

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { plan_id, attachment } = body || {}

  if (!plan_id || !attachment?.path) {
    return jsonError('plan_id and attachment are required')
  }

  const attachmentPath = String(attachment.path).trim()
  if (!attachmentPath.startsWith(`${session.user.id}/`)) {
    return jsonError('Invalid attachment path', 403)
  }

  const { data: plan } = await supabaseAdmin
    .from('practice_plans')
    .select('id, coach_id')
    .eq('id', plan_id)
    .maybeSingle()

  if (!plan) {
    await removeOwnedAttachment(session.user.id, attachmentPath)
    return jsonError('Plan not found', 404)
  }

  if (role === 'coach' && plan.coach_id !== session.user.id) {
    await removeOwnedAttachment(session.user.id, attachmentPath)
    return jsonError('Forbidden', 403)
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('practice_plan_attachments')
    .insert({
      plan_id,
      file_url: '',
      file_path: attachmentPath,
      file_name: attachment.name || null,
      file_type: attachment.type || null,
      file_size: attachment.size || null,
    })
    .select('*')
    .single()

  if (insertError) {
    await removeOwnedAttachment(session.user.id, attachmentPath)
    return jsonError(insertError.message, 500)
  }

  const { data: signed } = await supabaseAdmin.storage.from('attachments').createSignedUrl(attachmentPath, 5 * 60)
  return NextResponse.json({ attachment: { ...data, file_url: signed?.signedUrl || '' } })
}

export async function DELETE(request: Request) {
  const { session, role, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const attachmentId = String((await request.json().catch(() => null))?.attachment_id || '').trim()
  if (!attachmentId) return jsonError('attachment_id is required')

  const { data: attachment, error: attachmentError } = await supabaseAdmin
    .from('practice_plan_attachments')
    .select('id,plan_id,file_path')
    .eq('id', attachmentId)
    .maybeSingle()
  if (attachmentError) return jsonError(attachmentError.message, 500)
  if (!attachment) return jsonError('Attachment not found', 404)

  const { data: plan, error: planError } = await supabaseAdmin
    .from('practice_plans')
    .select('id,coach_id')
    .eq('id', attachment.plan_id)
    .maybeSingle()
  if (planError) return jsonError(planError.message, 500)
  if (!plan || (role === 'coach' && plan.coach_id !== session.user.id)) {
    return jsonError('Attachment not found', 404)
  }

  const { error: deleteError } = await supabaseAdmin
    .from('practice_plan_attachments')
    .delete()
    .eq('id', attachment.id)
  if (deleteError) return jsonError(deleteError.message, 500)

  if (attachment.file_path) {
    const { error: removeError } = await supabaseAdmin.storage.from('attachments').remove([attachment.file_path])
    if (removeError) return jsonError(`Attachment record deleted, but file cleanup failed: ${removeError.message}`, 500)
  }
  return NextResponse.json({ deleted: true })
}
