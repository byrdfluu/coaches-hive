import MobileCheckoutStart from '@/components/MobileCheckoutStart'
import { assertIssuedMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import { verifyMobileCheckoutToken } from '@/lib/mobileCheckoutToken'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

export default async function PayPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token || ''
  try {
    const claims = verifyMobileCheckoutToken(token)
    if (claims.type !== 'fee' || !claims.resourceId) throw new Error('Invalid fee checkout link')
    await assertIssuedMobileHandoff(claims)
    const { data: assignment } = await supabaseAdmin.from('org_fee_assignments').select('*').eq('id', claims.resourceId).maybeSingle()
    if (!assignment) throw new Error('Fee assignment not found')
    const { data: fee } = await supabaseAdmin.from('org_fees').select('*').eq('id', assignment.fee_id).maybeSingle()
    const amount = Number(assignment.amount ?? (fee?.amount_cents ? Number(fee.amount_cents) / 100 : fee?.amount) ?? 0)
    return <MobileCheckoutStart token={token} endpoint="/api/stripe/fee-checkout" title={fee?.title || fee?.name || 'Organization fee'} description="Review this fee, then continue to Stripe to complete payment." amountLabel={money(amount)} />
  } catch (error: any) {
    return <MobileCheckoutStart token="" endpoint="" title="Checkout link unavailable" description={error?.message || 'This payment link is invalid or expired.'} />
  }
}

