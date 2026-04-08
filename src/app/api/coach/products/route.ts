import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import {
  DEFAULT_DRAFT_PRODUCT_CATEGORY,
  DEFAULT_DRAFT_PRODUCT_TYPE,
  normalizeCoachProductCategoryInput,
  normalizeCoachProductType,
} from '@/lib/coachMarketplaceProductType'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { COACH_MARKETPLACE_ALLOWED, formatTierName, normalizeCoachTier } from '@/lib/planRules'
import { trackServerFlowEvent, trackServerFlowFailure } from '@/lib/serverFlowTelemetry'
import { trackMixpanelServerEvent } from '@/lib/mixpanelServer'
export const dynamic = 'force-dynamic'

const safeServerError = (message: string, status = 500) =>
  NextResponse.json({ error: message }, { status })

const isMissingProductColumnError = (error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined) => {
  if (!error) return false
  if (error.code === 'PGRST204' || error.code === '42703') return true
  const haystack = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return haystack.includes('column') && haystack.includes('products')
}

const getProductSchemaErrorMessage = (error: { message?: string | null; details?: string | null; code?: string | null } | null | undefined) => {
  const databaseMessage = [error?.message, error?.details].filter(Boolean).join(' ').trim()
  return [
    databaseMessage || 'Marketplace product save failed because the products table schema is missing required columns.',
    'Run the Supabase product migrations: `products_price.sql`, `products_description_media.sql`, `products_refund_discounts.sql`, and `products_category.sql`.',
  ].join(' ')
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const previewMode = process.env.NODE_ENV !== 'production' || process.env.MARKETPLACE_PREVIEW === 'true'

  const body = await request.json().catch(() => null)
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
    media_url: mediaUrl,
  } = body || {}

  const normalizedStatus = String(status || '').toLowerCase()
  const normalizedTitle = title ? String(title).trim() : ''
  const normalizedCategory = normalizeCoachProductCategoryInput(body?.category ?? type)

  if (!status || !['published', 'draft'].includes(normalizedStatus)) {
    trackServerFlowEvent({
      flow: 'coach_product_create',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role: 'coach',
      metadata: { reason: 'invalid_status', status: normalizedStatus || null },
    })
    return jsonError('Status must be published or draft')
  }

  if (normalizedStatus === 'published' && !normalizedTitle) {
    trackServerFlowEvent({
      flow: 'coach_product_create',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role: 'coach',
      metadata: { reason: 'missing_title' },
    })
    return jsonError('Title is required')
  }

  if (normalizedStatus === 'published' && !normalizedCategory) {
    trackServerFlowEvent({
      flow: 'coach_product_create',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role: 'coach',
      metadata: { reason: 'missing_type' },
    })
    return jsonError('Type is required')
  }
  const normalizedPrice = price !== null && price !== undefined && String(price).trim() !== '' ? Number(price) : null
  if (normalizedPrice !== null && (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0)) {
    trackServerFlowEvent({
      flow: 'coach_product_create',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role: 'coach',
      metadata: { reason: 'invalid_price' },
    })
    return jsonError('Price must be greater than 0')
  }
  const normalizedSalePrice = sale_price !== null && sale_price !== undefined && String(sale_price).trim() !== ''
    ? Number(sale_price)
    : null
  if (normalizedSalePrice !== null && (!Number.isFinite(normalizedSalePrice) || normalizedSalePrice <= 0)) {
    trackServerFlowEvent({
      flow: 'coach_product_create',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role: 'coach',
      metadata: { reason: 'invalid_sale_price' },
    })
    return jsonError('Sale price must be greater than 0')
  }
  if (normalizedSalePrice !== null && normalizedPrice === null) {
    trackServerFlowEvent({
      flow: 'coach_product_create',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role: 'coach',
      metadata: { reason: 'sale_price_without_price' },
    })
    return jsonError('Enter a valid main price before adding a sale price')
  }
  if (normalizedSalePrice !== null && normalizedPrice !== null && normalizedSalePrice >= normalizedPrice) {
    trackServerFlowEvent({
      flow: 'coach_product_create',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role: 'coach',
      metadata: { reason: 'sale_price_not_lower' },
    })
    return jsonError('Sale price must be lower than price')
  }

  const normalizedFormat = format ? String(format).trim().toLowerCase() : ''
  const normalizedDescription = description ? String(description).trim() : ''
  const normalizedMediaUrl = mediaUrl ? String(mediaUrl).trim() : ''
  const normalizedRefundPolicy = refund_policy ? String(refund_policy).trim() : ''
  const normalizedProductType = normalizeCoachProductType(format)

  if (normalizedStatus === 'published') {
    if (!normalizedRefundPolicy) {
      return jsonError('Refund policy is required')
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
  }

  if (normalizedStatus === 'published' && !previewMode) {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', session.user.id)
      .maybeSingle()

    if (profileError) {
      return jsonError('Unable to verify Stripe connection', 500)
    }

      if (!profile?.stripe_account_id) {
      trackServerFlowEvent({
        flow: 'coach_product_create',
        step: 'stripe_check',
        status: 'failed',
        userId: session.user.id,
        role: 'coach',
        metadata: { reason: 'missing_stripe_account' },
      })
      return jsonError('Connect Stripe before creating products.', 403)
    }

    const { data: planRow } = await supabaseAdmin
      .from('coach_plans')
      .select('tier')
      .eq('coach_id', session.user.id)
      .maybeSingle()

    const tier = normalizeCoachTier(planRow?.tier)
    if (!COACH_MARKETPLACE_ALLOWED[tier]) {
      trackServerFlowEvent({
        flow: 'coach_product_create',
        step: 'plan_check',
        status: 'failed',
        userId: session.user.id,
        role: 'coach',
        metadata: { reason: 'plan_not_allowed', tier },
      })
      return jsonError(`Marketplace listings are available on Pro or Elite plans. Your current plan is ${formatTierName(tier)}.`, 403)
    }
  }

  const fullInsert = {
    title: normalizedTitle || 'Untitled draft',
    type: normalizedProductType,
    category: normalizedCategory || DEFAULT_DRAFT_PRODUCT_CATEGORY,
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
    refund_policy: normalizedRefundPolicy || null,
    description: normalizedDescription || null,
    coach_id: session.user.id,
    media_url: normalizedMediaUrl || null,
  }

  trackServerFlowEvent({
    flow: 'coach_product_create',
    step: 'write',
    status: 'started',
    userId: session.user.id,
    role: 'coach',
    metadata: { status: normalizedStatus, title: fullInsert.title },
  })

  let { data: insertedProduct, error: insertError } = await supabaseAdmin
    .from('products')
    .insert(fullInsert)
    .select('*')
    .single()

  if (insertError && normalizedStatus === 'draft' && isMissingProductColumnError(insertError)) {
    const minimalDraftInsert = {
      title: normalizedTitle || 'Untitled draft',
      type: normalizedProductType,
      category: normalizedCategory || DEFAULT_DRAFT_PRODUCT_CATEGORY,
      status: normalizedStatus,
      coach_id: session.user.id,
    }
    const retry = await supabaseAdmin
      .from('products')
      .insert(minimalDraftInsert)
      .select('*')
      .single()
    insertError = retry.error
    insertedProduct = retry.data
  }

  if (insertError || !insertedProduct) {
    trackServerFlowFailure(insertError || new Error('Product insert returned no row'), {
      flow: 'coach_product_create',
      step: 'write',
      userId: session.user.id,
      role: 'coach',
      metadata: { status: normalizedStatus, title: fullInsert.title },
    })
    if (isMissingProductColumnError(insertError)) {
      return safeServerError(getProductSchemaErrorMessage(insertError), 500)
    }
    return safeServerError(insertError?.message || 'Unable to create product', 500)
  }

  trackServerFlowEvent({
    flow: 'coach_product_create',
    step: 'write',
    status: 'succeeded',
    userId: session.user.id,
    role: 'coach',
    entityId: insertedProduct.id || null,
    metadata: { status: normalizedStatus, title: insertedProduct.title || fullInsert.title },
  })

  await trackMixpanelServerEvent({
    event: 'Coach Listing Created',
    distinctId: session.user.id,
    properties: {
      coach_id: session.user.id,
      product_id: insertedProduct.id || null,
      title: String(insertedProduct.title || fullInsert.title || '').trim() || null,
      status: String(insertedProduct.status || normalizedStatus).trim() || null,
      category: String(insertedProduct.category || normalizedCategory || '').trim() || null,
      product_type: String(insertedProduct.type || normalizedProductType || '').trim() || null,
      gross_revenue: normalizedPrice,
      marketplace_sales: 0,
      is_published: String(insertedProduct.status || normalizedStatus).toLowerCase() === 'published',
    },
  })

  return NextResponse.json({ ok: true, product: insertedProduct })
}
