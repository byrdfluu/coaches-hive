import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'
export const dynamic = 'force-dynamic'


const ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'admin',
  'superadmin',
]

const isPlatformAdminRole = (role: string | null) => role === 'admin' || role === 'superadmin'

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(ADMIN_ROLES)
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const requestedOrgId = typeof body?.org_id === 'string' ? body.org_id : null

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .maybeSingle()

  let orgId = membership?.org_id || null
  if (!orgId && requestedOrgId && isPlatformAdminRole(role)) {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('id', requestedOrgId)
      .maybeSingle()
    orgId = org?.id || null
  }

  if (!orgId) return jsonError('Organization not found', 404)

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('stripe_account_id')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!orgSettings?.stripe_account_id) {
    return jsonError('Stripe account not connected', 404)
  }

  const loginLink = await stripe.accounts.createLoginLink(orgSettings.stripe_account_id)
  return NextResponse.json({ url: loginLink.url })
}
