import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { insertNotifications } from '@/lib/inAppNotifications'
import { isPushEnabled } from '@/lib/notificationPrefs'
export const dynamic = 'force-dynamic'


export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const { coach_id, rating, body: reviewBody } = body || {}

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

  const [{ data: reviewerProfile }, { data: reviewerAthlete }] = await Promise.all([
    supabaseAdmin.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle(),
    supabaseAdmin.from('athlete_profiles').select('id,full_name').eq('owner_user_id', session.user.id)
      .eq('status', 'active').order('is_primary', { ascending: false }).limit(1).maybeSingle(),
  ])
  const reviewerName = String(reviewerAthlete?.full_name || reviewerProfile?.full_name || '').trim() || 'An athlete'
  const { data, error: insertError } = await supabaseAdmin
    .from('coach_reviews')
    .insert({
      coach_id,
      athlete_id: session.user.id,
      reviewer_name: reviewerName,
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
    await insertNotifications({
      user_id: coach_id,
      type: 'review_submitted',
      title: 'New review submitted',
      body: `${reviewerName} left a ${rating}/5 review.`,
      action_url: '/coach/profile',
      data: { review_id: data.id, record_id: data.id, category: 'Reviews', actor_user_id: session.user.id,
        actor_name: reviewerName, subject_user_id: session.user.id, subject_name: reviewerName,
        athlete_profile_id: reviewerAthlete?.id || null },
    })
  }

  return NextResponse.json({ review: data })
}
