import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return jsonError('Missing id', 400)

  const { data: product, error } = await supabaseAdmin
    .from('products')
    .select('id, title, name, description, price, price_cents, category, sport, coach_id, org_id, active, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error || !product) return jsonError('Program not found', 404)

  const row = product as {
    id: string
    title?: string | null
    name?: string | null
    description?: string | null
    price?: number | string | null
    price_cents?: number | null
    category?: string | null
    sport?: string | null
    coach_id?: string | null
    org_id?: string | null
    active?: boolean | null
    created_at?: string | null
  }

  let seller = 'Coaches Hive'
  if (row.coach_id) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', row.coach_id)
      .maybeSingle()
    seller = (profile as { full_name?: string | null } | null)?.full_name || 'Coach'
  } else if (row.org_id) {
    const { data: orgSettings } = await supabaseAdmin
      .from('org_settings')
      .select('org_name')
      .eq('org_id', row.org_id)
      .maybeSingle()
    seller = (orgSettings as { org_name?: string | null } | null)?.org_name || 'Organization'
  }

  return NextResponse.json({
    program: {
      id: row.id,
      title: row.title || row.name || 'Program',
      description: row.description || null,
      price_cents: row.price_cents ?? Math.round(Number(row.price || 0) * 100),
      category: row.category || 'program',
      sport: row.sport || null,
      seller,
      coach_id: row.coach_id || null,
      org_id: row.org_id || null,
      created_at: row.created_at || null,
    },
  })
}
