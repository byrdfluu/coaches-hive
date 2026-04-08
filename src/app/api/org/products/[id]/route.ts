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

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { id: productId } = await context.params
  const { data } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!data) {
    return jsonError('Product not found.', 404)
  }

  return NextResponse.json({ product: data })
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { id: productId } = await context.params
  const { data: existingProduct } = await supabaseAdmin
    .from('products')
    .select('id, org_id, status')
    .eq('id', productId)
    .maybeSingle()

  if (!existingProduct || existingProduct.org_id !== orgId) {
    return jsonError('Product not found.', 404)
  }
  const body = await request.json().catch(() => ({}))
  const {
    title,
    type,
    status,
    price,
    sale_price,
    discount_label,
    price_label,
    format,
    duration,
    next_available,
    includes,
    refund_policy,
    description,
    media_url,
    inventory_count,
    shipping_required,
    shipping_notes,
  } = body || {}

  const normalizedPrice = price !== null && price !== undefined ? Number(price) : null
  const normalizedSalePrice = sale_price !== null && sale_price !== undefined ? Number(sale_price) : null
  if (normalizedSalePrice !== null && (!Number.isFinite(normalizedSalePrice) || normalizedSalePrice <= 0)) {
    return jsonError('Sale price must be greater than 0')
  }
  if (normalizedSalePrice !== null && normalizedPrice !== null && normalizedSalePrice >= normalizedPrice) {
    return jsonError('Sale price must be lower than price')
  }

  const normalizedStatus = status ? String(status).toLowerCase() : null
  if (normalizedStatus === 'published' && existingProduct.status !== 'published') {
    const { tier, status: planStatus, stripeConnected } = await resolveOrgPlan(orgId)
    if (!isOrgPlanActive(planStatus)) {
      return jsonError('Activate billing to update marketplace products.', 403)
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
      if ((count || 0) >= limit) {
        return jsonError(`Marketplace listing limit reached (${limit}).`, 403)
      }
    }
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('products')
    .update({
      title,
      type,
      status: normalizedStatus ?? status,
      price: normalizedPrice,
      sale_price: normalizedSalePrice,
      discount_label: discount_label ? String(discount_label).trim() : null,
      price_label: price_label ? String(price_label).trim() : null,
      format: format ? String(format).trim() : null,
      duration: duration ? String(duration).trim() : null,
      next_available: next_available ? new Date(String(next_available)).toISOString() : null,
      includes: Array.isArray(includes)
        ? includes.map((item) => String(item).trim()).filter(Boolean)
        : null,
      refund_policy: refund_policy ? String(refund_policy).trim() : null,
      description,
      media_url,
      inventory_count,
      shipping_required,
      shipping_notes,
    })
    .eq('id', productId)
    .eq('org_id', orgId)
    .select('*')
    .maybeSingle()

  if (updateError) {
    return jsonError(updateError.message)
  }

  if (!data) {
    return jsonError('Product not found.', 404)
  }

  return NextResponse.json({ product: data })
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { id: productId } = await context.params
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id, org_id')
    .eq('id', productId)
    .maybeSingle()

  if (!product) {
    return jsonError('Product not found.', 404)
  }

  if (product.org_id !== orgId) {
    return jsonError('Forbidden', 403)
  }

  const { error: deleteError } = await supabaseAdmin
    .from('products')
    .delete()
    .eq('id', productId)

  if (deleteError) {
    return jsonError(deleteError.message)
  }

  return NextResponse.json({ ok: true })
}
