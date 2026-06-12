import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = ['org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director', 'team_manager']

async function getOrgId(userId: string): Promise<string | null> {
  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return (membership as { org_id?: string | null } | null)?.org_id ?? null
}

type Registration = {
  id: string
  athlete_name: string
  athlete_email: string | null
  jersey_number: string | null
  payment_status: string
  created_at: string
}

type Criterion = {
  id: string
  label: string
  max_score: number
  weight: number
  sort_order: number
}

type Evaluation = {
  registration_id: string
  criteria_id: string
  evaluator_id: string
  score: number
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error

  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  // Verify ownership
  const { data: tryoutRow } = await supabaseAdmin
    .from('tryout_events')
    .select('id')
    .eq('id', (await params).id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!tryoutRow) return jsonError('Tryout not found', 404)

  // Fetch all needed data in parallel
  const [
    { data: registrationsRaw },
    { data: criteriaRaw },
    { data: evaluationsRaw },
  ] = await Promise.all([
    supabaseAdmin
      .from('tryout_registrations')
      .select('id, athlete_name, athlete_email, jersey_number, payment_status, created_at')
      .eq('tryout_event_id', (await params).id),
    supabaseAdmin
      .from('tryout_criteria')
      .select('id, label, max_score, weight, sort_order')
      .eq('tryout_event_id', (await params).id)
      .order('sort_order', { ascending: true }),
    supabaseAdmin
      .from('tryout_evaluations')
      .select('registration_id, criteria_id, evaluator_id, score')
      .eq('tryout_event_id', (await params).id),
  ])

  const registrations = (registrationsRaw ?? []) as Registration[]
  const criteria = (criteriaRaw ?? []) as Criterion[]
  const evaluations = (evaluationsRaw ?? []) as Evaluation[]

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0)

  // Build a map: registrationId -> criteriaId -> evaluatorId -> score
  const scoreMap = new Map<string, Map<string, number[]>>()
  for (const ev of evaluations) {
    if (!scoreMap.has(ev.registration_id)) {
      scoreMap.set(ev.registration_id, new Map())
    }
    const byRegistration = scoreMap.get(ev.registration_id)!
    if (!byRegistration.has(ev.criteria_id)) {
      byRegistration.set(ev.criteria_id, [])
    }
    byRegistration.get(ev.criteria_id)!.push(ev.score)
  }

  // Compute results per registration
  const results = registrations.map((reg) => {
    const byRegistration = scoreMap.get(reg.id)
    const scores_by_criteria: Record<string, { avg: number; count: number }> = {}

    let weightedSum = 0
    let rawTotal = 0

    for (const criterion of criteria) {
      const scores = byRegistration?.get(criterion.id) ?? []
      const avg = scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0
      scores_by_criteria[criterion.id] = { avg, count: scores.length }
      weightedSum += avg * criterion.weight
      rawTotal += avg
    }

    const composite_score = totalWeight > 0 ? weightedSum / totalWeight : 0

    return {
      registration: reg,
      composite_score: Math.round(composite_score * 100) / 100,
      raw_total: Math.round(rawTotal * 100) / 100,
      scores_by_criteria,
    }
  })

  results.sort((a, b) => b.composite_score - a.composite_score)

  return NextResponse.json({ results, criteria })
}
