import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'
import { createMobileCheckoutToken, type MobileCheckoutType } from '@/lib/mobileCheckoutToken'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { resolveBaseUrl } from '@/lib/siteUrl'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ORG_ROLES = new Set([
  'org_admin', 'club_admin', 'travel_admin', 'school_admin',
  'athletic_director', 'program_director', 'team_manager',
])

const checkoutPath: Record<MobileCheckoutType, string> = {
  fee: '/pay',
  marketplace: '/marketplace/checkout',
  onboarding: '/onboarding/checkout',
}

export async function POST(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => null)
  const type = String(body?.type || '') as MobileCheckoutType
  if (!checkoutPath[type]) return jsonError('Unsupported checkout type')

  let resourceId: string | undefined
  let athleteProfileId: string | undefined
  let role: string | undefined
  let tier: string | undefined

  if (type === 'fee') {
    const assignmentId = String(body?.assignment_id || body?.assignmentId || '').trim()
    const feeId = String(body?.fee_id || body?.feeId || '').trim()
    const requestedAthleteId = String(body?.athlete_profile_id || body?.athlete_id || body?.athleteId || '').trim()

    let query = supabaseAdmin.from('org_fee_assignments').select('id, athlete_id, status')
    if (assignmentId) query = query.eq('id', assignmentId)
    else {
      if (!feeId || !requestedAthleteId) return jsonError('assignment_id or fee_id + athlete_id is required')
      query = query.eq('fee_id', feeId).eq('athlete_id', requestedAthleteId)
    }
    const { data: assignment } = await query.limit(1).maybeSingle()
    if (!assignment) return jsonError('Fee assignment not found', 404)
    if (String(assignment.status || '').toLowerCase() === 'paid') return jsonError('Fee is already paid', 409)
    if (!(await userOwnsAthleteProfile(supabaseAdmin, user.id, assignment.athlete_id))) {
      return jsonError('Forbidden', 403)
    }
    resourceId = assignment.id
    athleteProfileId = assignment.athlete_id
  }

  if (type === 'marketplace') {
    const itemId = String(body?.item_id || body?.itemId || body?.item || '').trim()
    if (!itemId) return jsonError('item_id is required')
    const { data: item } = await supabaseAdmin
      .from('marketplace_items')
      .select('id, is_active, inventory_count')
      .eq('id', itemId)
      .maybeSingle()
    if (!item || !item.is_active) return jsonError('Marketplace item not found', 404)
    if (item.inventory_count !== null && Number(item.inventory_count) <= 0) {
      return jsonError('Marketplace item is out of stock', 409)
    }
    resourceId = item.id
  }

  if (type === 'onboarding') {
    role = String(body?.role || user.user_metadata?.active_role || user.user_metadata?.role || '').trim()
    tier = String(body?.tier || '').trim()
    if (role !== 'coach' && !ORG_ROLES.has(role)) return jsonError('Unsupported onboarding role')
    if (!tier) return jsonError('tier is required')

    const metadataRoles = new Set([
      user.user_metadata?.role,
      user.user_metadata?.active_role,
      ...(Array.isArray(user.user_metadata?.available_roles) ? user.user_metadata.available_roles : []),
    ].filter(Boolean).map(String))
    if (!metadataRoles.has(role)) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (String(profile?.role || '') !== role) return jsonError('Forbidden', 403)
    }
  }

  try {
    const { token, claims } = createMobileCheckoutToken({
      type,
      userId: user.id,
      resourceId,
      athleteProfileId,
      role,
      tier,
    })

    const { error } = await supabaseAdmin.from('mobile_checkout_handoffs').insert({
      nonce: claims.nonce,
      user_id: user.id,
      checkout_type: type,
      resource_id: resourceId || null,
      token_expires_at: new Date(claims.expiresAt * 1000).toISOString(),
      expires_at: new Date(claims.expiresAt * 1000).toISOString(),
      status: 'issued',
      metadata: { athlete_profile_id: athleteProfileId || null, role: role || null, tier: tier || null },
    })
    if (error) return jsonError('Unable to create checkout handoff', 500)

    const url = `${resolveBaseUrl()}${checkoutPath[type]}?token=${encodeURIComponent(token)}`
    return NextResponse.json({ url, token, expires_at: claims.expiresAt })
  } catch (error: any) {
    return jsonError(error?.message || 'Unable to create checkout handoff', 500)
  }
}

