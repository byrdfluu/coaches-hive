import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isActiveCoachProductStatus } from '@/lib/coachMarketplaceStatus'
import { loadCoachOperatingMode, privateTrainingEnabled } from '@/lib/coachOperatingMode'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile } = await loadCoachOperatingMode(id)
  if (!profile?.isActive || !privateTrainingEnabled(profile.mode)) return NextResponse.json({ products: [] })
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, title, name, type, category, price, price_cents, sale_price, description, media_url, format, duration, includes, status')
    .eq('coach_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ products: [] })
  return NextResponse.json({ products: (data || []).filter((product) => isActiveCoachProductStatus(product.status)) })
}
