import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isPushEnabled } from '@/lib/notificationPrefs'
export const dynamic = 'force-dynamic'


export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const { coach_id, rating, body: reviewBody, reviewer_name } = body || {}

  if (!coach_id || !rating || !reviewBody) {
    return jsonError('coach_id, rating, and body are required')
  }

  const nowIso = new Date().toISOString()
  const { data: completedSessions } = await supabaseAdmin
    .from('sessions')
    .select('id, status, end_time, start_time')
    .eq('coach_id', coach_id)
    .eq('athlete_id', session.user.id)
    .neq('status', 'Canceled')
    .or(`end_time.lt.${nowIso},and(end_time.is.null,start_time.lt.${nowIso})`)

  if (!completedSessions || completedSessions.length === 0) {
    return jsonError('Reviews can only be submitted after a completed, paid session.', 409)
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('coach_reviews')
    .insert({
      coach_id,
      athlete_id: session.user.id,
      reviewer_name: reviewer_name || null,
      rating,
      body: reviewBody,
      status: 'pending',
      verified: true,
    })
    .select('*')
    .single()

  if (insertError) {
    return jsonError(insertError.message)
  }

  const { data: prefsRow } = await supabaseAdmin
    .from('profiles')
    .select('notification_prefs')
    .eq('id', coach_id)
    .maybeSingle()
  if (isPushEnabled(prefsRow?.notification_prefs, 'reviews')) {
    await supabaseAdmin.from('notifications').insert({
      user_id: coach_id,
      type: 'review_submitted',
      title: 'New review submitted',
      body: `${reviewer_name || 'An athlete'} left a ${rating}/5 review.`,
      action_url: '/coach/profile',
      data: { review_id: data.id, category: 'Reviews' },
    })
  }

  return NextResponse.json({ review: data })
}
