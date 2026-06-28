import MobileCheckoutStart from '@/components/MobileCheckoutStart'
import { assertIssuedMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import { verifyMobileCheckoutToken } from '@/lib/mobileCheckoutToken'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export default async function MarketplaceCheckoutPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token || ''
  try {
    const claims = verifyMobileCheckoutToken(token)
    if (claims.type !== 'marketplace' || !claims.resourceId) throw new Error('Invalid marketplace checkout link')
    await assertIssuedMobileHandoff(claims)
    const { data: item } = await supabaseAdmin.from('marketplace_items').select('*').eq('id', claims.resourceId).maybeSingle()
    if (!item || !item.is_active) throw new Error('Marketplace item is unavailable')
    const amountLabel = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(item.price || 0))
    return <MobileCheckoutStart token={token} endpoint="/api/stripe/mobile-marketplace-checkout" title={item.name || 'Marketplace item'} description={item.description || 'Review this item, then continue to Stripe to complete your purchase.'} amountLabel={amountLabel} />
  } catch (error: any) {
    return <MobileCheckoutStart token="" endpoint="" title="Checkout link unavailable" description={error?.message || 'This marketplace link is invalid or expired.'} />
  }
}

