import { NextResponse } from 'next/server'
import { ALL_ACCESS_PRICING, formatUsdCents } from '@/lib/allAccessPricing'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { previewOrgCoachSeatChange } from '@/lib/orgCoachBilling'
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

  try {
    const preview = await previewOrgCoachSeatChange(orgId, action)
    const rawDelta = action === 'remove' ? -preview.amountDueNow : preview.amountDueNow
    const intervalLabel = preview.billingInterval === 'year' ? 'year' : 'month'
    const effectiveDescription = preview.nextAdditionalCoachCount === preview.currentAdditionalCoachCount
      ? action === 'invite'
        ? 'This coach is covered by the coach seat included with Organization All Access.'
        : 'Removing this coach does not change your organization subscription.'
      : action === 'invite'
        ? `This coach will add ${formatUsdCents(preview.recurringSeatAmount)}/${intervalLabel} to your organization subscription. ${formatUsdCents(preview.amountDueNow)} is due now after proration.`
        : `Removing this coach will reduce your organization subscription by ${formatUsdCents(preview.recurringSeatAmount)}/${intervalLabel}. Stripe estimates a ${formatUsdCents(preview.amountDueNow)} prorated credit.`

    return NextResponse.json({
      delta_coach_count: action === 'invite' ? 1 : -1,
      delta_amount_cents: rawDelta,
      currency: preview.currency,
      effective_description: effectiveDescription,
      is_prorated_preview: preview.createsPaidSeat,
      coach_seat_unit_amount: ALL_ACCESS_PRICING.org.additionalCoach[preview.billingInterval],
      billing_interval: preview.billingInterval === 'year' ? 'annual' : 'monthly',
      next_additional_coach_count: preview.nextAdditionalCoachCount,
    })
  } catch (error) {
    console.error('[mobile/organizations/coach-seat-preview]', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to preview coach-seat billing.',
    }, { status: 409 })
  }
}
