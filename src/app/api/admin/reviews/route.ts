import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
export const dynamic = 'force-dynamic'


const VALID_STATUSES = new Set(['approved', 'rejected', 'pending'])

export async function GET() {
  const { session, role, error } = await getSessionRole(['admin', 'superadmin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const { data: reviews, error: reviewError } = await supabaseAdmin
    .from('coach_reviews')
    .select('*')
    .order('created_at', { ascending: false })

  if (reviewError) {
    return jsonError(reviewError.message)
  }

  const coachIds = Array.from(new Set((reviews || []).map((row) => row.coach_id).filter(Boolean)))
  const athleteIds = Array.from(new Set((reviews || []).map((row) => row.athlete_id).filter(Boolean)))
  const profileIds = Array.from(new Set([...coachIds, ...athleteIds]))

  const { data: profiles } = profileIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', profileIds)
    : { data: [] }

  const coachMap: Record<string, { name: string; email: string }> = {}
  const athleteMap: Record<string, { name: string; email: string }> = {}
  ;(profiles || []).forEach((profile) => {
    const entry = { name: profile.full_name || 'User', email: profile.email || '' }
    if (coachIds.includes(profile.id)) coachMap[profile.id] = entry
    if (athleteIds.includes(profile.id)) athleteMap[profile.id] = entry
  })

  return NextResponse.json({ reviews: reviews || [], coaches: coachMap, athletes: athleteMap })
}

export async function PATCH(request: Request) {
  const { session, role, error } = await getSessionRole(['admin', 'superadmin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => null)
  const { review_id, review_ids, status, action } = body || {}

  if (String(action || '').toLowerCase() === 'request_docs') {
    const ids = Array.isArray(review_ids)
      ? review_ids.map((value) => String(value || '').trim()).filter(Boolean)
      : review_id
      ? [String(review_id)]
      : []
    if (!ids.length) {
      return jsonError('review_id or review_ids are required')
    }

    const { data: rows, error: reviewError } = await supabaseAdmin
      .from('coach_reviews')
      .select('id, coach_id, athlete_id, reviewer_name, rating, body, status')
      .in('id', ids)
      .eq('status', 'pending')

    if (reviewError) {
      return jsonError(reviewError.message, 500)
    }

    const reviews = rows || []
    if (!reviews.length) {
      return NextResponse.json({ ok: true, created_tickets: 0 })
    }

    const coachIds = Array.from(new Set(reviews.map((row) => row.coach_id).filter(Boolean)))
    const athleteIds = Array.from(new Set(reviews.map((row) => row.athlete_id).filter(Boolean)))
    const profileIds = Array.from(new Set([...coachIds, ...athleteIds]))

    const { data: profiles } = profileIds.length
      ? await supabaseAdmin
          .from('profiles')
          .select('id, full_name, email')
          .in('id', profileIds)
      : { data: [] }

    const profileMap = new Map(
      (profiles || []).map((profile) => [
        profile.id,
        { name: profile.full_name || profile.email || 'User', email: profile.email || '' },
      ]),
    )

    const nowIso = new Date().toISOString()
    const tickets = reviews.map((review) => {
      const coach = profileMap.get(String(review.coach_id || ''))
      const athlete = profileMap.get(String(review.athlete_id || ''))
      return {
        subject: `Review moderation docs requested: ${coach?.name || 'Coach'}`,
        status: 'open',
        priority: 'medium',
        channel: 'in_app',
        requester_name: athlete?.name || review.reviewer_name || 'Athlete',
        requester_email: athlete?.email || null,
        requester_role: 'athlete',
        assigned_to: session.user.id,
        last_message_preview: 'Request supporting context for pending review moderation.',
        last_message_at: nowIso,
        metadata: {
          source: 'admin_review_queue',
          review_id: review.id,
          coach_id: review.coach_id,
          athlete_id: review.athlete_id,
          action: 'request_docs',
        },
      }
    })

    const { data: createdTickets, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .insert(tickets)
      .select('id, metadata')

    if (ticketError) {
      return jsonError(ticketError.message, 500)
    }

    const messages = (createdTickets || []).map((ticket) => {
      const metadata = (ticket.metadata || {}) as Record<string, any>
      const review = reviews.find((row) => row.id === metadata.review_id)
      return {
        ticket_id: ticket.id,
        sender_role: 'system',
        sender_name: 'Review moderation bot',
        sender_id: session.user.id,
        body: review
          ? `Requested docs/context for review ${review.id}. Rating: ${review.rating || 0}.`
          : 'Requested docs/context for pending review moderation.',
        is_internal: true,
        metadata: {
          source: 'admin_review_queue',
          review_id: metadata.review_id || null,
        },
      }
    })

    if (messages.length) {
      await supabaseAdmin.from('support_messages').insert(messages)
    }

    await logAdminAction({
      action: 'admin.review.request_docs',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'coach_review',
      targetId: ids.join(','),
      metadata: { count: ids.length },
    })

    return NextResponse.json({ ok: true, created_tickets: createdTickets?.length || 0 })
  }

  const ids = Array.isArray(review_ids)
    ? review_ids.map((value) => String(value || '').trim()).filter(Boolean)
    : review_id
    ? [String(review_id)]
    : []

  if (!ids.length || !VALID_STATUSES.has(String(status))) {
    return jsonError('review_id or review_ids and valid status are required')
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('coach_reviews')
    .update({ status: String(status) })
    .in('id', ids)
    .select('*')

  if (updateError) {
    return jsonError(updateError.message)
  }

  await logAdminAction({
    action: 'admin.review.update',
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'coach_review',
    targetId: ids.join(','),
    metadata: { status, count: ids.length },
  })

  return NextResponse.json({
    review: data?.[0] || null,
    reviews: data || [],
    updated_count: data?.length || 0,
  })
}
