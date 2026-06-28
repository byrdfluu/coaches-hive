import MobileCheckoutStart from '@/components/MobileCheckoutStart'
import { assertIssuedMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import { verifyMobileCheckoutToken } from '@/lib/mobileCheckoutToken'

export const dynamic = 'force-dynamic'

export default async function OnboardingCheckoutPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token || ''
  try {
    const claims = verifyMobileCheckoutToken(token)
    if (claims.type !== 'onboarding' || !claims.role || !claims.tier) throw new Error('Invalid onboarding checkout link')
    await assertIssuedMobileHandoff(claims)
    const label = claims.tier.replace(/_/g, ' ').replace(/^./, (value) => value.toUpperCase())
    return <MobileCheckoutStart token={token} endpoint="/api/stripe/mobile-onboarding-checkout" title={`${label} plan`} description="Continue to Stripe to activate your Coaches Hive subscription. Your account will update after Stripe confirms completion." />
  } catch (error: any) {
    return <MobileCheckoutStart token="" endpoint="" title="Checkout link unavailable" description={error?.message || 'This onboarding link is invalid or expired.'} />
  }
}

