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
          { tier: 'team_starter', label: 'Team Starter · $49/month', billingInterval: 'month' as const },
          { tier: 'team_starter', label: 'Team Starter · $490/year', billingInterval: 'year' as const },
        ]
      : claims.role === 'athlete'
        ? [
            { tier: 'retired', label: 'Athlete subscriptions are retired', billingInterval: 'month' as const },
          ]
        : [
          { tier: 'growing_organization', label: 'Growing Organization · $129/month', billingInterval: 'month' as const },
          { tier: 'growing_organization', label: 'Growing Organization · $1,290/year', billingInterval: 'year' as const },
          { tier: 'established_organization', label: 'Established Organization · $249/month', billingInterval: 'month' as const },
          { tier: 'established_organization', label: 'Established Organization · $2,490/year', billingInterval: 'year' as const },
        ]
    return <MobileSubscriptionPlans token={token} plans={plans} />
  } catch (error: any) {
    return <MobileCheckoutStart token="" endpoint="" title="Checkout link unavailable" description={error?.message || 'This onboarding link is invalid or expired.'} />
  }
}
