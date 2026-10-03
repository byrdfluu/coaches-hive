import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { verifyMobileCheckoutToken } from '@/lib/mobileCheckoutToken'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mobileError } from '@/lib/mobilePaymentApi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const token = String(body?.token || '').trim()
  const recordId = String(body?.record_id || '').trim()
  if (!token || !recordId) {
    return mobileError('Token and record_id are required.', 422, false)
  }

  try {
    const claims = verifyMobileCheckoutToken(token)
    if (claims.type !== 'coach_fee' || claims.resourceId !== recordId) {
      return mobileError('This checkout cannot be canceled by the current user.', 403, false)
    }

    const { data: assignment, error } = await supabaseAdmin
      .from('coach_fee_assignments')
      .select('id, status, stripe_checkout_session_id')
      .eq('id', recordId)
      .maybeSingle()
    if (error) throw error
    if (!assignment) return mobileError('This checkout is unavailable.', 404, false)
    if (assignment.status === 'paid') {
      return mobileError('A completed checkout cannot be canceled.', 409, false)
    }
    if (assignment.status === 'canceled') return NextResponse.json({ canceled: true })
    if (!assignment.stripe_checkout_session_id) {
      return mobileError('This checkout can no longer be canceled.', 409, false)
    }

    const checkoutSession = await stripe.checkout.sessions.retrieve(assignment.stripe_checkout_session_id)
    const sessionOwner = checkoutSession.client_reference_id || checkoutSession.metadata?.payer_user_id
    if (
      checkoutSession.metadata?.checkout_type !== 'coach_fee'
      || checkoutSession.metadata?.assignment_id !== assignment.id
      || sessionOwner !== claims.userId
      || checkoutSession.payment_status === 'paid'
    ) {
      return mobileError('This checkout can no longer be canceled.', 409, false)
    }
    if (checkoutSession.status === 'open') {
      await stripe.checkout.sessions.expire(checkoutSession.id)
    }

    const { error: updateError } = await supabaseAdmin
      .from('coach_fee_assignments')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('id', assignment.id)
      .eq('stripe_checkout_session_id', checkoutSession.id)
      .in('status', ['pending', 'expired'])
    if (updateError) throw updateError
    return NextResponse.json({ canceled: true })
  } catch (error) {
    console.error('[mobile/checkout/cancel]', error)
    return mobileError('Unable to cancel checkout.', 503, true)
  }
}
