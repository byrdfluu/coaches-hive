import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ORG_FEATURES, ORG_MARKETPLACE_LIMITS, isOrgPlanActive, normalizeOrgStatus, normalizeOrgTier } from '@/lib/planRules'
export const dynamic = 'force-dynamic'


const adminRoles = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'admin',
]

const resolveOrgId = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.org_id || null
}

const resolveOrgPlan = async (orgId: string) => {
  const { data } = await supabaseAdmin
    .from('org_settings')
    .select('plan, plan_status, stripe_account_id')
    .eq('org_id', orgId)
    .maybeSingle()
  return {
    tier: normalizeOrgTier(data?.plan),
    status: normalizeOrgStatus(data?.plan_status),
    stripeConnected: Boolean(data?.stripe_account_id),
  }
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const body = await request.json().catch(() => ({}))
  const productIds = Array.isArray(body.product_ids) ? body.product_ids.filter(Boolean) : []
  if (productIds.length === 0) return jsonError('No products selected.', 400)

  const status = body.status ? String(body.status).toLowerCase() : null
  const teamIdRaw = body.team_id === undefined ? undefined : body.team_id
  const teamId = teamIdRaw === 'all' || teamIdRaw === '' ? null : teamIdRaw

  if (!status && teamIdRaw === undefined) {
    return jsonError('No updates requested.', 400)
  }

  if (teamId !== null && teamId !== undefined) {
    const { data: team } = await supabaseAdmin
      .from('org_teams')
      .select('id')
      .eq('id', teamId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!team) return jsonError('Invalid team.', 400)
  }

  const { data: orgMembers } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id, role')
    .eq('org_id', orgId)

  const coachIds = (orgMembers || [])
    .filter((row) => ['coach', 'assistant_coach'].includes(String(row.role)))
    .map((row) => row.user_id)

  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, org_id, coach_id, status')
    .in('id', productIds)

  if (!products || products.length === 0) {
    return jsonError('Products not found.', 404)
  }

  const authorizedIds = products
    .filter((product) => product.org_id === orgId || (product.coach_id && coachIds.includes(product.coach_id)))
    .map((product) => product.id)

  if (authorizedIds.length === 0) {
    return jsonError('Forbidden', 403)
  }

  const updates: Record<string, unknown> = {}
  if (status) updates.status = status
  if (teamIdRaw !== undefined) updates.team_id = teamId

  if (status === 'published') {
    const { tier, status: planStatus, stripeConnected } = await resolveOrgPlan(orgId)
    if (!isOrgPlanActive(planStatus)) {
      return jsonError('Activate billing to publish marketplace products.', 403)
    }
    if (!ORG_FEATURES[tier].marketplacePublishing) {
      return jsonError('Org marketplace publishing is available on Growth or Enterprise.', 403)
    }
    if (!stripeConnected) {
      return jsonError('Connect Stripe before publishing org products.', 403)
    }
    const limit = ORG_MARKETPLACE_LIMITS[tier]
    if (limit !== null) {
      const { count } = await supabaseAdmin
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'published')
      const newlyPublishing = products.filter(
        (product) => product.org_id === orgId && String(product.status).toLowerCase() !== 'published'
      ).length
      if ((count || 0) + newlyPublishing > limit) {
        return jsonError(`Marketplace listing limit reached (${limit}).`, 403)
      }
    }
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('products')
    .update(updates)
    .in('id', authorizedIds)
    .select('id, status, team_id')

  if (updateError) {
    return jsonError(updateError.message)
  }

  return NextResponse.json({ updated: updated || [] })
}
