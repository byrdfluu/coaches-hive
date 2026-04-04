import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  ORG_FEATURES,
  formatTierName,
  isOrgPlanActive,
  normalizeOrgStatus,
  normalizeOrgTier,
} from '@/lib/planRules'
export const dynamic = 'force-dynamic'


const adminRoles = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'admin',
]

const resolveOrgId = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.org_id || null
}

export async function GET() {
  const { session, role, error } = await getSessionRole(['athlete', ...adminRoles])
  if (error || !session) return error

  if (role === 'athlete') {
    const { data: assignments } = await supabaseAdmin
      .from('org_fee_assignments')
      .select('id, fee_id, status, paid_at, created_at')
      .eq('athlete_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    const feeIds = (assignments || []).map((row) => row.fee_id)
    const { data: fees } = feeIds.length
      ? await supabaseAdmin
          .from('org_fees')
          .select('id, org_id, title, amount_cents, due_date, audience_type, team_id, created_by, created_at')
          .in('id', feeIds)
      : { data: [] }

    return NextResponse.json({ assignments: assignments || [], fees: fees || [] })
  }

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { data: fees } = await supabaseAdmin
    .from('org_fees')
    .select('id, org_id, title, amount_cents, due_date, audience_type, team_id, created_by, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  const feeIds = (fees || []).map((fee) => fee.id)
  const { data: assignments } = feeIds.length
    ? await supabaseAdmin
        .from('org_fee_assignments')
        .select('id, fee_id, athlete_id, status, paid_at, created_at')
        .in('fee_id', feeIds)
    : { data: [] }

  const { data: reminders } = feeIds.length
    ? await supabaseAdmin
        .from('org_fee_reminders')
        .select('id, fee_id, assignment_id, reminder_type, created_at')
        .in('fee_id', feeIds)
    : { data: [] }

  return NextResponse.json({ fees: fees || [], assignments: assignments || [], reminders: reminders || [] })
}

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const {
    title,
    amount_cents,
    due_date,
    audience_type = 'all',
    team_id,
    team_ids,
    athlete_id,
    athlete_ids,
    coach_id,
    coach_ids,
  } = body || {}

  if (!title || !amount_cents) {
    return jsonError('title and amount_cents are required')
  }

  if (amount_cents > 5_000_000) {
    return jsonError('Fee amount exceeds the maximum allowed ($50,000).', 400)
  }

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('plan, plan_status')
    .eq('org_id', orgId)
    .maybeSingle()

  const orgTier = normalizeOrgTier(orgSettings?.plan)
  const planStatus = normalizeOrgStatus(orgSettings?.plan_status)

  if (!isOrgPlanActive(planStatus)) {
    return jsonError('Billing inactive. Activate your subscription to create fees.', 403)
  }
  if (!ORG_FEATURES[orgTier].feeCreation) {
    return jsonError(`Upgrade to Growth or Enterprise to create fees. Current plan: ${formatTierName(orgTier)}.`, 403)
  }

  const normalizedTeamIds = Array.from(
    new Set([...(Array.isArray(team_ids) ? team_ids : []), ...(team_id ? [team_id] : [])].filter(Boolean)),
  )
  const normalizedAthleteIds = Array.from(
    new Set([...(Array.isArray(athlete_ids) ? athlete_ids : []), ...(athlete_id ? [athlete_id] : [])].filter(Boolean)),
  )
  const normalizedCoachIds = Array.from(
    new Set([...(Array.isArray(coach_ids) ? coach_ids : []), ...(coach_id ? [coach_id] : [])].filter(Boolean)),
  )

  if (audience_type === 'team' && normalizedTeamIds.length === 0) {
    return jsonError('Select at least one team.')
  }
  if (audience_type === 'athlete' && normalizedAthleteIds.length === 0) {
    return jsonError('Select at least one athlete.')
  }
  if (audience_type === 'coach' && normalizedCoachIds.length === 0) {
    return jsonError('Select at least one coach.')
  }

  const { data: feeRow, error: feeError } = await supabaseAdmin
    .from('org_fees')
    .insert({
      org_id: orgId,
      title,
      amount_cents,
      due_date,
      audience_type,
      team_id: normalizedTeamIds.length === 1 ? normalizedTeamIds[0] : null,
      created_by: session.user.id,
    })
    .select('*')
    .single()

  if (feeError) {
    console.error('[org/charges] fee insert error:', feeError.message)
    return jsonError('Unable to create fee. Please try again.', 500)
  }

  let assigneeIds: string[] = []
  if (audience_type === 'athlete') {
    assigneeIds = normalizedAthleteIds
  } else if (audience_type === 'coach') {
    assigneeIds = normalizedCoachIds
  } else if (audience_type === 'team') {
    const { data: members } = await supabaseAdmin
      .from('org_team_members')
      .select('athlete_id')
      .in('team_id', normalizedTeamIds)
    assigneeIds = (members || []).map((row) => row.athlete_id).filter(Boolean)
  } else {
    const { data: members } = await supabaseAdmin
      .from('organization_memberships')
      .select('user_id, role')
      .eq('org_id', orgId)
    assigneeIds = (members || [])
      .filter((row) => row.role === 'athlete')
      .map((row) => row.user_id)
  }

  const uniqueAssignees = Array.from(new Set(assigneeIds))
  if (uniqueAssignees.length > 0) {
    const assignments = uniqueAssignees.map((assigneeId) => ({
      fee_id: feeRow.id,
      athlete_id: assigneeId,
      status: 'unpaid',
    }))
    const { error: assignmentError } = await supabaseAdmin
      .from('org_fee_assignments')
      .insert(assignments)
    if (assignmentError) {
      console.error('[org/charges] assignment insert error:', assignmentError.message)
      return jsonError('Fee created but assignments could not be sent. Please try again.', 500)
    }
  }

  return NextResponse.json({ fee: feeRow })
}
