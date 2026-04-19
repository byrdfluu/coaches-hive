import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, role, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const { id } = await context.params
  if (!id) return jsonError('Order id is required', 400)

  const url = new URL(request.url)
  const kind = url.searchParams.get('kind') === 'external' ? 'external' : 'file'

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, athlete_id, product_id, status, fulfillment_status')
    .eq('id', id)
    .maybeSingle()

  if (orderError) return jsonError(orderError.message, 500)
  if (!order) return jsonError('Order not found', 404)
  if (role !== 'admin' && session.user.id !== order.athlete_id) return jsonError('Forbidden', 403)

  const paidStatus = String(order.status || '').toLowerCase()
  if (!(paidStatus.includes('paid') || paidStatus.includes('active') || paidStatus.includes('approved'))) {
    return jsonError('Order is not ready for delivery access', 400)
  }

  if (!order.product_id) return jsonError('No product attached to this order', 400)

  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, delivery_asset_path, delivery_external_url')
    .eq('id', order.product_id)
    .maybeSingle()

  if (productError) return jsonError(productError.message, 500)
  if (!product) return jsonError('Product not found', 404)

  if (kind === 'external') {
    const externalUrl = String(product.delivery_external_url || '').trim()
    if (!externalUrl) return jsonError('No hosted video or link is attached to this product', 404)
    return NextResponse.json({ ok: true, kind: 'external', url: externalUrl })
  }

  const assetPath = String(product.delivery_asset_path || '').trim()
  if (!assetPath) return jsonError('No downloadable file is attached to this product', 404)

  const { data: signedData, error: signedError } = await supabaseAdmin.storage
    .from('attachments')
    .createSignedUrl(assetPath, 60 * 60)

  if (signedError || !signedData?.signedUrl) {
    return jsonError(signedError?.message || 'Unable to create access link', 500)
  }

  return NextResponse.json({ ok: true, kind: 'file', url: signedData.signedUrl })
}
