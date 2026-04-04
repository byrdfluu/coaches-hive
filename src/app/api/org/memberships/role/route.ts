import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ORG_FEATURES, isOrgPlanActive, normalizeOrgTier, normalizeOrgStatus } from '@/lib/planRules'
import { sendOrgRoleChangedEmail } from '@/lib/email'
export const dynamic = 'force-dynamic'


export async function POST(request: Request) {
  const { session, error } = await getSessionRole([
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
  ])
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const { membership_id, role } = body || {}

  if (!membership_id || !role) {
    return jsonError('membership_id and role are required')
  }

  const { data: actorMembership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!actorMembership?.org_id) {
    return jsonError('Organization membership not found', 404)
  }

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('plan, plan_status')
    .eq('org_id', actorMembership.org_id)
    .maybeSingle()

  const orgTier = normalizeOrgTier(orgSettings?.plan)
  const planStatus = normalizeOrgStatus(orgSettings?.plan_status)
  if (!isOrgPlanActive(planStatus)) {
    return jsonError('Billing inactive. Activate your subscription to manage roles.', 403)
  }
  if (!ORG_FEATURES[orgTier].roleAssignments) {
    return jsonError('Upgrade to Growth or Enterprise to manage roles.', 403)
  }

  const { data: targetMembership } = await supabaseAdmin
    .from('organization_memberships')
    .select('id, org_id')
    .eq('id', membership_id)
    .maybeSingle()

  if (!targetMembership || targetMembership.org_id !== actorMembership.org_id) {
    return jsonError('Member not found in your org', 404)
  }

  const { data, error: updateError } = await supabaseAdmin
    .from('organization_memberships')
    .update({ role })
    .eq('id', membership_id)
    .select('id, user_id, role')
    .single()

  if (updateError) {
    return jsonError(updateError.message, 500)
  }

  // Notify the member of their role change.
  if (data?.user_id) {
    const [{ data: userProfile }, { data: orgSettings }] = await Promise.all([
      supabaseAdmin.from('profiles').select('full_name, email').eq('id', data.user_id).maybeSingle(),
      supabaseAdmin.from('org_settings').select('name').eq('org_id', actorMembership.org_id).maybeSingle(),
    ])
    if (userProfile?.email) {
      await sendOrgRoleChangedEmail({
        toEmail: userProfile.email,
        toName: userProfile.full_name,
        newRole: data.role,
        orgName: (orgSettings as any)?.name || undefined,
        dashboardUrl: '/org',
      }).catch(() => null)
    }
  }

  return NextResponse.json({ membership: data })
}
