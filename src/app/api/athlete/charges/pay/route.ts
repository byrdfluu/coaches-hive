import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

// Legacy Elements clients poll this route after Stripe confirmation. The route
// never marks a fee paid; only the signed Stripe webhook can do that.
export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error
  const body = await request.json().catch(() => null)
  const assignmentId = String(body?.assignment_id || '').trim()
  const paymentIntentId = String(body?.payment_intent_id || '').trim()
  if (!assignmentId || !paymentIntentId) return jsonError('assignment_id and payment_intent_id are required')

  const { data: assignment } = await supabaseAdmin
    .from('org_fee_assignments').select('*').eq('id', assignmentId).maybeSingle()
  if (!assignment) return jsonError('Assignment not found', 404)
  if (!(await userOwnsAthleteProfile(supabaseAdmin, session.user.id, assignment.athlete_id))) return jsonError('Forbidden', 403)
  if (String(assignment.status || '').toLowerCase() !== 'paid') {
    return NextResponse.json({ pending: true }, { status: 202 })
  }
  const recordedIntent = assignment.stripe_payment_intent_id || assignment.payment_intent_id
  if (recordedIntent && recordedIntent !== paymentIntentId) return jsonError('Payment does not match assignment', 409)
  return NextResponse.json({ assignment })
}
