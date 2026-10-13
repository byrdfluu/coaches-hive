import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { insertNotifications } from '@/lib/inAppNotifications'
import { isPushEnabled } from '@/lib/notificationPrefs'

export const dynamic = 'force-dynamic'

const REVIEW_SELECT =
  'id,coach_id,athlete_id,reviewer_name,rating,body,status,verified,coach_response,coach_response_at,created_at'

const parseReviewInput = (body: Record<string, unknown> | null) => {
  const rating = Number(body?.rating)
  const reviewBody = String(body?.body ?? '').trim()
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: jsonError('rating must be an integer from 1 to 5') }
  }
  if (!reviewBody) return { error: jsonError('body is required') }
  if (reviewBody.length > 2_000) return { error: jsonError('body must be 2,000 characters or fewer') }
  return { rating, reviewBody, error: null }
}

async function currentUser(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return { user: null, error: jsonError('Unauthorized', 401) }
  return { user, error: null }
}

export async function GET(request: Request) {
  const { user, error } = await currentUser(request)
  if (error || !user) return error
  const coachId = new URL(request.url).searchParams.get('coach_id')?.trim()

  let query = supabaseAdmin
    .from('coach_reviews')
    .select(REVIEW_SELECT)
    .eq('athlete_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
  if (coachId) query = query.eq('coach_id', coachId)
  const { data, error: dbError } = await query

  if (dbError) return jsonError(dbError.message, 500)
  return NextResponse.json(
    { review: data?.[0] || null },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  )
}

export async function POST(request: Request) {
  const { user, error } = await currentUser(request)
  if (error || !user) return error
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const coachId = String(body?.coach_id ?? '').trim()
  const parsed = parseReviewInput(body)
  if (parsed.error) return parsed.error
  if (!coachId) return jsonError('coach_id is required')

  const nowIso = new Date().toISOString()
  const { data: completedSessions } = await supabaseAdmin
    .from('sessions')
    .select('id')
    .eq('coach_id', coachId)
    .eq('athlete_id', user.id)
    .neq('status', 'Canceled')
    .or(`end_time.lt.${nowIso},and(end_time.is.null,start_time.lt.${nowIso})`)
    .limit(1)

  if (!completedSessions?.length) {
    return jsonError('Reviews can only be submitted after a completed session.', 409)
  }

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from('coach_reviews')
    .select('id')
    .eq('coach_id', coachId)
    .eq('athlete_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
  if (existingError) return jsonError(existingError.message, 500)

  if (existingRows?.[0]?.id) {
    const { data, error: updateError } = await supabaseAdmin
      .from('coach_reviews')
      .update({ rating: parsed.rating, body: parsed.reviewBody, status: 'pending', verified: true })
      .eq('id', existingRows[0].id)
      .eq('athlete_id', user.id)
      .select(REVIEW_SELECT)
      .single()
    if (updateError) return jsonError(updateError.message, 500)
    return NextResponse.json({ review: data, created: false })
  }

  const [{ data: reviewerProfile }, { data: reviewerAthlete }] = await Promise.all([
    supabaseAdmin.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabaseAdmin.from('athlete_profiles').select('id,full_name').eq('owner_user_id', user.id)
      .eq('status', 'active').order('is_primary', { ascending: false }).limit(1).maybeSingle(),
  ])
  const reviewerName = String(reviewerAthlete?.full_name || reviewerProfile?.full_name || '').trim() || 'An athlete'
  const { data, error: insertError } = await supabaseAdmin
    .from('coach_reviews')
    .insert({
      coach_id: coachId,
      athlete_id: user.id,
      reviewer_name: reviewerName,
      rating: parsed.rating,
      body: parsed.reviewBody,
      status: 'pending',
      verified: true,
    })
    .select(REVIEW_SELECT)
    .single()
  if (insertError) return jsonError(insertError.message, 500)

  const { data: prefsRow } = await supabaseAdmin
    .from('profiles').select('notification_prefs').eq('id', coachId).maybeSingle()
  if (isPushEnabled(prefsRow?.notification_prefs, 'reviews')) {
    await insertNotifications({
      user_id: coachId,
      type: 'review_submitted',
      title: 'New review submitted',
      body: `${reviewerName} left a ${parsed.rating}/5 review.`,
      action_url: '/coach/profile',
      data: {
        review_id: data.id, record_id: data.id, category: 'Reviews', actor_user_id: user.id,
        actor_name: reviewerName, subject_user_id: user.id, subject_name: reviewerName,
        athlete_profile_id: reviewerAthlete?.id || null,
      },
    })
  }

  return NextResponse.json({ review: data, created: true }, { status: 201 })
}

export async function PATCH(request: Request) {
  const { user, error } = await currentUser(request)
  if (error || !user) return error
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const reviewId = String(body?.review_id ?? '').trim()
  const parsed = parseReviewInput(body)
  if (parsed.error) return parsed.error
  if (!reviewId) return jsonError('review_id is required')

  const { data, error: updateError } = await supabaseAdmin
    .from('coach_reviews')
    .update({ rating: parsed.rating, body: parsed.reviewBody, status: 'pending', verified: true })
    .eq('id', reviewId)
    .eq('athlete_id', user.id)
    .select(REVIEW_SELECT)
    .maybeSingle()
  if (updateError) return jsonError(updateError.message, 500)
  if (!data) return jsonError('Review not found', 404)
  return NextResponse.json({ review: data })
}

export async function DELETE(request: Request) {
  const { user, error } = await currentUser(request)
  if (error || !user) return error
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const reviewId = String(body?.review_id ?? '').trim()
  if (!reviewId) return jsonError('review_id is required')

  const { data, error: deleteError } = await supabaseAdmin
    .from('coach_reviews')
    .delete()
    .eq('id', reviewId)
    .eq('athlete_id', user.id)
    .select('id')
    .maybeSingle()
  if (deleteError) return jsonError(deleteError.message, 500)
  if (!data) return jsonError('Review not found', 404)
  return NextResponse.json({ ok: true, deleted_id: data.id })
}
