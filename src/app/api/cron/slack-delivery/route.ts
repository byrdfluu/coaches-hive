import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SlackQueueEvent = {
  id: string
  event_type: string
  channel_key: string
  severity: string
  record_type: string
  record_id: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

const webhookByChannel: Record<string, string | undefined> = {
  bookings: process.env.SLACK_BOOKINGS_WEBHOOK_URL,
  errors: process.env.SLACK_ERRORS_WEBHOOK_URL,
  organizations: process.env.SLACK_ORGANIZATIONS_WEBHOOK_URL,
  payments: process.env.SLACK_PAYMENTS_WEBHOOK_URL,
  signups: process.env.SLACK_SIGNUPS_WEBHOOK_URL,
  support: process.env.SLACK_SUPPORT_WEBHOOK_URL,
}

const label = (value: string) => value.replaceAll('_', ' ').replaceAll('.', ' ')
  .replace(/\b\w/g, character => character.toUpperCase())

const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const slackMessage = (event: SlackQueueEvent) => {
  const details = Object.entries(event.payload || {})
    .filter(([key]) => !['record_id', 'occurred_at'].includes(key))
    .map(([key, value]) => ({ key, value: displayValue(value) }))
    .filter((item): item is { key: string; value: string } => Boolean(item.value))
    .slice(0, 8)
  const occurredAt = displayValue(event.payload?.occurred_at) || event.created_at
  const summary = `${label(event.event_type)} · ${event.severity.toUpperCase()}`

  return {
    text: summary,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: label(event.event_type).slice(0, 150), emoji: true } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Severity*\n${event.severity}` },
        { type: 'mrkdwn', text: `*Occurred*\n${occurredAt}` },
        { type: 'mrkdwn', text: `*Record type*\n${event.record_type}` },
        { type: 'mrkdwn', text: `*Record ID*\n${event.record_id || 'Not supplied'}` },
        ...details.map(item => ({ type: 'mrkdwn', text: `*${label(item.key)}*\n${item.value.slice(0, 500)}` })),
      ].slice(0, 10) },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Coaches Hive operational event · ${event.id}` }] },
    ],
  }
}

const authorized = (request: Request) => {
  const bearer = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const dispatchSecret = process.env.SLACK_DISPATCH_SECRET
  return Boolean(
    (cronSecret && bearer === `Bearer ${cronSecret}`) ||
    (dispatchSecret && bearer === `Bearer ${dispatchSecret}`) ||
    (dispatchSecret && request.headers.get('x-slack-dispatch-secret') === dispatchSecret),
  )
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin.rpc('claim_slack_events', { p_limit: 25 })
  if (error) {
    console.error('[cron/slack-delivery] unable to claim events', { code: error.code })
    return NextResponse.json({ error: 'Unable to claim Slack events.' }, { status: 503 })
  }

  const events = (data || []) as SlackQueueEvent[]
  let sent = 0
  let failed = 0

  for (const event of events) {
    const webhookUrl = webhookByChannel[event.channel_key] || webhookByChannel.errors
    try {
      if (!webhookUrl) throw new Error(`No webhook is configured for channel ${event.channel_key}`)
      const parsed = new URL(webhookUrl)
      if (parsed.protocol !== 'https:' || !['hooks.slack.com', 'hooks.slack-gov.com'].includes(parsed.hostname)) {
        throw new Error(`Invalid Slack webhook URL for channel ${event.channel_key}`)
      }
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackMessage(event)),
        signal: AbortSignal.timeout(10_000),
      })
      const responseText = await response.text()
      if (!response.ok || responseText.trim() !== 'ok') {
        throw new Error(`Slack returned ${response.status}: ${responseText.slice(0, 200)}`)
      }
      const { error: completeError } = await supabaseAdmin.rpc('complete_slack_event', { p_id: event.id })
      if (completeError) throw new Error(`Delivery recorded by Slack but completion failed: ${completeError.code}`)
      sent += 1
    } catch (deliveryError) {
      failed += 1
      const message = deliveryError instanceof Error ? deliveryError.message : 'Unknown Slack delivery error'
      const { error: failError } = await supabaseAdmin.rpc('fail_slack_event', { p_id: event.id, p_error: message.slice(0, 500) })
      if (failError) console.error('[cron/slack-delivery] unable to record failure', { eventId: event.id, code: failError.code })
    }
  }

  return NextResponse.json({ processed: events.length, sent, failed })
}
