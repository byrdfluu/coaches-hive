import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { resolveBaseUrl } from '@/lib/siteUrl'
import { createOrReuseStripeConnectAccount } from '@/lib/stripeConnectAccounts'
import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ORG_CONNECT_ROLES = new Set([
  'owner',
  'admin',
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
])

const userHasRole = (user: Awaited<ReturnType<typeof getMobileRequestUser>>, role: string) => {
  if (!user) return false
  const metadata = user.user_metadata || {}
  const roles = new Set([
    metadata.role,
    metadata.active_role,
    metadata.current_role,
    ...(Array.isArray(metadata.available_roles) ? metadata.available_roles : []),
  ].filter(Boolean).map(String))
  return roles.has(role)
}

const resolveOrgMembership = async (userId: string, orgId?: string | null) => {
  let query = supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role, status')
    .eq('user_id', userId)
    .in('role', Array.from(ORG_CONNECT_ROLES))

  if (orgId) query = query.eq('org_id', orgId)

  const { data } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.org_id || !ORG_CONNECT_ROLES.has(String(data.role || ''))) return null
  if (data.status && String(data.status).toLowerCase() !== 'active') return null
  return data
}

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => null)
  const role = String(body?.role || '').trim()
  const orgId = typeof body?.org_id === 'string' ? body.org_id.trim() || null : null
  const returnUrl = typeof body?.return_url === 'string' ? body.return_url.trim() : null

  if (role !== 'coach' && role !== 'org') return jsonError('role must be coach or org')
  if (!returnUrl) return jsonError('return_url is required', 400)

  let ownerType: 'coach' | 'org'
  let ownerId: string
  let metadata: Record<string, string>

  if (role === 'coach') {
    if (!userHasRole(user, 'coach')) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (String(profile?.role || '') !== 'coach') return jsonError('Forbidden', 403)
    }
    ownerType = 'coach'
    ownerId = user.id
    metadata = { owner_type: 'coach', coach_id: user.id, user_id: user.id }
  } else {
    const membership = await resolveOrgMembership(user.id, orgId)
    if (!membership?.org_id) return jsonError('Organization admin membership required', 403)
    ownerType = 'org'
    ownerId = membership.org_id
    metadata = { owner_type: 'org', org_id: membership.org_id, user_id: user.id, membership_role: String(membership.role || '') }
  }

  try {
    const accountStatus = await createOrReuseStripeConnectAccount(ownerType, ownerId, metadata)
    const baseUrl = resolveBaseUrl()

    const completeParams = new URLSearchParams({ role })
    if (ownerType === 'org') completeParams.set('org_id', ownerId)

    const accountLink = await stripe.accountLinks.create({
      account: accountStatus.stripeAccountId,
      refresh_url: `${baseUrl}/stripe/connect-refresh`,
      return_url: `${baseUrl}/stripe/connect-complete?${completeParams.toString()}`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ onboarding_url: accountLink.url })
  } catch (error: any) {
    return jsonError(error?.message || 'Unable to start Stripe Connect onboarding', 500)
  }
}
