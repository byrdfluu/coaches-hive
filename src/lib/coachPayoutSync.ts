import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getStripePayoutScheduleForCoach } from '@/lib/coachPayoutRules'

export const syncCoachStripePayoutSchedule = async (coachId: string) => {
  const [{ data: profile }, { data: plan }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', coachId)
      .maybeSingle(),
    supabaseAdmin
      .from('coach_plans')
      .select('tier, created_at')
      .eq('coach_id', coachId)
      .maybeSingle(),
  ])

  const stripeAccountId = String(profile?.stripe_account_id || '').trim()
  if (!stripeAccountId) {
    return { ok: true as const, skipped: true as const, reason: 'no_stripe_account' }
  }

  let account: Awaited<ReturnType<typeof stripe.accounts.retrieve>>
  try {
    account = await stripe.accounts.retrieve(stripeAccountId)
  } catch {
    return { ok: true as const, skipped: true as const, reason: 'account_unavailable' }
  }

  if (!account.charges_enabled) {
    return { ok: true as const, skipped: true as const, reason: 'charges_disabled' }
  }

  const schedule = getStripePayoutScheduleForCoach({
    tier: plan?.tier,
    anchorDate: plan?.created_at,
  })

  await stripe.accounts.update(stripeAccountId, {
    settings: { payouts: { schedule } },
  } as Parameters<typeof stripe.accounts.update>[1])

  return {
    ok: true as const,
    skipped: false as const,
    reason: null,
    schedule,
    tier: plan?.tier || null,
    anchorDate: plan?.created_at || null,
  }
}
