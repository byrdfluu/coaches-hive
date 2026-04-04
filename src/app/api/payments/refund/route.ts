import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { logAdminAction } from '@/lib/auditLog'
import { sendRefundReceiptEmail } from '@/lib/email'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (adminAccess.teamRole !== 'finance' && adminAccess.teamRole !== 'superadmin') {
    return jsonError('Forbidden', 403)
  }

  const body = await request.json().catch(() => ({}))
  const { payment_intent, charge, order_id, reason } = body || {}

  if (!payment_intent && !charge) {
    return jsonError('payment_intent or charge is required')
  }

  try {
    const refund = await stripe.refunds.create({
      payment_intent,
      charge,
      reason,
    })

    const refundedAt = new Date().toISOString()
    const refundAmountDollars = refund.amount ? refund.amount / 100 : null

    // Reverse the platform application fee so the coach payout is not charged.
    let appFeeRefundId: string | null = null
    try {
      const intentId: string | undefined = payment_intent || (charge ? undefined : undefined)
      if (intentId) {
        const intent = await stripe.paymentIntents.retrieve(intentId, {
          expand: ['latest_charge'],
        })
        const latestCharge = intent.latest_charge as import('stripe').Stripe.Charge | null
        const appFeeId =
          latestCharge && typeof latestCharge !== 'string'
            ? typeof latestCharge.application_fee === 'string'
              ? latestCharge.application_fee
              : (latestCharge.application_fee as any)?.id ?? null
            : null
        if (appFeeId) {
          const appFeeRefund = await stripe.applicationFees.createRefund(appFeeId, {
            ...(refund.amount ? { amount: refund.amount } : {}),
          })
          appFeeRefundId = appFeeRefund.id
        }
      }
    } catch {
      // Best-effort — log but don't fail the refund response.
    }

    if (order_id) {
      await supabaseAdmin
        .from('orders')
        .update({
          status: 'refunded',
          refund_status: 'refunded',
          refund_amount: refundAmountDollars,
          refunded_at: refundedAt,
        })
        .eq('id', order_id)

      await supabaseAdmin
        .from('payment_receipts')
        .update({
          status: 'refunded',
          refund_amount: refundAmountDollars,
          refunded_at: refundedAt,
        })
        .eq('order_id', order_id)
    }

    if (payment_intent) {
      // Mark matching session payment as refunded.
      await supabaseAdmin
        .from('session_payments')
        .update({ status: 'refunded', updated_at: refundedAt })
        .eq('stripe_payment_intent_id', payment_intent)

      if (!order_id) {
        await supabaseAdmin
          .from('payment_receipts')
          .update({
            status: 'refunded',
            refund_amount: refundAmountDollars,
            refunded_at: refundedAt,
          })
          .eq('stripe_payment_intent_id', payment_intent)
      }
    }

    await logAdminAction({
      action: 'admin.disputes.refund',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'order',
      targetId: order_id || payment_intent || charge || 'unknown',
      metadata: {
        order_id: order_id || null,
        payment_intent: payment_intent || null,
        charge: charge || null,
        reason: reason || null,
        stripe_refund_id: refund.id,
        amount: refund.amount ? refund.amount / 100 : null,
        app_fee_refund_id: appFeeRefundId || null,
      },
    })

    // Send refund receipt to the original payer.
    if (order_id || payment_intent) {
      const { data: receipt } = await supabaseAdmin
        .from('payment_receipts')
        .select('payer_id, amount, currency, id')
        .eq(order_id ? 'order_id' : 'stripe_payment_intent_id', order_id || payment_intent)
        .maybeSingle()
      if (receipt?.payer_id) {
        const { data: payerProfile } = await supabaseAdmin
          .from('profiles')
          .select('full_name, email, role')
          .eq('id', receipt.payer_id)
          .maybeSingle()
        if (payerProfile?.email) {
          await sendRefundReceiptEmail({
            toEmail: payerProfile.email,
            toName: payerProfile.full_name,
            amount: refundAmountDollars,
            currency: receipt.currency || 'usd',
            receiptId: receipt.id,
          }).catch(() => null)
        }
      }
    }

    return NextResponse.json({ refund })
  } catch (error: any) {
    return jsonError(error?.message || 'Unable to create refund', 500)
  }
}
