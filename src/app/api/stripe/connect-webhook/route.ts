import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendPayoutSentEmail } from '@/lib/email'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

// Refresh bank_last4 from the connected account's external accounts
const refreshBankLast4 = async (accountId: string, coachId: string) => {
  try {
    const account = await stripe.accounts.retrieve(accountId)
    if (account.external_accounts && 'data' in account.external_accounts) {
      const external = account.external_accounts.data[0]
      if (external && 'last4' in external && external.last4) {
        await supabaseAdmin
          .from('profiles')
          .update({ bank_last4: external.last4 })
          .eq('id', coachId)
      }
    }
  } catch {
    // Non-fatal — bank_last4 is cosmetic, don't fail the webhook
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!secret) {
    return jsonError('Missing STRIPE_CONNECT_WEBHOOK_SECRET', 500)
  }

  const sig = request.headers.get('stripe-signature')
  if (!sig) return jsonError('Missing stripe-signature header', 400)

  const body = await request.text()

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err: any) {
    return jsonError(`Webhook error: ${err?.message || 'Invalid signature'}`, 400)
  }

  // Idempotency guard — reuses same table as platform webhook (event.id is globally unique)
  const { error: logError } = await supabaseAdmin
    .from('stripe_webhook_events')
    .insert({
      event_id: event.id,
      event_type: event.type,
      status: 'processing',
    })

  if (logError) {
    if (logError.code === '23505') {
      return NextResponse.json({ received: true })
    }
    if (logError.code === '42P01') {
      return jsonError('stripe_webhook_events table not found. Run the SQL migration first.', 500)
    }
    return jsonError(logError.message || 'Unable to log webhook event', 500)
  }

  const connectedAccountId = event.account

  try {
    // account.updated — fires when a connected account's capabilities or external accounts change
    if (event.type === 'account.updated' && connectedAccountId) {
      const account = event.data.object as any

      // Find the coach whose Connect account this is
      const { data: coachProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('stripe_account_id', connectedAccountId)
        .maybeSingle()

      if (coachProfile?.id) {
        // Refresh bank_last4 whenever external accounts change
        if (account.external_accounts?.total_count > 0) {
          await refreshBankLast4(connectedAccountId, coachProfile.id)
        }
      }

      // If the account is deauthorized / restricted, we still have the stripe_account_id
      // in the DB — coaches can re-onboard at any time, so no action needed here.
    }

    // account.application.deauthorized — coach/org explicitly disconnected from the platform
    if (event.type === 'account.application.deauthorized' && connectedAccountId) {
      // Clear stripe_account_id so the coach/org must reconnect before accepting payments
      await supabaseAdmin
        .from('profiles')
        .update({ stripe_account_id: null, bank_last4: null })
        .eq('stripe_account_id', connectedAccountId)

      await supabaseAdmin
        .from('org_settings')
        .update({ stripe_account_id: null })
        .eq('stripe_account_id', connectedAccountId)
    }

    // payout.paid / payout.failed — a bank transfer to the connected account completed or failed
    // Note: Stripe payouts are balance sweeps, not 1:1 with individual coach_payouts rows.
    // Full reconciliation requires storing stripe_payout_id on coach_payouts (future migration).
    // For now, we log the event (idempotency table) and surface it in admin ops if needed.
    if ((event.type === 'payout.paid' || event.type === 'payout.failed') && connectedAccountId) {
      const payout = event.data.object as any

      const { data: coachProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, email, full_name')
        .eq('stripe_account_id', connectedAccountId)
        .maybeSingle()

      if (coachProfile?.id && event.type === 'payout.paid' && coachProfile.email) {
        await sendPayoutSentEmail({
          toEmail: coachProfile.email,
          toName: coachProfile.full_name || null,
          amount: payout.amount ? payout.amount / 100 : 0,
          currency: payout.currency || 'usd',
          payoutId: payout.id,
          dashboardUrl: '/coach/dashboard',
        })
      }

      if (coachProfile?.id && event.type === 'payout.failed') {
        // Mark any scheduled (not yet paid) payouts for this coach as failed
        // so they surface in the admin payout queue
        await supabaseAdmin
          .from('coach_payouts')
          .update({ status: 'failed' })
          .eq('coach_id', coachProfile.id)
          .eq('status', 'scheduled')
          .lte('scheduled_for', new Date(payout.arrival_date * 1000).toISOString())
      }
    }

    await supabaseAdmin
      .from('stripe_webhook_events')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('event_id', event.id)
  } catch (error: any) {
    await supabaseAdmin
      .from('stripe_webhook_events')
      .update({
        status: 'failed',
        processed_at: new Date().toISOString(),
        last_error: error?.message || 'Unhandled connect webhook error',
      })
      .eq('event_id', event.id)

    return jsonError(error?.message || 'Connect webhook processing failed', 500)
  }

  return NextResponse.json({ received: true })
}
