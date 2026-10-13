import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)
  const isAdminUser = resolveAdminAccess(user.user_metadata).isAdmin

  const body = await request.json().catch(() => ({}))
  const { review_id, coach_response } = body || {}
  const responseText = String(coach_response || '').trim()

  if (!review_id || !responseText) {
    return jsonError('review_id and coach_response are required')
  }
  if (responseText.length > 2_000) return jsonError('coach_response must be 2,000 characters or fewer')

  const { data: review } = await supabaseAdmin
    .from('coach_reviews')
    .select('id, coach_id')
    .eq('id', review_id)
    .maybeSingle()

  if (!review) {
    return jsonError('Review not found', 404)
  }

  if (review.coach_id !== user.id && !isAdminUser) {
    return jsonError('Forbidden', 403)
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('coach_reviews')
    .update({ coach_response: responseText, coach_response_at: new Date().toISOString() })
    .eq('id', review_id)
    .select('*')
    .single()

  if (updateError) {
    return jsonError(updateError.message, 500)
  }

  return NextResponse.json({ review: data })
}
