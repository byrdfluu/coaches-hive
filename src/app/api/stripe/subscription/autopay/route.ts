import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import stripe from '@/lib/stripeServer'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { queueOperationTaskSafely } from '@/lib/operations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ATHLETE_BILLING_STATUSES = new Set([
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
])

const parseBool = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value
  return null
}

const parseAutopayDay = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const next = value.trim()
  return next.length > 0 ? next : null
}

const findAthleteSubscription = async ({
  customerId,
  userId,
}: {
  customerId: string
  userId: string
}): Promise<Stripe.Subscription | null> => {
  let startingAfter: string | undefined

  for (let page = 0; page < 5; page += 1) {
    const result = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const subscription of result.data) {
      const status = String(subscription.status || '').toLowerCase()
      if (!ATHLETE_BILLING_STATUSES.has(status)) continue

      const metadata = (subscription.metadata || {}) as Record<string, string>
      const billingRole = String(metadata.billing_role || '').toLowerCase()
      const metadataUserId = String(metadata.user_id || '')
      if (billingRole && billingRole !== 'athlete') continue
      if (metadataUserId && metadataUserId !== userId) continue

      if (!billingRole || billingRole === 'athlete') {
        return subscription
      }
    }

    if (!result.has_more || result.data.length === 0) break
    startingAfter = result.data[result.data.length - 1]?.id
  }

  return null
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const enabled = parseBool(body?.enabled)
  const autopayDay = parseAutopayDay(body?.autopay_day)
  const hasEnabled = enabled !== null
  const hasDay = autopayDay !== null

  if (!hasEnabled && !hasDay) {
    return jsonError('enabled or autopay_day is required', 400)
  }

  let targetSubscription: Stripe.Subscription | null = null
  if (hasEnabled) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', session.user.id)
      .maybeSingle()

    if (!profile?.stripe_customer_id) {
      return jsonError('No billing account found. Please complete the checkout flow first.', 404)
    }

    targetSubscription = await findAthleteSubscription({
      customerId: profile.stripe_customer_id,
      userId: session.user.id,
    })

    if (!targetSubscription) {
      return jsonError('No active athlete subscription found for this account.', 404)
    }

    const collectionMethod: Stripe.SubscriptionUpdateParams['collection_method'] = enabled
      ? 'charge_automatically'
      : 'send_invoice'

    const idempotencyKey = `athlete_autopay:${session.user.id}:${collectionMethod}:${targetSubscription.id}`
    try {
      await stripe.subscriptions.update(
        targetSubscription.id,
        {
          collection_method: collectionMethod,
          ...(collectionMethod === 'send_invoice' ? { days_until_due: 30 } : {}),
          metadata: {
            ...(targetSubscription.metadata || {}),
            autopay_enabled: String(enabled),
            autopay_day: autopayDay || String((targetSubscription.metadata || {}).autopay_day || 'due_date'),
            autopay_updated_at: new Date().toISOString(),
            autopay_updated_by: session.user.id,
          },
        },
        { idempotencyKey },
      )
    } catch (err: any) {
      await queueOperationTaskSafely({
        type: 'billing_recovery',
        title: 'Stripe autopay update failed',
        priority: 'high',
        owner: 'Finance Ops',
        entity_type: 'user',
        entity_id: session.user.id,
        max_attempts: 3,
        idempotency_key: idempotencyKey,
        last_error: err?.message || 'Unable to update autopay setting',
        metadata: { role: 'athlete', enabled: String(enabled), subscriptionId: targetSubscription.id },
      })
      return jsonError(err?.message || 'Unable to update autopay in Stripe.', 500)
    }
  }

  const payload: Record<string, string | boolean> = {
    athlete_id: session.user.id,
    updated_at: new Date().toISOString(),
  }

  if (hasEnabled) {
    payload.autopay_enabled = enabled
  }

  if (hasDay) {
    payload.autopay_day = autopayDay
  }

  const { error: updateError } = await supabaseAdmin.from('athlete_payment_methods').upsert(payload)

  if (updateError) {
    await queueOperationTaskSafely({
      type: 'billing_recovery',
      title: 'Failed to persist athlete autopay preferences',
      priority: 'medium',
      owner: 'Finance Ops',
      entity_type: 'user',
      entity_id: session.user.id,
      max_attempts: 3,
      idempotency_key: `athlete_autopay_db:${session.user.id}:${hasEnabled ? enabled : 'day-only'}`,
      last_error: updateError.message,
      metadata: {
        hasEnabled,
        hasDay,
        targetSubscriptionId: targetSubscription?.id || null,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    autopay_enabled: hasEnabled ? enabled : null,
    autopay_day: hasDay ? autopayDay : null,
    db_synced: !updateError,
    collection_method: hasEnabled
      ? enabled
        ? 'charge_automatically'
        : 'send_invoice'
      : targetSubscription?.collection_method || null,
  })
}
