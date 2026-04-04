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

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const orderId = context.params.id
  const body = await request.json().catch(() => ({}))
  const decision = String(body?.decision || '').toLowerCase()
  if (!['denied', 'approved'].includes(decision)) {
    return jsonError('decision must be approved or denied')
  }

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, org_id')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) return jsonError('Order not found.', 404)
  if (order.org_id !== orgId) return jsonError('Forbidden', 403)

  const nowIso = new Date().toISOString()
  await supabaseAdmin
    .from('order_refund_requests')
    .update({
      status: decision,
      resolved_at: nowIso,
      resolver_id: session.user.id,
      updated_at: nowIso,
      notes: body?.notes || null,
    })
    .eq('order_id', orderId)
    .eq('status', 'requested')

  if (decision === 'denied') {
    await supabaseAdmin
      .from('orders')
      .update({
        refund_status: 'denied',
      })
      .eq('id', orderId)
  }

  return NextResponse.json({ ok: true })
}
