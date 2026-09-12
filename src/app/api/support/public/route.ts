import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSlaDueAt, getSlaMinutes } from '@/lib/supportSla'
import { suggestTemplateId } from '@/lib/supportTemplates'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

type RequestQueue = 'support' | 'sales' | 'partnership' | 'feedback'

const normalizeRequestQueue = (value: unknown): RequestQueue => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'sales') return 'sales'
  if (normalized === 'partnership') return 'partnership'
  if (normalized === 'feedback') return 'feedback'
  return 'support'
}

const queueConfig: Record<RequestQueue, { subjectPrefix: string; priority: 'low' | 'medium' | 'high' | 'urgent' }> = {
  support: { subjectPrefix: '[Support]', priority: 'high' },
  sales: { subjectPrefix: '[Sales]', priority: 'medium' },
  partnership: { subjectPrefix: '[Partnership]', priority: 'low' },
  feedback: { subjectPrefix: '[Feedback]', priority: 'low' },
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}))
  const { name, email, message, request_type, website, org_name, phone, sport, roster_size, state, source } = payload || {}

  // Honeypot — real users never fill this field; bots do
  if (website) return NextResponse.json({ ticket: null })

  const detailLines = [
    org_name ? `Organization: ${org_name}` : null,
    sport ? `Sport: ${sport}` : null,
    roster_size ? `Number of athletes: ${roster_size}` : null,
    state ? `State: ${state}` : null,
    phone ? `Phone: ${phone}` : null,
  ].filter(Boolean).join('\n')

  const body = [detailLines, message].filter(Boolean).join('\n\n')

  if (!body) return jsonError('message is required')
  if (!name || !email) return jsonError('name and email are required')

  const queue = normalizeRequestQueue(request_type)
  const routing = queueConfig[queue]
  const subject = `${routing.subjectPrefix} Website inquiry${name ? ` from ${name}` : ''}`
  const now = new Date().toISOString()
  const priority = routing.priority
  const slaMinutes = getSlaMinutes(priority)
  const slaDueAt = getSlaDueAt(now, priority)
  const suggestedTemplate = suggestTemplateId(subject, body)

  const { data: ticket, error: insertError } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      subject,
      status: 'open',
      priority,
      channel: 'email',
      requester_name: name || 'Website visitor',
      requester_email: email || null,
      requester_role: 'visitor',
      org_name: org_name || null,
      assigned_to: null,
      last_message_preview: body.slice(0, 140),
      last_message_at: now,
      sla_minutes: slaMinutes,
      sla_due_at: slaDueAt,
      metadata: {
        suggested_template: suggestedTemplate,
        source: source || 'contact_page',
        queue,
        request_type: queue,
        phone: phone || null,
        sport: sport || null,
        roster_size: roster_size || null,
        state: state || null,
      },
    })
    .select('*')
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  await supabaseAdmin.from('support_messages').insert({
    ticket_id: ticket.id,
    sender_role: 'user',
    sender_name: name || email || 'Website visitor',
    body,
    is_internal: false,
    metadata: { source: source || 'contact_page' },
  })

  return NextResponse.json({ ticket })
}
