import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveBillingInfoForActor } from '@/lib/subscriptionLifecycle'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const toMoney = (value: unknown) => {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return 0
  return numeric
}

export async function GET() {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  try {
    const athleteId = session.user.id

    const [billingInfo, profileResult, autopayResult, sessionPaymentsResult, receiptRowsResult] = await Promise.all([
      resolveBillingInfoForActor({ userId: athleteId, billingRole: 'athlete' }),
      supabaseAdmin
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', athleteId)
        .maybeSingle(),
      supabaseAdmin
        .from('athlete_payment_methods')
        .select('autopay_enabled, autopay_day')
        .eq('athlete_id', athleteId)
        .maybeSingle(),
      supabaseAdmin
        .from('session_payments')
        .select('id, session_id, coach_id, amount, status, paid_at, created_at')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('payment_receipts')
        .select('id, order_id, session_payment_id, amount, currency, status, receipt_url, refund_amount, refunded_at, created_at')
        .eq('payer_id', athleteId)
        .order('created_at', { ascending: false }),
    ])

    if (sessionPaymentsResult.error) return jsonError(sessionPaymentsResult.error.message, 500)
    if (receiptRowsResult.error) return jsonError(receiptRowsResult.error.message, 500)

    const customerId = String(profileResult.data?.stripe_customer_id || '').trim() || null

    let paymentMethods: Array<{
      id: string
      brand: string
      last4: string
      exp_month?: number
      exp_year?: number
    }> = []

    if (customerId) {
      try {
        const methods = await stripe.paymentMethods.list({
          customer: customerId,
          type: 'card',
        })
        paymentMethods = methods.data.map((pm) => ({
          id: pm.id,
          brand: pm.card?.brand || 'card',
          last4: pm.card?.last4 || '****',
          exp_month: pm.card?.exp_month,
          exp_year: pm.card?.exp_year,
        }))
      } catch {
        paymentMethods = []
      }
    }

    const sessionPayments = sessionPaymentsResult.data || []
    const coachIds = Array.from(new Set(sessionPayments.map((row) => row.coach_id).filter(Boolean) as string[]))
    const receiptRows = receiptRowsResult.data || []
    const orderIds = Array.from(new Set(receiptRows.map((row) => row.order_id).filter(Boolean) as string[]))

    const [coachProfilesResult, ordersResult] = await Promise.all([
      coachIds.length
        ? supabaseAdmin.from('profiles').select('id, full_name').in('id', coachIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? supabaseAdmin
            .from('orders')
            .select('id, product_id, coach_id, org_id, status, refund_status')
            .in('id', orderIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    const orders = ordersResult.data || []
    const productIds = Array.from(new Set(orders.map((row) => row.product_id).filter(Boolean) as string[]))
    const orderCoachIds = Array.from(new Set(orders.map((row) => row.coach_id).filter(Boolean) as string[]))
    const orgIds = Array.from(new Set(orders.map((row) => row.org_id).filter(Boolean) as string[]))
    const allCoachIds = Array.from(new Set([...coachIds, ...orderCoachIds]))

    const [productResult, allCoachProfilesResult, orgSettingsResult] = await Promise.all([
      productIds.length
        ? supabaseAdmin.from('products').select('id, title, name').in('id', productIds)
        : Promise.resolve({ data: [], error: null }),
      allCoachIds.length
        ? supabaseAdmin.from('profiles').select('id, full_name').in('id', allCoachIds)
        : Promise.resolve({ data: [], error: null }),
      orgIds.length
        ? supabaseAdmin.from('org_settings').select('org_id, org_name').in('org_id', orgIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    const coachMap = new Map<string, string>()
    ;((allCoachProfilesResult.data || coachProfilesResult.data || []) as Array<{ id: string; full_name?: string | null }>).forEach((profile) => {
      coachMap.set(profile.id, profile.full_name || 'Coach')
    })

    const productMap = new Map<string, string>()
    ;((productResult.data || []) as Array<{ id: string; title?: string | null; name?: string | null }>).forEach((product) => {
      productMap.set(product.id, product.title || product.name || 'Product')
    })

    const orgMap = new Map<string, string>()
    ;((orgSettingsResult.data || []) as Array<{ org_id?: string | null; org_name?: string | null }>).forEach((org) => {
      if (org.org_id) orgMap.set(org.org_id, org.org_name || 'Organization')
    })

    const sessionReceiptMap = new Map<string, { id: string; receipt_url: string | null }>()
    const marketplaceReceipts: Array<{
      id: string
      order_id: string
      title: string
      seller: string
      amount: number
      currency: string
      status: string
      refund_status: string | null
      receipt_url: string | null
      created_at: string | null
    }> = []

    const orderMap = new Map(orders.map((row) => [row.id, row]))

    receiptRows.forEach((receipt) => {
      if (receipt.session_payment_id) {
        sessionReceiptMap.set(receipt.session_payment_id, {
          id: receipt.id,
          receipt_url: receipt.receipt_url || null,
        })
        return
      }

      if (receipt.order_id) {
        const order = orderMap.get(receipt.order_id)
        marketplaceReceipts.push({
          id: receipt.id,
          order_id: receipt.order_id,
          title: order?.product_id ? productMap.get(order.product_id) || 'Product' : 'Product',
          seller:
            order?.coach_id
              ? coachMap.get(order.coach_id) || 'Coach'
              : order?.org_id
                ? orgMap.get(order.org_id) || 'Organization'
                : 'Seller',
          amount: toMoney(receipt.amount),
          currency: receipt.currency || 'usd',
          status: receipt.status || order?.status || 'paid',
          refund_status: order?.refund_status || null,
          receipt_url: receipt.receipt_url || null,
          created_at: receipt.created_at || null,
        })
      }
    })

    const normalizedSessionPayments = sessionPayments.map((payment) => ({
      id: payment.id,
      session_id: payment.session_id,
      coach_id: payment.coach_id,
      coach_name: payment.coach_id ? coachMap.get(payment.coach_id) || 'Coach' : 'Coach',
      amount: toMoney(payment.amount),
      status: payment.status || 'pending',
      paid_at: payment.paid_at || null,
      created_at: payment.created_at || null,
      receipt_id: sessionReceiptMap.get(payment.id)?.id || null,
      receipt_url: sessionReceiptMap.get(payment.id)?.receipt_url || null,
    }))

    return NextResponse.json({
      billing: billingInfo,
      payment_methods: paymentMethods,
      autopay: {
        enabled: Boolean(autopayResult.data?.autopay_enabled),
        day: autopayResult.data?.autopay_day || 'due_date',
      },
      session_payments: normalizedSessionPayments,
      marketplace_receipts: marketplaceReceipts,
    })
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : 'Unable to load payments summary.'
    return jsonError(message, 500)
  }
}
