import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const EVENT_CATEGORIES = ['program', 'camp', 'clinic', 'league', 'tournament', 'event']

export async function GET() {
  const { data: products, error } = await supabaseAdmin
    .from('products')
    .select('id, title, name, description, price, price_cents, category, sport, coach_id, org_id, created_at')
    .in('category', EVENT_CATEGORIES)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return jsonError('Failed to load programs', 500)

  const rows = (products || []) as Array<{
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
    created_at?: string | null
  }>

  const coachIds = Array.from(new Set(rows.filter((r) => r.coach_id).map((r) => r.coach_id as string)))
  const orgIds = Array.from(new Set(rows.filter((r) => r.org_id).map((r) => r.org_id as string)))

  const [profilesRes, orgsRes] = await Promise.all([
    coachIds.length > 0
      ? supabaseAdmin.from('profiles').select('id, full_name').in('id', coachIds)
      : Promise.resolve({ data: [] }),
    orgIds.length > 0
      ? supabaseAdmin.from('org_settings').select('org_id, org_name').in('org_id', orgIds)
      : Promise.resolve({ data: [] }),
  ])

  const profileMap = new Map<string, string>()
  for (const p of (profilesRes.data || []) as Array<{ id: string; full_name?: string | null }>) {
    profileMap.set(p.id, p.full_name || '')
  }
  const orgMap = new Map<string, string>()
  for (const o of (orgsRes.data || []) as Array<{ org_id: string; org_name?: string | null }>) {
    orgMap.set(o.org_id, o.org_name || '')
  }

  const programs = rows.map((row) => ({
    id: row.id,
    title: row.title || row.name || 'Program',
    description: row.description || null,
    price_cents: row.price_cents ?? Math.round(Number(row.price || 0) * 100),
    category: row.category || 'program',
    sport: row.sport || null,
    seller: row.coach_id
      ? profileMap.get(row.coach_id) || 'Coach'
      : row.org_id
        ? orgMap.get(row.org_id) || 'Organization'
        : 'Coaches Hive',
    coach_id: row.coach_id || null,
    org_id: row.org_id || null,
    created_at: row.created_at || null,
  }))

  return NextResponse.json({ programs })
}
