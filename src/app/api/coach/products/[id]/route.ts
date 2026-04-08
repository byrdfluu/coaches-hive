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
export const dynamic = 'force-dynamic'

const isMissingProductColumnError = (error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined) => {
  if (!error) return false
  if (error.code === 'PGRST204' || error.code === '42703') return true
  const haystack = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return haystack.includes('column') && haystack.includes('products')
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, role, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)
  const previewMode = process.env.NODE_ENV !== 'production' || process.env.MARKETPLACE_PREVIEW === 'true'

  const { id: productId } = await context.params
  if (!productId) {
    trackServerFlowEvent({
      flow: 'coach_product_update',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role,
      metadata: { reason: 'missing_product_id' },
    })
    return jsonError('Product id is required', 400)
  }

  const { data: existingProduct } = await supabaseAdmin
    .from('products')
    .select('id, coach_id')
    .eq('id', productId)
    .maybeSingle()

  if (!existingProduct) {
    trackServerFlowEvent({
      flow: 'coach_product_update',
      step: 'lookup',
      status: 'failed',
      userId: session.user.id,
      role,
      entityId: productId,
      metadata: { reason: 'product_not_found' },
    })
    return jsonError('Product not found', 404)
  }

  if (role !== 'admin' && existingProduct.coach_id !== session.user.id) {
    trackServerFlowEvent({
      flow: 'coach_product_update',
      step: 'authz',
      status: 'failed',
      userId: session.user.id,
      role,
      entityId: productId,
      metadata: { reason: 'forbidden' },
    })
    return jsonError('Forbidden', 403)
  }

  const ownerCoachId = existingProduct.coach_id

  const body = await request.json().catch(() => null)
  const normalizedStatus = String(body?.status || '').trim().toLowerCase()
  const normalizedTitle = String(body?.title || '').trim()
  const normalizedCategory = normalizeCoachProductCategoryInput(body?.category ?? body?.type)
  const normalizedPrice =
    body?.price !== null && body?.price !== undefined && String(body.price).trim() !== ''
      ? Number(body.price)
      : null
  const normalizedSalePrice =
    body?.sale_price !== null && body?.sale_price !== undefined && String(body.sale_price).trim() !== ''
      ? Number(body.sale_price)
      : null
  const normalizedFormat = body?.format ? String(body.format).trim().toLowerCase() : ''
  const normalizedDescription = body?.description ? String(body.description).trim() : ''
  const normalizedMediaUrl = body?.media_url ? String(body.media_url).trim() : ''
  const normalizedRefundPolicy = body?.refund_policy ? String(body.refund_policy).trim() : ''
  const normalizedProductType = normalizeCoachProductType(body?.format)

  if (!['published', 'draft'].includes(normalizedStatus)) {
    trackServerFlowEvent({
      flow: 'coach_product_update',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role,
      entityId: productId,
      metadata: { reason: 'invalid_status', status: normalizedStatus || null },
    })
    return jsonError('Status must be published or draft')
  }

  if (normalizedStatus === 'published' && !normalizedTitle) {
    return jsonError('Title is required')
  }

  if (normalizedStatus === 'published' && !normalizedCategory) {
    return jsonError('Type is required')
  }

  if (normalizedPrice !== null && (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0)) {
    return jsonError('Price must be greater than 0')
  }

  if (normalizedSalePrice !== null && (!Number.isFinite(normalizedSalePrice) || normalizedSalePrice <= 0)) {
    return jsonError('Sale price must be greater than 0')
  }

  if (normalizedSalePrice !== null && normalizedPrice === null) {
    return jsonError('Enter a valid main price before adding a sale price')
  }

  if (normalizedSalePrice !== null && normalizedPrice !== null && normalizedSalePrice >= normalizedPrice) {
    return jsonError('Sale price must be lower than price')
  }

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

    if (!previewMode) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('stripe_account_id')
        .eq('id', ownerCoachId)
        .maybeSingle()

      if (profileError) {
        return jsonError('Unable to verify Stripe connection', 500)
      }

      if (!profile?.stripe_account_id) {
        return jsonError('Connect Stripe before creating products.', 403)
      }

      const { data: planRow } = await supabaseAdmin
        .from('coach_plans')
        .select('tier')
        .eq('coach_id', ownerCoachId)
        .maybeSingle()

      const tier = normalizeCoachTier(planRow?.tier)
      if (!COACH_MARKETPLACE_ALLOWED[tier]) {
        return jsonError(`Marketplace listings are available on Pro or Elite plans. Your current plan is ${formatTierName(tier)}.`, 403)
      }
    }
  }

  const fullUpdate = {
    title: normalizedTitle || 'Untitled draft',
    type: normalizedProductType || DEFAULT_DRAFT_PRODUCT_TYPE,
    category: normalizedCategory || DEFAULT_DRAFT_PRODUCT_CATEGORY,
    status: normalizedStatus,
    price: normalizedPrice,
    sale_price: normalizedSalePrice,
    discount_label: body?.discount_label ? String(body.discount_label).trim() : null,
    price_label: body?.price_label ? String(body.price_label).trim() : null,
    format: normalizedFormat || null,
    duration: body?.duration ? String(body.duration).trim() : null,
    next_available: body?.next_available ? new Date(String(body.next_available)).toISOString() : null,
    includes: Array.isArray(body?.includes)
      ? body.includes.map((item: unknown) => String(item).trim()).filter(Boolean)
      : null,
    refund_policy: normalizedRefundPolicy || null,
    description: normalizedDescription || null,
    media_url: normalizedMediaUrl || null,
  }

  trackServerFlowEvent({
    flow: 'coach_product_update',
    step: 'write',
    status: 'started',
    userId: session.user.id,
    role,
    entityId: productId,
    metadata: { status: normalizedStatus, title: fullUpdate.title },
  })

  let { data: updatedProduct, error: updateError } = await supabaseAdmin
    .from('products')
    .update(fullUpdate)
    .eq('id', productId)
    .select('*')
    .single()

  if (updateError && normalizedStatus === 'draft' && isMissingProductColumnError(updateError)) {
    const minimalDraftUpdate = {
      title: normalizedTitle || 'Untitled draft',
      type: normalizedProductType || DEFAULT_DRAFT_PRODUCT_TYPE,
      category: normalizedCategory || DEFAULT_DRAFT_PRODUCT_CATEGORY,
      status: normalizedStatus,
    }
    const retry = await supabaseAdmin
      .from('products')
      .update(minimalDraftUpdate)
      .eq('id', productId)
      .select('*')
      .single()
    updateError = retry.error
    updatedProduct = retry.data
  }

  if (updateError || !updatedProduct) {
    trackServerFlowFailure(updateError || new Error('Product update returned no row'), {
      flow: 'coach_product_update',
      step: 'write',
      userId: session.user.id,
      role,
      entityId: productId,
      metadata: { status: normalizedStatus, title: fullUpdate.title },
    })
    return jsonError(updateError?.message || 'Unable to update product', 500)
  }

  trackServerFlowEvent({
    flow: 'coach_product_update',
    step: 'write',
    status: 'succeeded',
    userId: session.user.id,
    role,
    entityId: productId,
    metadata: { status: normalizedStatus, title: updatedProduct.title || fullUpdate.title },
  })

  return NextResponse.json({ ok: true, product: updatedProduct })
}


export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const { session, role, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const { id: productId } = await context.params
  if (!productId) {
    return jsonError('Product id is required', 400)
  }

  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id, coach_id')
    .eq('id', productId)
    .maybeSingle()

  if (!product) {
    return jsonError('Product not found', 404)
  }

  if (role !== 'admin' && product.coach_id !== session.user.id) {
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
