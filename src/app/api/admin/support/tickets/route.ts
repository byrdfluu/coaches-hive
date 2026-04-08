import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSlaDueAt, getSlaMinutes } from '@/lib/supportSla'
import { suggestTemplateId } from '@/lib/supportTemplates'
import { queueOperationTaskSafely } from '@/lib/operations'
import { resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireAdmin = async () => {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { error: jsonError('Unauthorized', 401) }
  }
  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (
    adminAccess.teamRole !== 'support'
    && adminAccess.teamRole !== 'ops'
    && adminAccess.teamRole !== 'finance'
    && adminAccess.teamRole !== 'superadmin'
  ) {
    return { error: jsonError('Forbidden', 403) }
  }
  return { session }
}

export async function GET(request: Request) {
  const { error } = await requireAdmin()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const channel = searchParams.get('channel')

  let query = supabaseAdmin
    .from('support_tickets')
    .select('*')
    .order('last_message_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }
  if (channel && channel !== 'all') {
    query = query.eq('channel', channel)
  }

  const { data, error: queryError } = await query
  if (queryError) return jsonError(queryError.message, 500)

  return NextResponse.json({ tickets: data || [] })
}

export async function POST(request: Request) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const payload = await request.json().catch(() => ({}))
  const {
    subject,
    message,
    channel = 'in_app',
    requester_name,
    requester_email,
    requester_role,
    org_name,
    team_name,
    priority = 'medium',
    requester_id,
  } = payload || {}

  if (!subject) return jsonError('subject is required')

  const now = new Date().toISOString()
  const slaMinutes = getSlaMinutes(priority)
  const slaDueAt = getSlaDueAt(now, priority)
  const suggestedTemplate = suggestTemplateId(subject, message || '')
  let resolvedRequesterId = requester_id as string | undefined
  if (!resolvedRequesterId && requester_email) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', requester_email)
      .maybeSingle()
    resolvedRequesterId = profile?.id || undefined
  }

  const { data: ticket, error: insertError } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      subject,
      status: 'open',
      priority,
      channel,
      requester_name,
      requester_email,
      requester_role,
      org_name,
      team_name,
      assigned_to: session?.user.id ?? null,
      last_message_preview: message ? String(message).slice(0, 140) : null,
      last_message_at: message ? now : null,
      sla_minutes: slaMinutes,
      sla_due_at: slaDueAt,
      metadata: { suggested_template: suggestedTemplate, requester_id: resolvedRequesterId || null },
    })
    .select('*')
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  if (message) {
    await supabaseAdmin.from('support_messages').insert({
      ticket_id: ticket.id,
      sender_role: 'user',
      sender_name: requester_name || requester_email || 'Requester',
      body: message,
      is_internal: false,
    })
  }

  return NextResponse.json({ ticket })
}

export async function PATCH(request: Request) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const payload = await request.json().catch(() => ({}))
  const { ticket_id, status, priority, action } = payload || {}

  if (!ticket_id) return jsonError('ticket_id is required')

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (status) updates.status = status
  if (priority) updates.priority = priority
  if (action === 'assign_to_me') {
    updates.assigned_to = session?.user.id ?? null
  }
  if (priority) {
    const { data: existing } = await supabaseAdmin
      .from('support_tickets')
      .select('created_at')
      .eq('id', ticket_id)
      .maybeSingle()
    const createdAt = existing?.created_at || new Date().toISOString()
    updates.sla_minutes = getSlaMinutes(priority)
    updates.sla_due_at = getSlaDueAt(createdAt, priority)
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('support_tickets')
    .update(updates)
    .eq('id', ticket_id)
    .select('*')
    .single()

  if (updateError) return jsonError(updateError.message, 500)

  if (status === 'resolved') {
    const metadata = (data.metadata || {}) as Record<string, any>
    if (!metadata.csat_requested_at) {
      const nextMetadata = {
        ...metadata,
        csat_requested_at: new Date().toISOString(),
        csat_status: 'pending',
      }
      await supabaseAdmin
        .from('support_tickets')
        .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
        .eq('id', ticket_id)
      await queueOperationTaskSafely({
        type: 'support_followup',
        title: `Send CSAT survey for ticket ${data.subject || ticket_id}`,
        priority: 'medium',
        owner: 'Support Ops',
        entity_type: 'support_ticket',
        entity_id: ticket_id,
        max_attempts: 3,
        idempotency_key: `csat_request:${ticket_id}`,
      })
    }
  }

  return NextResponse.json({ ticket: data })
}
