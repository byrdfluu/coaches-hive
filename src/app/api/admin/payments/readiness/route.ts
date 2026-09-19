import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const REQUIRED_EVENTS = [
  'checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired',
  'payment_intent.succeeded','payment_intent.payment_failed','payment_intent.requires_action','payment_intent.canceled',
  'charge.succeeded','charge.refunded','charge.refund.updated','charge.dispute.created','charge.dispute.updated','charge.dispute.closed',
  'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed',
  'invoice.paid','invoice.payment_succeeded','invoice.payment_failed','payment_method.updated','account.updated',
]

export async function GET() {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const target = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.coacheshive.com'}/api/stripe/webhook`
  const [endpoints, failedEvents, deadLetters, recurring] = await Promise.all([
    stripe.webhookEndpoints.list({ limit: 100 }),
    supabaseAdmin.from('stripe_webhook_events').select('event_id,event_type,last_error,created_at').eq('status', 'failed').order('created_at', { ascending: false }).limit(50),
    supabaseAdmin.from('operation_tasks').select('id,title,last_error,created_at').eq('status', 'dead_letter').order('created_at', { ascending: false }).limit(50),
    supabaseAdmin.from('organization_recurring_fees').select('id,status,stripe_subscription_id,last_event_type,updated_at').in('status', ['processing','past_due','paused','active']).limit(500),
  ])
  const endpoint = endpoints.data.find((item) => item.url === target)
  const enabled = new Set(endpoint?.enabled_events || [])
  const wildcard = enabled.has('*')
  const missing = wildcard ? [] : REQUIRED_EVENTS.filter((event) => !enabled.has(event as any))
  return NextResponse.json({
    webhook: { url: target, exists: Boolean(endpoint), status: endpoint?.status || 'missing', missing_events: missing },
    configuration: {
      webhook_secret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      recurring_portal: Boolean(process.env.STRIPE_RECURRING_FEES_PORTAL_CONFIGURATION_ID),
      platform_fee_bps: Number(process.env.COACHES_HIVE_PLATFORM_FEE_BPS || 400),
    },
    failed_webhooks: failedEvents.data || [], dead_letters: deadLetters.data || [], recurring_subscriptions: recurring.data || [],
  })
}
