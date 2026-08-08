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
          { tier: 'coach_all_access', label: 'Coach All Access · $99/month', billingInterval: 'month' as const },
          { tier: 'coach_all_access', label: 'Coach All Access · $990/year', billingInterval: 'year' as const },
        ]
      : claims.role === 'athlete'
        ? [
            { tier: 'family_all_access', label: 'Family All Access · $4.99/month', billingInterval: 'month' as const },
            { tier: 'family_all_access', label: 'Family All Access · $49/year', billingInterval: 'year' as const },
          ]
        : [
          { tier: 'org_starter', label: 'Organization Starter · $399/month', billingInterval: 'month' as const },
          { tier: 'org_starter', label: 'Organization Starter · $3,990/year', billingInterval: 'year' as const },
          { tier: 'org_growth', label: 'Organization Growth · $999/month', billingInterval: 'month' as const },
          { tier: 'org_growth', label: 'Organization Growth · $9,990/year', billingInterval: 'year' as const },
        ]
    return <MobileSubscriptionPlans token={token} plans={plans} />
  } catch (error: any) {
    return <MobileCheckoutStart token="" endpoint="" title="Checkout link unavailable" description={error?.message || 'This onboarding link is invalid or expired.'} />
  }
}
