import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getPlatformSubscriptionSnapshot, resolvePlatformActor } from '@/lib/platformSubscription'
import { ALL_ACCESS_PRICING } from '@/lib/allAccessPricing'

export const dynamic = 'force-dynamic'

const roles = ['coach','athlete','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager']

export async function GET() {
  const { session, error } = await getSessionRole(roles)
  if (error || !session) return error
  const actor = await resolvePlatformActor(session.user.id)
  if (!actor) return jsonError('Billing account not found', 404)

  if (actor.role === 'athlete') {
    return NextResponse.json({
      plan: 'Athlete & Family Access', billing: 'Free', billing_interval: null,
      status: 'active', renewal: 'No renewal required', renewal_date: null,
      purchase_channel: null, sponsored_by: null,
    })
  }

  const snapshot = await getPlatformSubscriptionSnapshot(actor)
  if (actor.mobileBillingRole === 'org_covered_coach' && actor.organizationId) {
    const { data: organization } = await supabaseAdmin.from('organizations').select('name').eq('id', actor.organizationId).maybeSingle()
    const organizationName = organization?.name || 'your organization'
    return NextResponse.json({
      plan: 'Organization-Sponsored Coach',
      billing: `Covered by ${organizationName}`,
      billing_interval: snapshot.billing_interval || null,
      status: snapshot.status,
      renewal: snapshot.current_period_end || 'No renewal date available',
      renewal_date: snapshot.current_period_end || null,
      purchase_channel: snapshot.purchase_channel || null,
      sponsored_by: organizationName,
    })
  }

  const interval = snapshot.billing_interval === 'annual' ? 'annual' : 'monthly'
  const amount = snapshot.renewal_amount ?? snapshot.base_amount ?? (
    actor.role === 'org'
      ? ALL_ACCESS_PRICING.org[interval === 'annual' ? 'year' : 'month']
      : ALL_ACCESS_PRICING.coach[interval === 'annual' ? 'year' : 'month']
  )
  return NextResponse.json({
    plan: actor.role === 'org' ? 'Organization Plan' : 'Individual Coach Plan',
    billing: amount == null ? 'Not available' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount / 100),
    billing_interval: snapshot.billing_interval || null,
    status: snapshot.status,
    renewal: snapshot.current_period_end || 'No renewal date available',
    renewal_date: snapshot.current_period_end || null,
    purchase_channel: snapshot.purchase_channel || null,
    sponsored_by: null,
    cancel_at_period_end: Boolean(snapshot.cancel_at_period_end),
  })
}
