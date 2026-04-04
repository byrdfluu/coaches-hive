import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const adminRoles = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'admin',
]

const resolveOrgId = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.org_id || null
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const assignmentId = context.params.id
  const body = await request.json().catch(() => ({}))
  const status = body?.status
  if (!assignmentId || !status) return jsonError('Missing assignment or status.', 400)

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { data: assignment } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('id, fee_id, athlete_id, status, paid_at')
    .eq('id', assignmentId)
    .maybeSingle()
  if (!assignment) return jsonError('Assignment not found.', 404)

  const { data: fee } = await supabaseAdmin
    .from('org_fees')
    .select('id, org_id, amount_cents, title')
    .eq('id', assignment.fee_id)
    .maybeSingle()
  if (!fee || fee.org_id !== orgId) return jsonError('Assignment not available.', 403)

  const updates: Record<string, any> = { status }
  if (status === 'paid') {
    updates.paid_at = new Date().toISOString()
  } else if (status === 'waived') {
    updates.paid_at = null
  } else if (status !== 'paid') {
    updates.paid_at = null
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('org_fee_assignments')
    .update(updates)
    .eq('id', assignmentId)
    .select('id, fee_id, athlete_id, status, paid_at')
    .single()

  if (updateError || !updated) return jsonError(updateError?.message || 'Unable to update assignment.', 500)

  if (status === 'paid' || status === 'waived') {
    const amount = fee.amount_cents / 100
    await supabaseAdmin.from('payment_receipts').insert({
      payer_id: assignment.athlete_id,
      org_id: fee.org_id,
      fee_assignment_id: assignment.id,
      amount: status === 'waived' ? 0 : amount,
      currency: 'usd',
      status: status === 'waived' ? 'waived' : 'paid',
      metadata: {
        source: 'org_fee',
        fee_id: fee.id,
        assignment_id: assignment.id,
        waived_amount: status === 'waived' ? amount : undefined,
      },
    })
  }

  return NextResponse.json({ assignment: updated })
}
