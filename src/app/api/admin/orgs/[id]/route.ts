import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { logAdminAction } from '@/lib/auditLog'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const ADMIN_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
])
const COACH_ROLES = new Set(['coach', 'assistant_coach'])

const buildOnboardingStatus = (settings?: Record<string, any> | null) => {
  if (!settings) return 'Not started'
  const requiredFields = ['org_name', 'primary_contact_email', 'billing_contact', 'billing_address']
  const missing = requiredFields.filter((field) => !settings[field])
  if (missing.length === 0) return 'Complete'
  if (missing.length === requiredFields.length) return 'Not started'
  return 'Needs info'
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) {
    return jsonError('Forbidden', 403)
  }

  const { id: orgId } = await context.params

  const { data: orgRow, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .maybeSingle()

  if (orgError) {
    return jsonError(orgError.message)
  }
  if (!orgRow) {
    return jsonError('Organization not found', 404)
  }

  const { data: settingsRow, error: settingsError } = await supabaseAdmin
    .from('org_settings')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()

  if (settingsError) {
    return jsonError(settingsError.message)
  }

  const { data: membershipRows, error: membershipError } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id, user_id, role, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (membershipError) {
    return jsonError(membershipError.message)
  }

  const { data: teamRows, error: teamError } = await supabaseAdmin
    .from('org_teams')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (teamError) {
    return jsonError(teamError.message)
  }

  const { data: feeRows } = await supabaseAdmin
    .from('org_fees')
    .select('id')
    .eq('org_id', orgId)

  const feeIds = (feeRows || []).map((row) => row.id)
  const { data: feeAssignments } = feeIds.length
    ? await supabaseAdmin
        .from('org_fee_assignments')
        .select('status, fee_id')
        .in('fee_id', feeIds)
    : { data: [] }

  const feePaid = (feeAssignments || []).filter((row) => row.status === 'paid').length
  const feeUnpaid = (feeAssignments || []).filter((row) => row.status === 'unpaid').length

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers()
  if (userError) {
    return jsonError(userError.message)
  }

  const userMap = new Map<string, { name: string; email: string; role: string }>()
  ;(userData.users || []).forEach((user) => {
    userMap.set(user.id, {
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Member',
      email: user.email || '',
      role: user.user_metadata?.role || 'unknown',
    })
  })

  const members = (membershipRows || []).map((row) => {
    const meta = userMap.get(row.user_id)
    return {
      user_id: row.user_id,
      role: row.role || 'member',
      name: meta?.name || 'Member',
      email: meta?.email || '',
      created_at: row.created_at || null,
    }
  })

  const adminMembers = members.filter((member) => ADMIN_ROLES.has(member.role))
  const coachMembers = members.filter((member) => COACH_ROLES.has(member.role))

  const memberCount = members.length
  const status = (orgRow as Record<string, any>).status || (memberCount > 0 ? 'Active' : 'Pending')
  const plan = (orgRow as Record<string, any>).plan || (settingsRow as Record<string, any> | null)?.plan || (settingsRow as Record<string, any> | null)?.invoice_frequency || 'Not set'
  const onboardingStatus = buildOnboardingStatus(settingsRow as Record<string, any> | null)
  const verificationStatus =
    (orgRow as Record<string, any>).verification_status ||
    (orgRow as Record<string, any>).status ||
    'Not set'

  return NextResponse.json({
    org: {
      id: orgRow.id,
      name: orgRow.name || (settingsRow as Record<string, any> | null)?.org_name || 'Organization',
      created_at: orgRow.created_at || null,
      status,
      plan,
      org_type: (orgRow as Record<string, any>).org_type || null,
    },
    settings: settingsRow || null,
    members,
    teams: teamRows || [],
    admin_members: adminMembers,
    coach_members: coachMembers,
    member_count: memberCount,
    onboarding_status: onboardingStatus,
    verification_status: verificationStatus,
    fee_paid: feePaid,
    fee_unpaid: feeUnpaid,
  })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) {
    return jsonError('Forbidden', 403)
  }

  const { id: orgId } = await context.params
  const payload = await request.json().catch(() => ({}))

  const orgUpdates: Record<string, any> = {}
  if (payload.status) orgUpdates.status = payload.status
  if (payload.org_type) orgUpdates.org_type = payload.org_type
  if (payload.verification_status) orgUpdates.verification_status = payload.verification_status

  if (Object.keys(orgUpdates).length > 0) {
    const { error: orgError } = await supabaseAdmin
      .from('organizations')
      .update(orgUpdates)
      .eq('id', orgId)
    if (orgError) {
      return jsonError(orgError.message)
    }
  }

  if (payload.plan) {
    const { error: settingsError } = await supabaseAdmin
      .from('org_settings')
      .upsert({
        org_id: orgId,
        plan: payload.plan,
      }, { onConflict: 'org_id' })
    if (settingsError) {
      return jsonError(settingsError.message)
    }
  }

  await logAdminAction({
    action: 'admin.orgs.update',
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'organization',
    targetId: orgId,
    metadata: {
      status: payload.status,
      plan: payload.plan,
      org_type: payload.org_type,
      verification_status: payload.verification_status,
    },
  })

  return NextResponse.json({ ok: true })
}
