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

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const assignmentIds = Array.isArray(body.assignment_ids) ? body.assignment_ids.filter(Boolean) : []
  const status = body.status
  if (assignmentIds.length === 0) return jsonError('No assignments provided.', 400)
  if (!['paid', 'waived', 'unpaid'].includes(status)) return jsonError('Invalid status.', 400)

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { data: assignments } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('id, fee_id, athlete_id, status')
    .in('id', assignmentIds)

  const feeIds = Array.from(new Set((assignments || []).map((row) => row.fee_id)))
  const { data: fees } = feeIds.length
    ? await supabaseAdmin
        .from('org_fees')
        .select('id, org_id, amount_cents')
        .in('id', feeIds)
    : { data: [] }

  const feeMap = new Map((fees || []).map((fee) => [fee.id, fee]))
  const scopedAssignments = (assignments || []).filter((assignment) => {
    const fee = feeMap.get(assignment.fee_id)
    return fee?.org_id === orgId
  })

  if (scopedAssignments.length === 0) return jsonError('No assignments available.', 404)

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
    .in('id', scopedAssignments.map((assignment) => assignment.id))
    .select('id, fee_id, athlete_id, status, paid_at')

  if (updateError) return jsonError(updateError.message, 500)

  if (status === 'paid' || status === 'waived') {
    const receipts = (scopedAssignments || []).map((assignment) => {
      const fee = feeMap.get(assignment.fee_id)
      const amount = fee ? fee.amount_cents / 100 : 0
      return {
        payer_id: assignment.athlete_id,
        org_id: orgId,
        fee_assignment_id: assignment.id,
        amount: status === 'waived' ? 0 : amount,
        currency: 'usd',
        status: status === 'waived' ? 'waived' : 'paid',
        metadata: {
          source: 'org_fee',
          fee_id: assignment.fee_id,
          assignment_id: assignment.id,
          waived_amount: status === 'waived' ? amount : undefined,
        },
      }
    })
    if (receipts.length > 0) {
      await supabaseAdmin.from('payment_receipts').insert(receipts)
    }
  }

  return NextResponse.json({ assignments: updated || [] })
}
