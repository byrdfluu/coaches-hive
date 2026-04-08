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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const { id: feeId } = await context.params
  if (!feeId) return jsonError('Missing fee.', 400)

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { data: fee } = await supabaseAdmin
    .from('org_fees')
    .select('id, org_id, amount_cents')
    .eq('id', feeId)
    .maybeSingle()
  if (!fee || fee.org_id !== orgId) return jsonError('Fee not available.', 403)

  const { data: assignments } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('id, fee_id, athlete_id, status')
    .eq('fee_id', feeId)

  const targetIds = (assignments || [])
    .filter((row) => row.status === 'unpaid')
    .map((row) => row.id)

  if (targetIds.length === 0) return NextResponse.json({ assignments: [] })

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('org_fee_assignments')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .in('id', targetIds)
    .select('id, fee_id, athlete_id, status, paid_at')

  if (updateError) return jsonError(updateError.message, 500)

  const receipts = (assignments || [])
    .filter((row) => targetIds.includes(row.id))
    .map((assignment) => ({
      payer_id: assignment.athlete_id,
      org_id: orgId,
      fee_assignment_id: assignment.id,
      amount: fee.amount_cents / 100,
      currency: 'usd',
      status: 'paid',
      metadata: { source: 'org_fee', fee_id: fee.id, assignment_id: assignment.id },
    }))
  if (receipts.length > 0) {
    await supabaseAdmin.from('payment_receipts').insert(receipts)
  }

  return NextResponse.json({ assignments: updated || [] })
}
