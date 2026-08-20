import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { assertIssuedMobileHandoff, completeMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import { verifyMobileCheckoutToken } from '@/lib/mobileCheckoutToken'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token') || ''
  const sessionId = url.searchParams.get('session_id') || ''
  try {
    const claims = verifyMobileCheckoutToken(token)
    const handoff = await assertIssuedMobileHandoff(claims)
    if (!sessionId || handoff.stripe_checkout_session_id !== sessionId) return jsonError('Checkout session does not match handoff', 403)
    if (handoff.status === 'fulfilled') return NextResponse.json({ completed: true, status: 'fulfilled', type: claims.type, resource_id: claims.resourceId || null })
    if (handoff.status === 'expired') return NextResponse.json({ completed: false, status: 'expired', type: claims.type })

    let completed = false
    if (claims.type === 'fee') {
      const { data } = await supabaseAdmin.from('org_fee_assignments').select('id').eq('id', claims.resourceId).eq('status', 'paid').eq('stripe_checkout_session_id', sessionId).maybeSingle()
      completed = Boolean(data)
    } else if (claims.type === 'marketplace') {
      const { data } = await supabaseAdmin.from('marketplace_orders').select('id').eq('stripe_checkout_session_id', sessionId).eq('payment_status', 'paid').maybeSingle()
      completed = Boolean(data)
    } else if (claims.type === 'cart') {
      // Cart checkout fans out into multiple marketplace_orders rows (one per
      // line item) from a single session — any matching paid row confirms
      // the whole cart's webhook fulfillment has run.
      const { data } = await supabaseAdmin.from('marketplace_orders').select('id').eq('stripe_checkout_session_id', sessionId).eq('payment_status', 'paid').limit(1).maybeSingle()
      completed = Boolean(data)
    } else if (claims.type === 'onboarding') {
      const { data } = await supabaseAdmin.from('platform_subscriptions')
        .select('status, trial_end')
        .eq('user_id', claims.userId)
        .in('status', ['active', 'trialing'])
        .limit(1)
        .maybeSingle()
      completed = data?.status === 'active'
        || (data?.status === 'trialing' && Boolean(data.trial_end) && new Date(data.trial_end).getTime() > Date.now())
    }
    if (completed) await completeMobileHandoff(claims.nonce)
    return NextResponse.json({ completed, status: completed ? 'fulfilled' : handoff.status, type: claims.type, resource_id: claims.resourceId || null })
  } catch (error: any) {
    return jsonError(error?.message || 'Unable to check payment status', 401)
  }
}
