import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : null
  if (!code) return jsonError('code is required', 400)

  const productIds: string[] = Array.isArray(body?.product_ids)
    ? body.product_ids.filter((id: unknown) => typeof id === 'string')
    : []

  const { data: coupon, error: dbError } = await supabaseAdmin
    .from('coupons')
    .select('id, code, discount_type, discount_amount, label, expires_at, max_uses, use_count, product_ids, active')
    .eq('code', code)
    .maybeSingle()

  if (dbError) return jsonError('Unable to validate coupon', 500)

  if (!coupon || !coupon.active) {
    return NextResponse.json({ valid: false, error: 'Invalid or expired promo code.' })
  }

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: 'This promo code has expired.' })
  }

  if (coupon.max_uses !== null && coupon.use_count >= coupon.max_uses) {
    return NextResponse.json({ valid: false, error: 'This promo code has reached its usage limit.' })
  }

  // If coupon is scoped to specific products, check overlap
  if (Array.isArray(coupon.product_ids) && coupon.product_ids.length > 0) {
    const applies = productIds.some((id) => coupon.product_ids.includes(id))
    if (!applies) {
      return NextResponse.json({ valid: false, error: 'This promo code does not apply to items in your cart.' })
    }
  }

  return NextResponse.json({
    valid: true,
    code: coupon.code,
    discount_type: coupon.discount_type,
    discount_amount: coupon.discount_amount,
    label: coupon.label || coupon.code,
  })
}
