import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { COACH_PROGRAMS_ALLOWED, normalizeCoachTier } from '@/lib/planRules'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const coachId = session.user.id

  const { data: programs, error: fetchError } = await supabaseAdmin
    .from('coach_programs')
    .select('id, coach_id, product_id, title, description, status, duration_label, thumbnail_path, created_at, updated_at')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })

  if (fetchError) return jsonError(fetchError.message, 500)

  const programIds = (programs ?? []).map((p: any) => p.id)

  let exerciseCounts: Record<string, number> = {}
  if (programIds.length > 0) {
    const { data: cpeRows } = await supabaseAdmin
      .from('coach_program_exercises')
      .select('program_id')
      .in('program_id', programIds)
      .eq('coach_id', coachId)

    for (const row of (cpeRows || []) as Array<{ program_id: string }>) {
      exerciseCounts[row.program_id] = (exerciseCounts[row.program_id] ?? 0) + 1
    }
  }

  const result = (programs ?? []).map((p: any) => ({
    ...p,
    exercise_count: exerciseCounts[p.id] ?? 0,
  }))

  return NextResponse.json({ programs: result })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach'])
  if (error || !session) return error

  const { data: planRow } = await supabaseAdmin
    .from('coach_plans')
    .select('tier')
    .eq('coach_id', session.user.id)
    .maybeSingle()

  const tier = normalizeCoachTier(planRow?.tier)
  if (!COACH_PROGRAMS_ALLOWED[tier]) {
    return jsonError('Programs require a Pro or Elite plan.', 403)
  }

  const body = await request.json().catch(() => null)
  if (!body) return jsonError('Invalid request body.', 400)

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return jsonError('Program title is required.', 400)

  const { data, error: insertError } = await supabaseAdmin
    .from('coach_programs')
    .insert({
      coach_id: session.user.id,
      title,
      description: body.description || null,
      duration_label: body.duration_label || null,
      status: body.status === 'active' || body.status === 'inactive' ? body.status : 'draft',
    })
    .select()
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  return NextResponse.json({ program: data }, { status: 201 })
}
