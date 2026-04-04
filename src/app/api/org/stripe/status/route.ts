import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'
export const dynamic = 'force-dynamic'

const ADMIN_ROLES = [
  'org_admin', 'club_admin', 'travel_admin', 'school_admin',
  'athletic_director', 'program_director', 'team_manager', 'admin', 'superadmin',
]

export async function GET() {
  const { session, error } = await getSessionRole(ADMIN_ROLES)
  if (error || !session) return error

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!membership?.org_id) return jsonError('Organization not found', 404)

  if (!ADMIN_ROLES.includes(membership.role || '')) {
    return jsonError('Only organization admins can view Stripe status', 403)
  }

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('stripe_account_id')
    .eq('org_id', membership.org_id)
    .maybeSingle()

  if (!orgSettings?.stripe_account_id) {
    return NextResponse.json({ connected: false, stripe_account_id: null, currently_due: [], charges_enabled: false })
  }

  try {
    const account = await stripe.accounts.retrieve(orgSettings.stripe_account_id)
    const acc = account as any
    return NextResponse.json({
      connected: Boolean(acc.charges_enabled),
      stripe_account_id: account.id,
      charges_enabled: Boolean(acc.charges_enabled),
      payouts_enabled: Boolean(acc.payouts_enabled),
      currently_due: (acc.requirements?.currently_due as string[] | null) || [],
      eventually_due: (acc.requirements?.eventually_due as string[] | null) || [],
      disabled_reason: acc.requirements?.disabled_reason || null,
    })
  } catch (err: any) {
    return jsonError(err?.message || 'Unable to retrieve Stripe account status', 500)
  }
}
