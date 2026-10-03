import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mobileError } from '@/lib/mobilePaymentApi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BILLING_ADMIN_ROLES = new Set([
  'org_admin', 'club_admin', 'travel_admin', 'school_admin',
  'athletic_director', 'program_director',
])

export async function POST(
  request: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const user = await getMobileRequestUser(request)
  if (!user) return mobileError('Authentication is required.', 401, false)
  const { orgId } = await context.params
  const body = await request.json().catch(() => ({}))
  const action = body?.action
  if (action !== 'invite' && action !== 'remove') {
    return mobileError('Action must be invite or remove.', 422, false)
  }

  const { data: membership } = await supabaseAdmin.from('organization_memberships')
    .select('role, status')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (
    !membership
    || membership.status === 'suspended'
    || !BILLING_ADMIN_ROLES.has(String(membership.role || ''))
  ) {
    return mobileError('Organization billing administrator access is required.', 403, false)
  }

  return NextResponse.json({
    delta_coach_count: action === 'invite' ? 1 : -1,
    delta_amount_cents: 0,
    currency: 'usd',
    effective_description: 'Organization coaches are included. This change does not alter billing.',
    is_prorated_preview: false,
    billing_change: false,
  })
}
