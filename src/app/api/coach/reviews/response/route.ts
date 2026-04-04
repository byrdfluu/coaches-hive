import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error
  const isAdminUser = resolveAdminAccess(session.user.user_metadata).isAdmin

  const body = await request.json().catch(() => ({}))
  const { review_id, coach_response } = body || {}

  if (!review_id || !coach_response) {
    return jsonError('review_id and coach_response are required')
  }

  const { data: review } = await supabaseAdmin
    .from('coach_reviews')
    .select('id, coach_id')
    .eq('id', review_id)
    .maybeSingle()

  if (!review) {
    return jsonError('Review not found', 404)
  }

  if (review.coach_id !== session.user.id && !isAdminUser) {
    return jsonError('Forbidden', 403)
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('coach_reviews')
    .update({ coach_response, coach_response_at: new Date().toISOString() })
    .eq('id', review_id)
    .select('*')
    .single()

  if (updateError) {
    return jsonError(updateError.message, 500)
  }

  return NextResponse.json({ review: data })
}
