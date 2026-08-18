import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(['athlete','admin'])
  if (error || !session) return error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const paymentMethodId = typeof body.payment_method_id === 'string' ? body.payment_method_id : null
  if (!paymentMethodId) return jsonError('payment_method_id is required')

  const { data: installment } = await supabaseAdmin.from('org_dues_installments')
    .select('id,player_id,schedule_id').eq('id', id).maybeSingle()
  if (!installment || installment.player_id !== session.user.id) return jsonError('Installment not found', 404)
  const { data: profile } = await supabaseAdmin.from('profiles').select('stripe_customer_id,email,full_name').eq('id', session.user.id).maybeSingle()
  let customerId = profile?.stripe_customer_id || null
  if (!customerId) {
    const customer = await stripe.customers.create({ email: profile?.email || undefined, name: profile?.full_name || undefined, metadata: { user_id: session.user.id } }, { idempotencyKey: `dues-customer:${session.user.id}` })
    customerId = customer.id
    await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', session.user.id)
  }
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId }).catch((err) => {
    if (!String(err?.message || '').includes('already been attached')) throw err
  })
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } })
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)
  await supabaseAdmin.from('athlete_payment_methods').upsert({
    athlete_id: session.user.id, stripe_customer_id: customerId, stripe_payment_method_id: paymentMethodId,
    card_brand: paymentMethod.card?.brand || null, card_last4: paymentMethod.card?.last4 || null, autopay_enabled: true,
  }, { onConflict: 'athlete_id' })
  await supabaseAdmin.from('org_dues_installments').update({
    family_account_id: session.user.id, autopay: true, stripe_customer_id: customerId,
    stripe_payment_method_id: paymentMethodId, updated_at: new Date().toISOString(),
  }).eq('schedule_id', installment.schedule_id).eq('player_id', session.user.id).in('status', ['upcoming','due','past_due','failed'])
  return NextResponse.json({ enabled: true, schedule_id: installment.schedule_id })
}
