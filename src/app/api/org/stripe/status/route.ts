import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveActiveOrganizationForUser } from '@/lib/activeOrganization'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
export const dynamic = 'force-dynamic'

const ADMIN_ROLES = [
  'org_admin', 'club_admin', 'travel_admin', 'school_admin',
  'athletic_director', 'program_director', 'team_manager', 'admin', 'superadmin',
]

export async function GET() {
  const { session, error } = await getSessionRole(ADMIN_ROLES)
  if (error || !session) return error

  const context = await resolveActiveOrganizationForUser(session.user.id)
  const membership = context ? { org_id: context.organizationId, role: context.role } : null

  if (!membership?.org_id) return jsonError('Organization not found', 404)

  if (!ADMIN_ROLES.includes(membership.role || '')) {
    return jsonError('Only organization admins can view Stripe status', 403)
  }

  try {
    const account = await loadStripeConnectAccountStatus('org', membership.org_id, { refresh: true })
    if (!account?.stripeAccountId) {
      return NextResponse.json({ connected: false, stripe_account_id: null, currently_due: [], charges_enabled: false })
    }

    return NextResponse.json({
      connected: isStripeConnectEnabled(account),
      stripe_account_id: account.stripeAccountId,
      charges_enabled: account.chargesEnabled,
      payouts_enabled: account.payoutsEnabled,
      details_submitted: account.detailsSubmitted,
      currently_due: account.requirementsDue,
      eventually_due: account.requirementsDue,
      disabled_reason: account.disabledReason,
      connect_status: account.connectStatus,
    })
  } catch (err: any) {
    return jsonError(err?.message || 'Unable to retrieve Stripe account status', 500)
  }
}
