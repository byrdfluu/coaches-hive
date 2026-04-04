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

const getOrgId = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.org_id || null
}

const isPlatformAdminRole = (role: string | null) => role === 'admin' || role === 'superadmin'

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(ADMIN_ROLES)
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const requestedOrgId = typeof body?.org_id === 'string' ? body.org_id : null
  let orgId = await getOrgId(session.user.id)
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

  let stripeAccountId = orgSettings?.stripe_account_id || null

  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      metadata: { org_id: orgId },
    })
    stripeAccountId = account.id
    await supabaseAdmin
      .from('org_settings')
      .upsert({ org_id: orgId, stripe_account_id: stripeAccountId }, { onConflict: 'org_id' })
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL
    || process.env.NEXTAUTH_URL
    || 'http://localhost:3000'

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${baseUrl}/org/stripe-setup?stripe=refresh`,
    return_url: `${baseUrl}/org/stripe-setup?stripe=success`,
    type: 'account_onboarding',
  })

  return NextResponse.json({ url: accountLink.url, stripe_account_id: stripeAccountId })
}
