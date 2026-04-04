import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('cart')
    .eq('id', session.user.id)
    .maybeSingle()

  return NextResponse.json({ cart: profile?.cart || [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.cart)) {
    return jsonError('cart must be an array', 400)
  }

  if (body.cart.length > 50) {
    return jsonError('Cart exceeds maximum of 50 items', 400)
  }

  const sanitizedCart = []
  for (const item of body.cart) {
    if (!item || typeof item !== 'object') continue
    const id = typeof item.id === 'string' ? item.id.trim() : null
    const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? Math.min(item.quantity, 99) : null
    const price = typeof item.price === 'number' && item.price >= 0 ? item.price : null
    if (!id || quantity === null || price === null) {
      return jsonError('Each cart item must have a valid id, quantity (1–99), and price', 400)
    }
    // Only persist known safe fields
    sanitizedCart.push({ id, quantity, price, title: item.title ? String(item.title).slice(0, 200) : undefined, creator: item.creator ? String(item.creator).slice(0, 100) : undefined })
  }

  await supabaseAdmin
    .from('profiles')
    .update({ cart: sanitizedCart })
    .eq('id', session.user.id)

  return NextResponse.json({ ok: true })
}
