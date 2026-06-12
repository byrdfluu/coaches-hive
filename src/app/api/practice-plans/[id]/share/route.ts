import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
]

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, role, error } = await getSessionRole([
    'coach',
    'admin',
    ...ORG_ADMIN_ROLES,
  ])
  if (error || !session) return error

  const { id: planId } = await params
  if (!planId) return jsonError('Plan id is required', 400)

  const body = await request.json().catch(() => null)
  const { share_with_team, coach_ids } = body || {}

  // Fetch the plan and verify ownership / org access
  const { data: plan, error: planError } = await supabaseAdmin
    .from('practice_plans')
    .select('id, coach_id, org_id')
    .eq('id', planId)
    .maybeSingle()

  if (planError || !plan) {
    return jsonError('Practice plan not found', 404)
  }

  if (role === 'coach') {
    if (plan.coach_id !== session.user.id) {
      return jsonError('You do not have permission to share this plan', 403)
    }
  } else if (ORG_ADMIN_ROLES.includes(role || '') || role === 'admin') {
    const { data: membership } = await supabaseAdmin
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
    if (!membership?.org_id || membership.org_id !== plan.org_id) {
      return jsonError('You do not have permission to share this plan', 403)
    }
  } else {
    return jsonError('Forbidden', 403)
  }

  // Update shared_with_team flag
  if (typeof share_with_team === 'boolean') {
    const { error: updateError } = await supabaseAdmin
      .from('practice_plans')
      .update({ shared_with_team: share_with_team })
      .eq('id', planId)
    if (updateError) {
      return jsonError(updateError.message, 500)
    }
  }

  // Upsert direct coach shares
  if (Array.isArray(coach_ids) && coach_ids.length > 0) {
    const rows = coach_ids.map((coachId: string) => ({
      plan_id: planId,
      coach_id: coachId,
      can_edit: false,
    }))
    const { error: upsertError } = await supabaseAdmin
      .from('practice_plan_shares')
      .upsert(rows, { onConflict: 'plan_id,coach_id' })
    if (upsertError) {
      return jsonError(upsertError.message, 500)
    }
  }

  return NextResponse.json({ ok: true })
}
