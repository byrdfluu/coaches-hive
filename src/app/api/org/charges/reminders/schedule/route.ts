import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ORG_FEATURES, isOrgPlanActive, normalizeOrgTier, normalizeOrgStatus } from '@/lib/planRules'
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

const policyOffsets: Record<string, number> = {
  '3-days-before': 3,
  '7-days-before': 7,
  'due-date': 0,
  '7-days-after': -7,
}

const toUtcDay = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))

export async function POST() {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('plan, plan_status, fee_reminder_policy')
    .eq('org_id', orgId)
    .maybeSingle()

  const orgTier = normalizeOrgTier(orgSettings?.plan)
  const planStatus = normalizeOrgStatus(orgSettings?.plan_status)
  if (!isOrgPlanActive(planStatus)) {
    return jsonError('Billing inactive. Activate your subscription to run reminders.', 403)
  }
  if (!ORG_FEATURES[orgTier].feeReminders) {
    return jsonError('Upgrade to Growth or Enterprise to enable automated reminders.', 403)
  }

  const policy = String(orgSettings?.fee_reminder_policy || 'off')
  if (!policyOffsets.hasOwnProperty(policy)) {
    return NextResponse.json({ created: 0, reminders: [], policy })
  }

  const offset = policyOffsets[policy]
  const todayUtc = toUtcDay(new Date())
  const todayIso = todayUtc.toISOString()

  const { data: feeRows, error: feeError } = await supabaseAdmin
    .from('org_fees')
    .select('id, due_date')
    .eq('org_id', orgId)
    .not('due_date', 'is', null)

  if (feeError) return jsonError('Failed to load fee records.', 500)

  const eligibleFeeIds = (feeRows || [])
    .filter((fee) => {
      if (!fee.due_date) return false
      const dueDate = new Date(fee.due_date)
      const dueUtc = toUtcDay(dueDate)
      const diffDays = Math.round((dueUtc.getTime() - todayUtc.getTime()) / (24 * 60 * 60 * 1000))
      return diffDays === offset
    })
    .map((fee) => fee.id)

  if (eligibleFeeIds.length === 0) {
    return NextResponse.json({ created: 0, reminders: [], policy })
  }

  const { data: assignments, error: assignError } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('id, fee_id, athlete_id, status')
    .in('fee_id', eligibleFeeIds)
    .eq('status', 'unpaid')

  if (assignError) return jsonError('Failed to load fee assignments.', 500)

  if (!assignments || assignments.length === 0) {
    return NextResponse.json({ created: 0, reminders: [], policy })
  }

  const assignmentIds = assignments.map((row) => row.id)
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('org_fee_reminders')
    .select('assignment_id, created_at, reminder_type')
    .in('assignment_id', assignmentIds)
    .eq('reminder_type', 'scheduled')
    .gte('created_at', todayIso)

  if (existingError) return jsonError('Failed to check existing reminders.', 500)

  const existingSet = new Set((existing || []).map((row) => row.assignment_id))
  const reminders = assignments
    .filter((assignment) => !existingSet.has(assignment.id))
    .map((assignment) => ({
      fee_id: assignment.fee_id,
      assignment_id: assignment.id,
      created_by: session.user.id,
      reminder_type: 'scheduled',
      message: `Scheduled reminder (${policy})`,
    }))

  if (reminders.length === 0) {
    return NextResponse.json({ created: 0, reminders: [], policy })
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('org_fee_reminders')
    .insert(reminders)
    .select('id, fee_id, assignment_id, reminder_type, created_at')

  if (insertError) {
    return jsonError(insertError.message, 500)
  }

  return NextResponse.json({ created: reminders.length, reminders: inserted || [], policy })
}
