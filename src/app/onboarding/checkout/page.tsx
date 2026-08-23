import MobileCheckoutStart from '@/components/MobileCheckoutStart'
import MobileSubscriptionPlans from '@/components/MobileSubscriptionPlans'
import { assertIssuedMobileHandoff } from '@/lib/mobileCheckoutHandoff'
import { verifyMobileCheckoutToken } from '@/lib/mobileCheckoutToken'

export const dynamic = 'force-dynamic'

export default async function OnboardingCheckoutPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token || ''
  try {
    const claims = verifyMobileCheckoutToken(token)
    if (claims.type !== 'onboarding' || !['coach', 'athlete', 'org'].includes(claims.role || '')) throw new Error('Invalid onboarding checkout link')
    await assertIssuedMobileHandoff(claims)
    const plans = claims.role === 'coach'
      ? [
          { tier: 'individual_coach', label: 'Individual Coach · $99/month', billingInterval: 'month' as const },
          { tier: 'individual_coach', label: 'Individual Coach · $990/year', billingInterval: 'year' as const },
        ]
      : claims.role === 'athlete'
        ? [
            { tier: 'retired', label: 'Athlete subscriptions are retired', billingInterval: 'month' as const },
          ]
        : [
          { tier: 'organization', label: 'Organization · $499/month', billingInterval: 'month' as const },
          { tier: 'organization', label: 'Organization · $4,990/year', billingInterval: 'year' as const },
        ]
    return <MobileSubscriptionPlans token={token} plans={plans} />
  } catch (error: any) {
    return <MobileCheckoutStart token="" endpoint="" title="Checkout link unavailable" description={error?.message || 'This onboarding link is invalid or expired.'} />
  }
}
