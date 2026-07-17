import MobileCheckoutStart from '@/components/MobileCheckoutStart'
import MobileSubscriptionPlans from '@/components/MobileSubscriptionPlans'
import { assertIssuedMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import { verifyMobileCheckoutToken } from '@/lib/mobileCheckoutToken'

export const dynamic = 'force-dynamic'

export default async function OnboardingCheckoutPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token || ''
  try {
    const claims = verifyMobileCheckoutToken(token)
    if (claims.type !== 'onboarding' || !['coach', 'org'].includes(claims.role || '')) throw new Error('Invalid onboarding checkout link')
    await assertIssuedMobileHandoff(claims)
    const plans = claims.role === 'coach'
      ? [{ tier: 'starter', label: 'Starter' }, { tier: 'pro', label: 'Pro' }, { tier: 'elite', label: 'Elite' }]
      : [{ tier: 'standard', label: 'Standard' }, { tier: 'growth', label: 'Growth' }, { tier: 'enterprise', label: 'Enterprise' }]
    return <MobileSubscriptionPlans token={token} plans={plans} />
  } catch (error: any) {
    return <MobileCheckoutStart token="" endpoint="" title="Checkout link unavailable" description={error?.message || 'This onboarding link is invalid or expired.'} />
  }
}
