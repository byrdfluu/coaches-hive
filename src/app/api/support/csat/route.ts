import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return jsonError('Unauthorized', 401)

  const payload = await request.json().catch(() => ({}))
  const ticketId = String(payload?.ticket_id || '').trim()
  const score = Number(payload?.score)
  const comment = String(payload?.comment || '').trim()
  if (!ticketId) return jsonError('ticket_id is required')
  if (!Number.isFinite(score) || score < 1 || score > 5) return jsonError('score must be between 1 and 5')

  const { data: ticket } = await supabaseAdmin
    .from('support_tickets')
    .select('id, requester_email, metadata')
    .eq('id', ticketId)
    .maybeSingle()
  if (!ticket) return jsonError('Ticket not found', 404)

  const metadata = (ticket.metadata || {}) as Record<string, any>
  const requesterId = String(metadata.requester_id || '')
  const requesterEmail = String(ticket.requester_email || '').toLowerCase()
  const userEmail = String(session.user.email || '').toLowerCase()
  const isOwner = requesterId === session.user.id || (requesterEmail && requesterEmail === userEmail)
  if (!isOwner) return jsonError('Forbidden', 403)

  const nextMetadata = {
    ...metadata,
    csat_score: score,
    csat_comment: comment || null,
    csat_submitted_at: new Date().toISOString(),
    csat_status: 'submitted',
  }

  const { error: updateError } = await supabaseAdmin
    .from('support_tickets')
    .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
    .eq('id', ticketId)
  if (updateError) return jsonError(updateError.message, 500)

  return NextResponse.json({ ok: true })
}
