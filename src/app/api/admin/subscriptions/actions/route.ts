import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import stripe from '@/lib/stripeServer'

export const dynamic = 'force-dynamic'

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(request: Request) {
  const auth = await requireSuperadminApi(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '')
  const userId = String(body.user_id || '')
  const reason = String(body.reason || '').trim()
  if (!userId || !reason) return fail('user_id and reason are required')

  const { data: subscription } = await supabaseAdmin.from('platform_subscriptions').select('*').eq('user_id', userId).maybeSingle()
  if (!subscription) return fail('Subscription not found', 404)
  const now = new Date()
  let result: Record<string, unknown> = {}

  if (action === 'extend_trial') {
    const days = Math.round(Number(body.days))
    if (!Number.isFinite(days) || days < 1 || days > 365) return fail('days must be between 1 and 365')
    const base = subscription.trial_end && new Date(subscription.trial_end) > now ? new Date(subscription.trial_end) : now
    const trialEnd = new Date(base.getTime() + days * 86_400_000)
    if (subscription.stripe_subscription_id) {
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        trial_end: Math.floor(trialEnd.getTime() / 1000),
        proration_behavior: 'none',
      })
    }
    const { error } = await supabaseAdmin.from('platform_subscriptions').update({ status: 'trialing', trial_end: trialEnd.toISOString(), updated_at: now.toISOString() }).eq('user_id', userId)
    if (error) return fail(error.message, 500)
    result = { trial_end: trialEnd.toISOString() }
  } else if (action === 'grant_waiver') {
    const days = body.days === null || body.days === '' ? null : Math.round(Number(body.days))
    if (days !== null && (!Number.isFinite(days) || days < 1 || days > 3650)) return fail('days must be blank or between 1 and 3650')
    await supabaseAdmin.from('admin_subscription_access_overrides').update({ status: 'revoked', revoked_at: now.toISOString(), revoked_by: auth.user.id, updated_at: now.toISOString() }).eq('user_id', userId).eq('status', 'active')
    const endsAt = days === null ? null : new Date(now.getTime() + days * 86_400_000).toISOString()
    const { error } = await supabaseAdmin.from('admin_subscription_access_overrides').insert({ user_id: userId, status: 'active', reason, ends_at: endsAt, created_by: auth.user.id })
    if (error) return fail(error.message, 500)
    result = { waiver_ends_at: endsAt }
  } else if (action === 'revoke_waiver') {
    const { error } = await supabaseAdmin.from('admin_subscription_access_overrides').update({ status: 'revoked', revoked_at: now.toISOString(), revoked_by: auth.user.id, updated_at: now.toISOString() }).eq('user_id', userId).eq('status', 'active')
    if (error) return fail(error.message, 500)
  } else if (action === 'correct_dates') {
    const periodEnd = body.current_period_end ? new Date(body.current_period_end) : null
    if (!periodEnd || Number.isNaN(periodEnd.getTime())) return fail('A valid current_period_end is required')
    const { error } = await supabaseAdmin.from('platform_subscriptions').update({ current_period_end: periodEnd.toISOString(), updated_at: now.toISOString() }).eq('user_id', userId)
    if (error) return fail(error.message, 500)
    result = { current_period_end: periodEnd.toISOString() }
  } else if (action === 'reconcile_provider') {
    if (!subscription.stripe_subscription_id) return fail('Only Stripe subscriptions can be reconciled automatically', 422)
    const remote = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id)
    const update = {
      status: remote.status,
      trial_end: remote.trial_end ? new Date(remote.trial_end * 1000).toISOString() : null,
      current_period_end: remote.items.data[0]?.current_period_end ? new Date(remote.items.data[0].current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: remote.cancel_at_period_end,
      updated_at: now.toISOString(),
    }
    const { error } = await supabaseAdmin.from('platform_subscriptions').update(update).eq('user_id', userId)
    if (error) return fail(error.message, 500)
    result = update
  } else {
    return fail('Unsupported subscription action')
  }

  await logAdminAction({ action: `admin.subscription.${action}`, actorId: auth.user.id, actorEmail: auth.user.email || null, targetType: 'user', targetId: userId, metadata: { reason, ...result } })
  return NextResponse.json({ ok: true, result })
}
