import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const athleteId = session.user.id

  const { data, error: fetchError } = await supabaseAdmin
    .from('coach_programs')
    .select('id, title, description, status, duration_label, thumbnail_path, coach_id, product_id, created_at')
    .eq('status', 'active')
    .not('product_id', 'is', null)

  if (fetchError) return jsonError(fetchError.message, 500)

  if (!data || data.length === 0) return NextResponse.json({ programs: [] })

  // Filter to only programs the athlete has a paid order for
  const productIds = data.map((p: any) => p.product_id).filter(Boolean)
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('product_id')
    .eq('athlete_id', athleteId)
    .in('product_id', productIds)
    .in('status', ['paid', 'active', 'approved'])

  const purchasedProductIds = new Set((orders ?? []).map((o: any) => o.product_id))
  const accessible = data.filter((p: any) => purchasedProductIds.has(p.product_id))

  if (accessible.length === 0) return NextResponse.json({ programs: [] })

  // Fetch coach names
  const coachIds = [...new Set(accessible.map((p: any) => p.coach_id))]
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .in('id', coachIds)

  const coachNameMap = Object.fromEntries(
    (profiles ?? []).map((p: any) => [p.id, p.full_name ?? ''])
  )

  // Fetch exercise counts
  const programIds = accessible.map((p: any) => p.id)
  const { data: cpeRows } = await supabaseAdmin
    .from('coach_program_exercises')
    .select('program_id')
    .in('program_id', programIds)

  const exerciseCounts: Record<string, number> = {}
  for (const row of (cpeRows ?? []) as Array<{ program_id: string }>) {
    exerciseCounts[row.program_id] = (exerciseCounts[row.program_id] ?? 0) + 1
  }

  const result = accessible.map((p: any) => ({
    ...p,
    coach_name: coachNameMap[p.coach_id] ?? '',
    exercise_count: exerciseCounts[p.id] ?? 0,
  }))

  return NextResponse.json({ programs: result })
}
