import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function POST(request: Request) {
  const secret = process.env.POSTMARK_WEBHOOK_SECRET
  if (secret) {
    const header = request.headers.get('x-postmark-secret')
    if (!header || header !== secret) {
      return jsonError('Unauthorized', 401)
    }
  }

  const payload = await request.json().catch(() => null)
  if (!payload) return jsonError('Invalid payload', 400)

  const recordType = String(payload.RecordType || payload.record_type || 'unknown')
  const messageId = payload.MessageID || payload.MessageId || payload.MessageID || payload.message_id || null
  const nowIso = new Date().toISOString()

  await supabaseAdmin.from('email_events').insert({
    message_id: messageId,
    event_type: recordType,
    payload,
    occurred_at: payload.ReceivedAt || payload.BouncedAt || payload.RecordedAt || nowIso,
  })

  if (messageId) {
    const update: Record<string, unknown> = { updated_at: nowIso }
    const recordLower = recordType.toLowerCase()

    if (recordLower === 'delivery') {
      update.status = 'delivered'
      update.delivered_at = payload.ReceivedAt || nowIso
    } else if (recordLower === 'bounce') {
      update.status = 'bounced'
      update.bounced_at = payload.BouncedAt || nowIso
      update.error = payload.Description || payload.Details || 'Bounced'
    } else if (recordLower === 'open') {
      update.opened_at = payload.ReceivedAt || nowIso
    } else if (recordLower === 'spamcomplaint') {
      update.status = 'complaint'
      update.error = payload.Description || 'Spam complaint'
    }

    await supabaseAdmin.from('email_deliveries').update(update).eq('message_id', messageId)
  }

  return NextResponse.json({ received: true })
}
