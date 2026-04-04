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

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const { fee_id, message, reminder_type = 'manual' } = body || {}

  if (!fee_id) {
    return jsonError('fee_id is required')
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
    return jsonError('Billing inactive. Activate your subscription to send reminders.', 403)
  }
  const isManual = String(reminder_type || '').toLowerCase() === 'manual'
  if (isManual && !ORG_FEATURES[orgTier].manualReminders) {
    return jsonError('Upgrade to Growth or Enterprise to send reminders.', 403)
  }
  if (!isManual && !ORG_FEATURES[orgTier].feeReminders) {
    return jsonError('Upgrade to Growth or Enterprise to send fee reminders.', 403)
  }

  const { data: fee } = await supabaseAdmin
    .from('org_fees')
    .select('id, org_id')
    .eq('id', fee_id)
    .maybeSingle()

  if (!fee || fee.org_id !== orgId) {
    return jsonError('Fee not found for this organization', 404)
  }

  const { data: assignments } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('id, fee_id, athlete_id, status')
    .eq('fee_id', fee_id)
    .eq('status', 'unpaid')

  if (!assignments || assignments.length === 0) {
    return NextResponse.json({ sent: 0, reminders: [] })
  }

  const reminders = assignments.map((assignment) => ({
    fee_id: assignment.fee_id,
    assignment_id: assignment.id,
    created_by: session.user.id,
    reminder_type,
    message: message || null,
  }))

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('org_fee_reminders')
    .insert(reminders)
    .select('id, fee_id, assignment_id, reminder_type, created_at')

  if (insertError) {
    return jsonError(insertError.message, 500)
  }

  return NextResponse.json({ sent: reminders.length, reminders: inserted || [] })
}
