import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getNextPayoutDate } from '@/lib/payoutSchedule'
import { resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const isCronAuthorized = (request: Request) => {
  const secret = process.env.PAYOUT_CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('x-cron-secret')
  return header === secret
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return jsonError('Unauthorized', 401)
    }

    const adminAccess = resolveAdminAccess(session.user.user_metadata)
    if (adminAccess.teamRole !== 'finance' && adminAccess.teamRole !== 'superadmin') {
      return jsonError('Forbidden', 403)
    }
  }

  const { data: payouts, error } = await supabaseAdmin
    .from('coach_payouts')
    .select('id, coach_id, scheduled_for')
    .eq('status', 'scheduled')
    .is('scheduled_for', null)
    .limit(500)

  if (error) {
    return jsonError(error.message, 500)
  }

  if (!payouts || payouts.length === 0) {
    return NextResponse.json({ scheduled: 0 })
  }

  const coachIds = Array.from(new Set(payouts.map((row) => row.coach_id).filter(Boolean))) as string[]
  const { data: profiles } = coachIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, payout_schedule, payout_day')
        .in('id', coachIds)
    : { data: [] }

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))
  const updatesByCoach = new Map<string, { scheduledFor: string; payoutIds: string[] }>()

  payouts.forEach((payout) => {
    const profile = profileMap.get(payout.coach_id)
    const scheduledFor = getNextPayoutDate({
      cadence: profile?.payout_schedule,
      payoutDay: profile?.payout_day,
    }).toISOString()
    const entry = updatesByCoach.get(payout.coach_id) || { scheduledFor, payoutIds: [] }
    entry.payoutIds.push(payout.id)
    entry.scheduledFor = scheduledFor
    updatesByCoach.set(payout.coach_id, entry)
  })

  let scheduledCount = 0
  for (const entry of Array.from(updatesByCoach.values())) {
    const { error: updateError } = await supabaseAdmin
      .from('coach_payouts')
      .update({ scheduled_for: entry.scheduledFor, updated_at: new Date().toISOString() })
      .in('id', entry.payoutIds)
    if (!updateError) {
      scheduledCount += entry.payoutIds.length
    }
  }

  return NextResponse.json({ scheduled: scheduledCount })
}
