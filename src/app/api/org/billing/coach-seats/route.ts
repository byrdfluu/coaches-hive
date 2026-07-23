import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { calculateActiveOrgCoachCount } from '@/lib/orgCoachBilling'
import { ALL_ACCESS_PRICING } from '@/lib/allAccessPricing'
import { getOrgIdForUser } from '@/lib/billingState'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const orgId = await getOrgIdForUser(session.user.id)
  if (!orgId) return NextResponse.json({ error: 'Organization membership required' }, { status: 403 })
  const summary = await calculateActiveOrgCoachCount(orgId)
  const { data: subscription } = await supabaseAdmin.from('platform_subscriptions')
    .select('billing_interval, status')
    .eq('owner_type', 'org')
    .eq('owner_id', orgId)
    .maybeSingle()
  return NextResponse.json({
    ...summary,
    monthlyCoachSeatAmount: ALL_ACCESS_PRICING.org.additionalCoach.month,
    annualCoachSeatAmount: ALL_ACCESS_PRICING.org.additionalCoach.year,
    billingInterval: subscription?.billing_interval === 'year' ? 'year' : 'month',
    subscriptionStatus: subscription?.status || null,
  })
}
