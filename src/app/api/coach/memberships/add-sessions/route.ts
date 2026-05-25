import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { addSessionsToEnrollment } from '@/lib/coachMembershipEntitlements'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const athleteId = String(body?.athlete_id || '').trim()
  const sessionsToAdd = Number.parseInt(String(body?.sessions_to_add ?? '0'), 10)

  if (!athleteId) return jsonError('athlete_id is required')
  if (!Number.isFinite(sessionsToAdd) || sessionsToAdd < 1) {
    return jsonError('sessions_to_add must be 1 or more')
  }
  if (sessionsToAdd > 100) return jsonError('Cannot add more than 100 sessions at once')

  const result = await addSessionsToEnrollment({
    coachId: session.user.id,
    athleteId,
    sessionsToAdd,
  })

  if (!result.ok) return jsonError(result.error || 'Unable to add sessions', 400)

  return NextResponse.json({
    sessions_total: result.sessions_total,
    sessions_remaining: result.sessions_remaining,
  })
}
