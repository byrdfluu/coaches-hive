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

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('stripe_account_id, plan, plan_status, org_refund_policy')
    .eq('org_id', orgId)
    .maybeSingle()

  const orgTier = normalizeOrgTier(orgSettings?.plan)
  const planStatus = normalizeOrgStatus(orgSettings?.plan_status)

  const body = await request.json().catch(() => ({}))
  const {
    title,
    type,
    status = 'published',
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
    shipping_required = false,
    shipping_notes,
  } = body || {}

  const normalizedStatus = String(status || 'draft').toLowerCase()

  if (!['draft', 'published'].includes(normalizedStatus)) {
    return jsonError('Status must be draft or published')
  }

  if (!title || !String(title).trim()) {
    return jsonError('title is required')
  }
  if (!type || !String(type).trim()) {
    return jsonError('type is required')
  }

  const normalizedPrice = price !== null && price !== undefined && String(price).trim() !== ''
    ? Number(price)
    : null
  if (normalizedPrice !== null && (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0)) {
    return jsonError('Price must be greater than 0')
  }
  const normalizedSalePrice = sale_price !== null && sale_price !== undefined && String(sale_price).trim() !== ''
    ? Number(sale_price)
    : null
  if (normalizedSalePrice !== null && (!Number.isFinite(normalizedSalePrice) || normalizedSalePrice <= 0)) {
    return jsonError('Sale price must be greater than 0')
  }
  if (normalizedSalePrice !== null && normalizedPrice === null) {
    return jsonError('Enter a valid main price before adding a sale price')
  }
  if (normalizedSalePrice !== null && normalizedPrice !== null && normalizedSalePrice >= normalizedPrice) {
    return jsonError('Sale price must be lower than price')
  }
  const normalizedFormat = format ? String(format).trim().toLowerCase() : ''
  const normalizedDescription = description ? String(description).trim() : ''
  const normalizedMediaUrl = media_url ? String(media_url).trim() : ''
  const normalizedShippingRequired = Boolean(shipping_required)
  const normalizedShippingNotes = shipping_notes ? String(shipping_notes).trim() : ''
  const normalizedInventory = inventory_count !== null && inventory_count !== undefined && String(inventory_count).trim() !== ''
    ? Number.parseInt(String(inventory_count), 10)
    : null
  if (normalizedInventory !== null && (!Number.isFinite(normalizedInventory) || normalizedInventory < 0)) {
    return jsonError('Inventory must be 0 or greater')
  }
  const normalizedRefundPolicy = refund_policy ? String(refund_policy).trim() : ''
  const orgDefaultRefundPolicy = String(orgSettings?.org_refund_policy || '').trim()
  const effectiveRefundPolicy = normalizedRefundPolicy || orgDefaultRefundPolicy
  if (!effectiveRefundPolicy) {
    return jsonError('Refund policy is required')
  }

  if (normalizedStatus === 'published') {
    if (!isOrgPlanActive(planStatus)) {
      return jsonError('Activate billing to publish marketplace products.', 403)
    }
    if (!ORG_FEATURES[orgTier].marketplacePublishing) {
      return jsonError('Org marketplace publishing is available on Growth or Enterprise.', 403)
    }
    if (!orgSettings?.stripe_account_id) {
      return jsonError('Connect Stripe before creating org products.', 403)
    }
    if (normalizedPrice === null || normalizedPrice <= 0) {
      return jsonError('Price must be greater than 0')
    }
    if (!normalizedFormat) {
      return jsonError('Format is required before publishing')
    }
    if (!normalizedDescription) {
      return jsonError('Description is required before publishing')
    }
    if (!normalizedMediaUrl) {
      return jsonError('Upload at least one media asset before publishing')
    }
    if (normalizedFormat === 'physical' && (normalizedInventory === null || normalizedInventory < 1)) {
      return jsonError('Physical products require inventory_count of at least 1 before publishing')
    }
    if (normalizedShippingRequired && !normalizedShippingNotes) {
      return jsonError('Shipping notes are required when shipping_required is true')
    }
    const limit = ORG_MARKETPLACE_LIMITS[orgTier]
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

  const { data, error: insertError } = await supabaseAdmin
    .from('products')
    .insert({
      title: String(title).trim(),
      type: String(type).trim(),
      status: normalizedStatus,
      price: normalizedPrice,
      sale_price: normalizedSalePrice,
      discount_label: discount_label ? String(discount_label).trim() : null,
      price_label: price_label ? String(price_label).trim() : null,
      format: normalizedFormat || null,
      duration: duration ? String(duration).trim() : null,
      next_available: next_available ? new Date(String(next_available)).toISOString() : null,
      includes: Array.isArray(includes)
        ? includes.map((item) => String(item).trim()).filter(Boolean)
        : null,
      refund_policy: effectiveRefundPolicy || null,
      description: normalizedDescription || null,
      media_url: normalizedMediaUrl || null,
      org_id: orgId,
      inventory_count: normalizedInventory,
      shipping_required: normalizedShippingRequired,
      shipping_notes: normalizedShippingNotes || null,
    })
    .select('*')
    .single()

  if (insertError) {
    return jsonError(insertError.message)
  }

  return NextResponse.json({ product: data })
}
