import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fulfillMobileCheckoutSession } from '@/lib/mobileCheckoutFulfillment'
import { notifySuperadmins } from '@/lib/inAppNotifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error: expirationError } = await supabaseAdmin.rpc('archive_expired_family_offerings')
  if (expirationError) {
    console.error('[cron/checkout-reconciliation] offering expiration failed', { code: expirationError.code })
  }

  const { data: attempts, error } = await supabaseAdmin.from('checkout_purchase_attempts')
    .select('id,request_id,checkout_type,checkout_record_id,stripe_checkout_session_id,expires_at,status,workspace_id')
    .in('status', ['processing', 'checkout_pending'])
    .not('stripe_checkout_session_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) return NextResponse.json({ error: 'Unable to load checkout attempts' }, { status: 503 })

  let completed = 0
  let expired = 0
  let unchanged = 0
  let alerted = 0
  for (const attempt of attempts || []) {
    try {
      const session = await stripe.checkout.sessions.retrieve(attempt.stripe_checkout_session_id)
      const paid = session.status === 'complete'
        && (session.mode !== 'payment' || ['paid', 'no_payment_required'].includes(session.payment_status))
      if (paid) {
        const fulfilled = await fulfillMobileCheckoutSession(session)
        if (!fulfilled) {
          alerted += 1
          await notifySuperadmins({ type: 'checkout_reconciliation', title: 'Checkout needs reconciliation',
            body: `A completed ${attempt.checkout_type} checkout requires producer-specific reconciliation.`,
            workspaceId: attempt.workspace_id, destination: '/admin/webhooks', group: 'commerce',
            deduplicationKey: `checkout-reconcile:${session.id}`,
            data: { checkout_type: attempt.checkout_type, checkout_record_id: attempt.checkout_record_id } })
          continue
        }
        await supabaseAdmin.from('checkout_purchase_attempts').update({ status: 'completed',
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error_code: null,
          last_error_message: null }).eq('id', attempt.id).in('status', ['processing', 'checkout_pending'])
        completed += 1
      } else if (session.status === 'expired' || (session.expires_at && session.expires_at * 1000 <= Date.now())) {
        await supabaseAdmin.from('checkout_purchase_attempts').update({ status: 'expired',
          updated_at: new Date().toISOString(), last_error_code: 'checkout_expired',
          last_error_message: 'Stripe Checkout Session expired before completion.' }).eq('id', attempt.id)
        expired += 1
      } else {
        unchanged += 1
      }
    } catch (reconcileError) {
      alerted += 1
      const message = reconcileError instanceof Error ? reconcileError.message : 'Unknown reconciliation error'
      await supabaseAdmin.from('checkout_purchase_attempts').update({ last_error_code: 'reconciliation_failed',
        last_error_message: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', attempt.id)
      await notifySuperadmins({ type: 'checkout_reconciliation', title: 'Checkout reconciliation failed',
        body: `A ${attempt.checkout_type} checkout could not be reconciled automatically.`,
        workspaceId: attempt.workspace_id, destination: '/admin/webhooks', group: 'commerce',
        deduplicationKey: `checkout-reconcile-failed:${attempt.id}`,
        data: { checkout_type: attempt.checkout_type, checkout_record_id: attempt.checkout_record_id } })
    }
  }

  return NextResponse.json({ processed: (attempts || []).length, completed, expired, unchanged, alerted })
}
