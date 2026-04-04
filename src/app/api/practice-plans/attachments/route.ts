import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { plan_id, attachment } = body || {}

  if (!plan_id || !attachment?.url) {
    return jsonError('plan_id and attachment are required')
  }

  const { data: plan } = await supabaseAdmin
    .from('practice_plans')
    .select('id, coach_id')
    .eq('id', plan_id)
    .maybeSingle()

  if (!plan) {
    return jsonError('Plan not found', 404)
  }

  if (role === 'coach' && plan.coach_id !== session.user.id) {
    return jsonError('Forbidden', 403)
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('practice_plan_attachments')
    .insert({
      plan_id,
      file_url: attachment.url,
      file_path: attachment.path || null,
      file_name: attachment.name || null,
      file_type: attachment.type || null,
      file_size: attachment.size || null,
    })
    .select('*')
    .single()

  if (insertError) {
    return jsonError(insertError.message, 500)
  }

  return NextResponse.json({ attachment: data })
}
