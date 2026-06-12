import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ORG_ADMIN_OR_COACH_ROLES = [
  'org_admin', 'club_admin', 'travel_admin', 'school_admin',
  'athletic_director', 'program_director', 'team_manager',
  'coach', 'assistant_coach',
]

async function getOrgId(userId: string): Promise<string | null> {
  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return (membership as { org_id?: string | null } | null)?.org_id ?? null
}

async function verifyTryoutOwnership(tryoutId: string, orgId: string) {
  const { data } = await supabaseAdmin
    .from('tryout_events')
    .select('id')
    .eq('id', tryoutId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_OR_COACH_ROLES)
  if (error) return error

  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const tryout = await verifyTryoutOwnership((await params).id, orgId)
  if (!tryout) return jsonError('Tryout not found', 404)

  const { data: evaluations, error: dbError } = await supabaseAdmin
    .from('tryout_evaluations')
    .select(`
      *,
      tryout_criteria (
        label,
        max_score,
        weight
      )
    `)
    .eq('tryout_event_id', (await params).id)

  if (dbError) return jsonError('Failed to fetch evaluations', 500)

  return NextResponse.json({ evaluations: evaluations ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_OR_COACH_ROLES)
  if (error) return error

  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const { id: tryoutId } = await params
  const tryout = await verifyTryoutOwnership(tryoutId, orgId)
  if (!tryout) return jsonError('Tryout not found', 404)

  const body = await request.json().catch(() => ({}))
  const { scores } = body as {
    scores?: Array<{
      registration_id: string
      criteria_id: string
      score: number
      notes?: string
    }>
  }

  if (!Array.isArray(scores) || scores.length === 0) {
    return jsonError('scores array is required', 400)
  }

  for (const s of scores) {
    if (!s.registration_id || !s.criteria_id || typeof s.score !== 'number') {
      return jsonError('Each score must have registration_id, criteria_id, and score', 400)
    }
  }

  const rows = scores.map((s) => ({
    tryout_event_id: tryoutId,
    registration_id: s.registration_id,
    criteria_id: s.criteria_id,
    evaluator_id: session.user.id,
    score: s.score,
    notes: s.notes?.trim() || null,
  }))

  const { error: upsertError } = await supabaseAdmin
    .from('tryout_evaluations')
    .upsert(rows, { onConflict: 'registration_id,evaluator_id,criteria_id' })

  if (upsertError) return jsonError('Failed to save evaluations', 500)

  return NextResponse.json({ ok: true })
}
