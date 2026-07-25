import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { sendSubscriptionTrialEndingEmail } from '@/lib/email'
import { formatUsdCents } from '@/lib/allAccessPricing'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { insertNotifications } from '@/lib/inAppNotifications'

export const runtime = 'nodejs'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

const isAuthorized = (request: Request) => {
  const secret = process.env.REMINDER_CRON_SECRET
  if (secret && request.headers.get('x-reminder-secret') === secret) return true
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) return request.headers.get('authorization') === `Bearer ${cronSecret}`
  return !secret
}

const dashboardPath = (ownerType: string) => {
  if (ownerType === 'athlete') return '/athlete/payments'
  if (ownerType === 'coach') return '/coach/settings'
  return '/org/billing'
}

async function sendTrialEndingNotices() {
  const now = new Date()
  const windowStart = new Date(now.getTime() + (2.5 * 24 * 60 * 60 * 1000))
  const windowEnd = new Date(now.getTime() + (3.5 * 24 * 60 * 60 * 1000))

  const { data: subscriptions, error } = await supabaseAdmin
    .from('platform_subscriptions')
    .select('id, user_id, owner_type, tier, trial_end, renewal_amount_cents, currency')
    .eq('status', 'trialing')
    .gte('trial_end', windowStart.toISOString())
    .lte('trial_end', windowEnd.toISOString())

  if (error) {
    Sentry.captureException(error)
    return jsonError('Unable to load ending trials', 500)
  }

  const userIds = Array.from(new Set((subscriptions || []).map((row) => row.user_id).filter(Boolean)))
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] }
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))

  let sent = 0
  for (const subscription of subscriptions || []) {
    const profile = profileMap.get(subscription.user_id)
    if (!profile?.email || !subscription.trial_end) continue

    const { data: existing } = await supabaseAdmin
      .from('email_deliveries')
      .select('id')
      .eq('template', 'subscription_trial_ending')
      .eq('to_email', profile.email)
      .contains('metadata', { subscription_id: subscription.id })
      .maybeSingle()
    if (existing) continue

    const trialEndLabel = new Date(subscription.trial_end).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    const currency = String(subscription.currency || 'usd').toUpperCase()
    const nextCharge = typeof subscription.renewal_amount_cents === 'number'
      ? `${formatUsdCents(subscription.renewal_amount_cents)} ${currency}`
      : null
    const manageBillingUrl = dashboardPath(subscription.owner_type)

    const delivery = await sendSubscriptionTrialEndingEmail({
      toEmail: profile.email,
      toName: profile.full_name,
      subscriptionId: subscription.id,
      trialEnd: trialEndLabel,
      nextCharge,
      manageBillingUrl,
    })

    if (delivery.status === 'sent') {
      await insertNotifications({
        user_id: subscription.user_id,
        type: 'subscription_trial_ending',
        title: 'Your free trial ends soon',
        body: `Your Coaches Hive trial ends ${trialEndLabel}.${nextCharge ? ` Your next charge is ${nextCharge}.` : ''}`,
        action_url: manageBillingUrl,
        data: { category: 'Payments', subscription_id: subscription.id },
      })
      sent += 1
    }
  }

  return NextResponse.json({
    sent,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
  })
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return jsonError('Unauthorized', 401)
  return sendTrialEndingNotices()
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return jsonError('Unauthorized', 401)
  return sendTrialEndingNotices()
}
