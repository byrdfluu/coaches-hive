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

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { id: orderId } = await context.params
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, org_id, payment_intent_id, amount')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) return jsonError('Order not found.', 404)
  if (order.org_id !== orgId) return jsonError('Forbidden', 403)
  if (!order.payment_intent_id) return jsonError('No payment intent on order.', 400)

  return jsonError(
    'Direct organization refunds are retired. Refunds must be reviewed in the superadmin refund queue.',
    410,
  )
}
