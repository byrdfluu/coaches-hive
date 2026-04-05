import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { syncCoachStripePayoutSchedule } from '@/lib/coachPayoutSync'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'assistant_coach'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)
  try {
    const result = await syncCoachStripePayoutSchedule(session.user.id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to update Stripe payout schedule.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
