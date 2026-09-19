import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { mobileError, requireMobileUser, userCanAccessPlayer } from '@/lib/mobilePaymentApi'
import { auditPaymentAction, enforcePaymentRateLimit, safePaymentError } from '@/lib/paymentSecurity'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request, { params }: { params: Promise<{ installmentId: string }> }) {
  const auth = await requireMobileUser(request)
  if ('response' in auth) return auth.response
  if (!(await enforcePaymentRateLimit(auth.user.id, 'payment_method_setup', 6, 300).catch(() => false))) return mobileError('Too many payment-method requests. Try again later.', 429)
  const body = await request.json().catch(() => ({}))
  const installmentId = (await params).installmentId
  const paymentMethodId = String(body.payment_method_id || '')
  if (!paymentMethodId.startsWith('pm_')) return mobileError('A valid payment_method_id is required', 422)
  const { data: installment } = await supabaseAdmin.from('org_dues_installments').select('player_id,schedule_id').eq('id', installmentId).maybeSingle()
  if (!installment) return mobileError('Installment not found', 404)
  if (!(await userCanAccessPlayer(auth.user.id, installment.player_id))) return mobileError('Forbidden', 403)
  const { data: profile } = await supabaseAdmin.from('profiles').select('email,stripe_customer_id').eq('id', auth.user.id).maybeSingle()
  try {
    let customerId = profile?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({ email: profile?.email || auth.user.email || undefined, metadata: { userId: auth.user.id } },
        { idempotencyKey: `dues-autopay-customer:${auth.user.id}` })
      customerId = customer.id
      await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', auth.user.id)
    }
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)
    const currentCustomer = typeof paymentMethod.customer === 'string' ? paymentMethod.customer : paymentMethod.customer?.id
    if (currentCustomer && currentCustomer !== customerId) return mobileError('Payment method belongs to a different billing account', 403)
    if (!currentCustomer) await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId }, { idempotencyKey: `dues-autopay-method:${auth.user.id}:${paymentMethodId}` })
    const { data, error } = await supabaseAdmin.from('org_dues_installments').update({ autopay: true, stripe_customer_id: customerId,
      stripe_payment_method_id: paymentMethodId, updated_at: new Date().toISOString() }).eq('id', installmentId).select('*').single()
    if (error) throw error
    await auditPaymentAction({ actorUserId: auth.user.id, action: 'payment_method_attached', targetType: 'org_dues_installment',
      targetId: installmentId, stripeObjectId: paymentMethodId, result: 'succeeded' })
    return NextResponse.json({ installment: data })
  } catch (error) {
    safePaymentError('[dues/autopay] setup failed', error, { user_id: auth.user.id, installment_id: installmentId })
    return mobileError('Unable to enable autopay', 500)
  }
}
