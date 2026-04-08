import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const allowedRoles = [
  'athlete',
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'admin',
]

export async function GET(request: Request, context: { params: Promise<{ assignmentId: string }> }) {
  const { session, role, error } = await getSessionRole(allowedRoles)
  if (error || !session) return error

  const { assignmentId } = await context.params
  if (!assignmentId) return jsonError('Missing receipt.', 400)

  const { data: assignment } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('id, fee_id, athlete_id, status, paid_at')
    .eq('id', assignmentId)
    .maybeSingle()
  if (!assignment) return jsonError('Receipt not found.', 404)

  if (role === 'athlete' && assignment.athlete_id !== session.user.id) {
    return jsonError('Forbidden', 403)
  }

  const { data: fee } = await supabaseAdmin
    .from('org_fees')
    .select('id, org_id, title, amount_cents, due_date')
    .eq('id', assignment.fee_id)
    .maybeSingle()
  if (!fee) return jsonError('Receipt not found.', 404)

  let receipt = await supabaseAdmin
    .from('payment_receipts')
    .select('id, amount, currency, status, created_at')
    .eq('fee_assignment_id', assignmentId)
    .maybeSingle()

  if (!receipt.data && (assignment.status === 'paid' || assignment.status === 'waived')) {
    const amount = fee.amount_cents / 100
    const inserted = await supabaseAdmin
      .from('payment_receipts')
      .insert({
        payer_id: assignment.athlete_id,
        org_id: fee.org_id,
        fee_assignment_id: assignment.id,
        amount: assignment.status === 'waived' ? 0 : amount,
        currency: 'usd',
        status: assignment.status === 'waived' ? 'waived' : 'paid',
        metadata: {
          source: 'org_fee',
          fee_id: fee.id,
          assignment_id: assignment.id,
          waived_amount: assignment.status === 'waived' ? amount : undefined,
        },
      })
      .select('id, amount, currency, status, created_at')
      .single()
    receipt = inserted
  }

  const receiptRow = receipt.data
  if (!receiptRow) return jsonError('Receipt not available.', 404)

  const content = [
    'CoachesHive Receipt',
    `Receipt ID: ${receiptRow.id}`,
    `Fee: ${fee.title}`,
    `Amount: $${Number(receiptRow.amount).toFixed(2)}`,
    `Status: ${receiptRow.status}`,
    `Paid at: ${assignment.paid_at || receiptRow.created_at || 'n/a'}`,
    `Due date: ${fee.due_date || 'n/a'}`,
  ].join('\n')

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="receipt-${assignmentId}.txt"`,
    },
  })
}
