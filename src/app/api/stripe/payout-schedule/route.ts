import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type StripeWeeklyAnchor =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

const VALID_ANCHORS = new Set<StripeWeeklyAnchor>([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
])

function toWeeklyAnchor(day: string): StripeWeeklyAnchor {
  const lower = day.toLowerCase() as StripeWeeklyAnchor
  return VALID_ANCHORS.has(lower) ? lower : 'friday'
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'assistant_coach'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => ({}))
  const payoutSchedule = String(body?.payout_schedule || '').trim()
  const payoutDay = String(body?.payout_day || '').trim()

  const userId = session.user.id
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', userId)
    .maybeSingle()

  const stripeAccountId = profile?.stripe_account_id
  if (!stripeAccountId) {
    // Coach hasn't connected Stripe yet — save is non-fatal
    return NextResponse.json({ ok: true, skipped: true })
  }

  // Check that the account is active enough to accept schedule updates
  let account: Awaited<ReturnType<typeof stripe.accounts.retrieve>>
  try {
    account = await stripe.accounts.retrieve(stripeAccountId)
  } catch {
    return NextResponse.json({ ok: true, skipped: true })
  }

  if (!account.charges_enabled) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  // Map platform cadence to Stripe schedule params
  let schedule: Record<string, unknown>
  const lower = payoutSchedule.toLowerCase()
  if (lower === 'monthly') {
    schedule = { interval: 'monthly', monthly_anchor: 1 }
  } else {
    // Weekly and Biweekly both map to weekly (Stripe has no biweekly)
    schedule = { interval: 'weekly', weekly_anchor: toWeeklyAnchor(payoutDay) }
  }

  try {
    await stripe.accounts.update(stripeAccountId, {
      settings: { payouts: { schedule } },
    } as Parameters<typeof stripe.accounts.update>[1])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to update Stripe payout schedule.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
