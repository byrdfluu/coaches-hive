import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { orgId } = await context.params
  const body = await request.json().catch(() => ({}))
  const action = body?.action
  if (action !== 'invite' && action !== 'remove') {
    return NextResponse.json({ error: 'action must be invite or remove' }, { status: 400 })
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
    return NextResponse.json({ error: 'Organization billing admin access required' }, { status: 403 })
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
