import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionRoleState } from '@/lib/sessionRoleState'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const loadTicketForSession = async ({
  ticketId,
  userId,
  email,
}: {
  ticketId: string
  userId: string
  email?: string | null
}) => {
  const { data: ticket, error } = await supabaseAdmin
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle()

  if (error) {
    return { ticket: null, error }
  }

  if (!ticket) {
    return { ticket: null, error: null }
  }

  const metadata = (ticket.metadata || {}) as Record<string, unknown>
  const requesterId = String(metadata.requester_id || '').trim()
  const requesterEmail = String(ticket.requester_email || '').trim().toLowerCase()
  const matchesUser =
    (requesterId && requesterId === userId)
    || (email && requesterEmail && requesterEmail === email.trim().toLowerCase())

  if (!matchesUser) {
    return { ticket: null, error: new Error('Forbidden') }
  }

  return { ticket, error: null }
}

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const { searchParams } = new URL(request.url)
  const ticketId = String(searchParams.get('ticket_id') || '').trim()
  if (!ticketId) return jsonError('ticket_id is required')

  const { ticket, error } = await loadTicketForSession({
    ticketId,
    userId: session.user.id,
    email: session.user.email,
  })

  if (error?.message === 'Forbidden') return jsonError('Forbidden', 403)
  if (error) return jsonError(error.message, 500)
  if (!ticket) return jsonError('Ticket not found', 404)

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from('support_messages')
    .select('id, ticket_id, sender_role, sender_name, body, created_at, is_internal')
    .eq('ticket_id', ticketId)
    .eq('is_internal', false)
    .order('created_at', { ascending: true })

  if (messagesError) return jsonError(messagesError.message, 500)

  return NextResponse.json({ ticket, messages: messages || [] })
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const payload = await request.json().catch(() => ({}))
  const ticketId = String(payload?.ticket_id || '').trim()
  const body = String(payload?.body || '').trim()

  if (!ticketId) return jsonError('ticket_id is required')
  if (!body) return jsonError('body is required')

  const { ticket, error } = await loadTicketForSession({
    ticketId,
    userId: session.user.id,
    email: session.user.email,
  })

  if (error?.message === 'Forbidden') return jsonError('Forbidden', 403)
  if (error) return jsonError(error.message, 500)
  if (!ticket) return jsonError('Ticket not found', 404)

  const roleState = getSessionRoleState(session.user.user_metadata)
  const senderRole = roleState.currentRole || 'member'
  const senderName =
    String(session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email || 'User').trim()

  const { data: message, error: insertError } = await supabaseAdmin
    .from('support_messages')
    .insert({
      ticket_id: ticketId,
      sender_role: senderRole,
      sender_name: senderName,
      sender_id: session.user.id,
      body,
      is_internal: false,
    })
    .select('id, ticket_id, sender_role, sender_name, body, created_at, is_internal')
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  const nextStatus = String(ticket.status || '').toLowerCase() === 'resolved' ? 'open' : ticket.status
  await supabaseAdmin
    .from('support_tickets')
    .update({
      status: nextStatus,
      last_message_preview: body.slice(0, 140),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId)

  return NextResponse.json({ message })
}
