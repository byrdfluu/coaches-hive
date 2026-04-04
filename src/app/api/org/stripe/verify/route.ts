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

  const { account_id, org_id } = await request.json().catch(() => ({}))
  if (!account_id) return jsonError('account_id is required', 400)

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .maybeSingle()

  let orgId = membership?.org_id || null
  if (!orgId && typeof org_id === 'string' && isPlatformAdminRole(role)) {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('id', org_id)
      .maybeSingle()
    orgId = org?.id || null
  }

  if (!orgId) return jsonError('Organization not found', 404)

  try {
    const account = await stripe.accounts.retrieve(String(account_id))
    await supabaseAdmin
      .from('org_settings')
      .upsert({ org_id: orgId, stripe_account_id: account.id }, { onConflict: 'org_id' })
    return NextResponse.json({
      stripe_account_id: account.id,
      connected: Boolean((account as { charges_enabled?: boolean }).charges_enabled),
    })
  } catch (err: any) {
    return jsonError(err?.message || 'Unable to verify Stripe account', 500)
  }
}
