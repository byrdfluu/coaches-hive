import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { MobileCheckoutClaims } from '@/lib/mobileCheckoutToken'

export const assertIssuedMobileHandoff = async (claims: MobileCheckoutClaims) => {
  const { data, error } = await supabaseAdmin
    .from('mobile_checkout_handoffs')
    .select('*')
    .eq('nonce', claims.nonce)
    .eq('user_id', claims.userId)
    .eq('checkout_type', claims.type)
    .maybeSingle()

  if (error || !data) throw new Error('Checkout handoff was not found')
  if (new Date(data.expires_at).getTime() <= Date.now()) throw new Error('Checkout handoff has expired')
  return data as Record<string, any>
}

export const claimMobileHandoff = async (claims: MobileCheckoutClaims) => {
  const existing = await assertIssuedMobileHandoff(claims)
  if (existing.status === 'consumed' && existing.stripe_checkout_session_id) return existing
  if (existing.status !== 'issued') throw new Error('Checkout handoff has already been used')

  const { data, error } = await supabaseAdmin
    .from('mobile_checkout_handoffs')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('nonce', claims.nonce)
    .eq('status', 'issued')
    .select('*')
    .maybeSingle()
  if (error || !data) throw new Error('Checkout handoff is already being processed')
  return data as Record<string, any>
}

export const releaseMobileHandoff = async (nonce: string, errorMessage: string) => {
  await supabaseAdmin
    .from('mobile_checkout_handoffs')
    .update({ status: 'issued', last_error: errorMessage, updated_at: new Date().toISOString() })
    .eq('nonce', nonce)
    .eq('status', 'processing')
}

export const consumeMobileHandoff = async (
  nonce: string,
  sessionId: string,
  checkoutUrl: string | null,
  responseMetadata?: Record<string, unknown>,
) => {
  const updates: Record<string, unknown> = {
    status: 'consumed',
    stripe_checkout_session_id: sessionId,
    checkout_url: checkoutUrl,
    last_error: null,
    updated_at: new Date().toISOString(),
  }
  if (responseMetadata) {
    const { data: handoff } = await supabaseAdmin
      .from('mobile_checkout_handoffs')
      .select('metadata')
      .eq('nonce', nonce)
      .maybeSingle()
    updates.metadata = {
      ...((handoff?.metadata || {}) as Record<string, unknown>),
      ...responseMetadata,
    }
  }

  await supabaseAdmin
    .from('mobile_checkout_handoffs')
    .update(updates)
    .eq('nonce', nonce)
}

export const completeMobileHandoff = async (nonce: string) => {
  await supabaseAdmin
    .from('mobile_checkout_handoffs')
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('nonce', nonce)
}
