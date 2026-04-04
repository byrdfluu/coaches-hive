import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSlaDueAt, getSlaMinutes } from '@/lib/supportSla'
import { suggestTemplateId } from '@/lib/supportTemplates'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

type RequestQueue = 'support' | 'sales' | 'partnership'

const normalizeRequestQueue = (value: unknown): RequestQueue => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'sales') return 'sales'
  if (normalized === 'partnership') return 'partnership'
  return 'support'
}

const queueConfig: Record<RequestQueue, { subjectPrefix: string; priority: 'low' | 'medium' | 'high' | 'urgent' }> = {
  support: { subjectPrefix: '[Support]', priority: 'high' },
  sales: { subjectPrefix: '[Sales]', priority: 'medium' },
  partnership: { subjectPrefix: '[Partnership]', priority: 'low' },
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}))
  const { name, email, message, request_type } = payload || {}

  if (!message) return jsonError('message is required')

  const queue = normalizeRequestQueue(request_type)
  const routing = queueConfig[queue]
  const subject = `${routing.subjectPrefix} Website inquiry${name ? ` from ${name}` : ''}`
  const now = new Date().toISOString()
  const priority = routing.priority
  const slaMinutes = getSlaMinutes(priority)
  const slaDueAt = getSlaDueAt(now, priority)
  const suggestedTemplate = suggestTemplateId(subject, message)

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
      assigned_to: null,
      last_message_preview: String(message).slice(0, 140),
      last_message_at: now,
      sla_minutes: slaMinutes,
      sla_due_at: slaDueAt,
      metadata: {
        suggested_template: suggestedTemplate,
        source: 'contact_page',
        queue,
        request_type: queue,
      },
    })
    .select('*')
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  await supabaseAdmin.from('support_messages').insert({
    ticket_id: ticket.id,
    sender_role: 'user',
    sender_name: name || email || 'Website visitor',
    body: message,
    is_internal: false,
    metadata: { source: 'contact_page' },
  })

  return NextResponse.json({ ticket })
}
