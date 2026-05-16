import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, title, name, type, category, price, price_cents, sale_price, description, media_url, format, duration, includes, status')
    .eq('coach_id', params.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ products: [] })
  return NextResponse.json({ products: data || [] })
}
