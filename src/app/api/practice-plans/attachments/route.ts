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
