import { NextResponse } from 'next/server'
import { hasSupabaseAdminConfig, supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendEmailVerificationCode } from '@/lib/authVerification'
import { recordReferralSignup } from '@/lib/referrals'
import { getPostHogClient } from '@/lib/posthog-server'
import { normalizePlanKey } from '@/lib/allAccessPricing'
import { correlatedError, requestIdFor } from '@/lib/requestSecurity'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set(['coach', 'athlete', 'org_admin', 'league_admin'])

type SupabaseSetupError = {
  message?: string
  code?: string
  details?: string
  hint?: string
}

const formatSetupError = (step: string, error: SupabaseSetupError | Error | null | undefined) => {
  const value = error as SupabaseSetupError | undefined
  return [step, value?.code, value?.message, value?.details, value?.hint].filter(Boolean).join(': ')
}

const setupFailureResponse = (requestId: string, step: string, error: SupabaseSetupError | Error) => {
  const actualError = formatSetupError(step, error)
  console.error('[api/auth/signup] account setup failed', { step, error })
  return correlatedError(requestId, 'account_setup_failed', process.env.NODE_ENV === 'development'
    ? `Account setup failed: ${actualError}`
    : 'Account setup failed. Please try again.', 503, true)
}

const rollbackCreatedAccount = async ({ userId, organizationId, leagueId }: { userId: string; organizationId?: string | null; leagueId?: string | null }) => {
  const cleanupErrors: Array<{ step: string; error: unknown }> = []
  if (organizationId) {
    const settingsResult = await supabaseAdmin.from('org_settings').delete().eq('org_id', organizationId)
    if (settingsResult.error) cleanupErrors.push({ step: 'delete_org_settings', error: settingsResult.error })
    const membershipResult = await supabaseAdmin.from('organization_memberships').delete().eq('org_id', organizationId)
    if (membershipResult.error) cleanupErrors.push({ step: 'delete_organization_memberships', error: membershipResult.error })
    const organizationResult = await supabaseAdmin.from('organizations').delete().eq('id', organizationId)
    if (organizationResult.error) cleanupErrors.push({ step: 'delete_organization', error: organizationResult.error })
  }
  if (leagueId) {
    const membershipResult = await supabaseAdmin.from('league_memberships').delete().eq('league_id', leagueId)
    if (membershipResult.error) cleanupErrors.push({ step: 'delete_league_memberships', error: membershipResult.error })
    const leagueResult = await supabaseAdmin.from('leagues').delete().eq('id', leagueId)
    if (leagueResult.error) cleanupErrors.push({ step: 'delete_league', error: leagueResult.error })
  }
  const authResult = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (authResult.error) cleanupErrors.push({ step: 'delete_auth_user', error: authResult.error })
  if (cleanupErrors.length) console.error('[api/auth/signup] rollback encountered errors', { userId, organizationId, cleanupErrors })
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  const fail = (code: string, message: string, status = 400, retryable = status === 429 || status >= 500) =>
    correlatedError(requestId, code, message, status, retryable)
  try {
    if (!hasSupabaseAdminConfig) {
      return fail('signup_unavailable', 'Signup is temporarily unavailable. Please try again shortly.', 503, true)
    }

    const payload = await request.json().catch(() => ({}))
    const email = String(payload?.email || '').trim().toLowerCase()
    const password = String(payload?.password || '')
    const role = String(payload?.role || '').trim()
    const fullName = String(payload?.full_name || '').trim()
    const requestedTier = String(payload?.plan_key || payload?.selected_tier || '').trim() || null
    const selectedTier = role === 'coach'
      ? normalizePlanKey(requestedTier || 'team_starter', 'coach')
      : role === 'org_admin' && requestedTier
        ? normalizePlanKey(requestedTier, 'org')
        : role === 'league_admin'
          ? normalizePlanKey(requestedTier || 'league_enterprise', 'org')
        : null
    const billingInterval = payload?.billing_interval === 'year' ? 'year' : 'month'

    if (!email) return fail('email_required', 'Email is required.')
    if (!password) return fail('password_required', 'Password is required.')
    if (password.length < 8) return fail('password_too_short', 'Password must be at least 8 characters.')
    if (!ALLOWED_ROLES.has(role)) return fail('invalid_role', 'Invalid role.')
    if (!fullName) return fail('full_name_required', 'Full name is required.')
    if (role === 'coach' && selectedTier !== 'team_starter') return fail('invalid_plan', 'Invalid team plan.')
    if (role === 'org_admin' && selectedTier && !['growing_organization', 'established_organization'].includes(selectedTier)) return fail('invalid_plan', 'Invalid organization plan.')
    if (role === 'league_admin' && selectedTier !== 'league_enterprise') return fail('invalid_plan', 'Invalid league plan.')

    const userMetadata = {
      role,
      full_name: fullName,
      ref_code: payload?.ref_code || undefined,
      from_slug: payload?.from_slug ? String(payload.from_slug).trim() || undefined : undefined,
      from_type: payload?.from_type ? String(payload.from_type).trim() || undefined : undefined,
      intended_action: payload?.intended_action ? String(payload.intended_action).trim() || undefined : undefined,
      selected_tier: selectedTier || undefined,
      billing_interval: billingInterval,
      lifecycle_state: 'awaiting_verification',
      lifecycle_updated_at: new Date().toISOString(),
      org_name: role === 'org_admin' ? String(payload?.org_name || '').trim() || undefined : undefined,
      org_type: role === 'org_admin' ? String(payload?.org_type || '').trim() || undefined : undefined,
      league_name: role === 'league_admin' ? String(payload?.league_name || '').trim() || undefined : undefined,
      birthdate: role === 'athlete' ? String(payload?.birthdate || '').trim() || undefined : undefined,
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: userMetadata,
    })

    if (createError) {
      const message = createError.message || 'Unable to create account.'
      const lowerMessage = message.toLowerCase()
      if (message.toLowerCase().includes('already registered')) {
        return fail('account_exists', 'An account with this email already exists.', 409, false)
      }
      if (
        lowerMessage.includes('password')
        || lowerMessage.includes('email')
        || lowerMessage.includes('invalid')
      ) {
        return fail('invalid_signup', message, 400, false)
      }
      if (lowerMessage.includes('rate limit')) {
        return fail('rate_limited', 'Too many attempts. Please wait a minute and try again.', 429, true)
      }
      return fail('signup_unavailable', 'Unable to create account right now. Please try again in a few minutes.', 503, true)
    }

    const userId = created.user?.id
    if (!userId) {
      return fail('signup_failed', 'Unable to create account.', 500, true)
    }

    let organizationId: string | null = null
    let leagueId: string | null = null
    let workspaceId: string | null = null
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: userId,
      email,
      full_name: fullName,
      role,
    })

    if (profileError) {
      await rollbackCreatedAccount({ userId })
      return setupFailureResponse(requestId, 'profiles_upsert', profileError)
    }

    if (role === 'org_admin') {
      const orgName = String(payload?.org_name || '').trim() || `${fullName}'s Organization`
      const requestedOrgType = String(payload?.org_type || '').trim().toLowerCase()
      const orgType = ['school', 'club', 'travel', 'academy', 'organization'].includes(requestedOrgType)
        ? requestedOrgType
        : 'organization'

      const { data: organization, error: organizationError } = await supabaseAdmin
        .from('organizations')
        .insert({ org_type: orgType, status: 'active' })
        .select('id')
        .single()
      if (organizationError || !organization?.id) {
        await rollbackCreatedAccount({ userId })
        return setupFailureResponse(requestId, 'organizations_insert', organizationError || new Error('Organization insert returned no ID'))
      }
      organizationId = organization.id

      const { error: settingsError } = await supabaseAdmin.from('org_settings').insert({
        org_id: organizationId,
        org_name: orgName,
        primary_contact_email: email,
      })
      if (settingsError) {
        await rollbackCreatedAccount({ userId, organizationId })
        return setupFailureResponse(requestId, 'org_settings_insert', settingsError)
      }

      const { error: membershipError } = await supabaseAdmin.from('organization_memberships').insert({
        user_id: userId,
        org_id: organizationId,
        role: 'org_admin',
        status: 'active',
      })
      if (membershipError) {
        await rollbackCreatedAccount({ userId, organizationId })
        return setupFailureResponse(requestId, 'organization_memberships_insert', membershipError)
      }

      const { error: currentOrgError } = await supabaseAdmin.from('profiles')
        .update({ current_org_id: organizationId })
        .eq('id', userId)
      if (currentOrgError) {
        await rollbackCreatedAccount({ userId, organizationId })
        return setupFailureResponse(requestId, 'profiles_current_org_update', currentOrgError)
      }

      const { data: workspace, error: workspaceError } = await supabaseAdmin.from('business_workspaces').insert({
        workspace_type: 'organization', organization_id: organizationId, owner_user_id: userId,
        display_name: orgName, status: 'active',
      }).select('id').single()
      if (workspaceError || !workspace?.id) {
        await rollbackCreatedAccount({ userId, organizationId })
        return setupFailureResponse(requestId, 'organization_workspace_insert', workspaceError || new Error('Workspace insert returned no ID'))
      }
      workspaceId = workspace.id
      const { error: workspaceMembershipError } = await supabaseAdmin.from('workspace_memberships').insert({
        workspace_id: workspace.id, user_id: userId, roles: ['owner', 'org_admin'], status: 'active',
        permissions: { manage_members: true, manage_teams: true, manage_pricing: true, manage_billing: true, view_revenue: true, manage_connect: true, send_documents: true, view_audit: true, export_records: true },
      })
      if (workspaceMembershipError) {
        await rollbackCreatedAccount({ userId, organizationId })
        return setupFailureResponse(requestId, 'organization_workspace_membership_insert', workspaceMembershipError)
      }
    }

    if (role === 'coach') {
      const { data: workspace, error: workspaceError } = await supabaseAdmin.from('business_workspaces').insert({
        workspace_type: 'independent_coach', owner_user_id: userId, display_name: `${fullName}'s Team`, status: 'active',
      }).select('id').single()
      if (workspaceError || !workspace?.id) {
        await rollbackCreatedAccount({ userId })
        return setupFailureResponse(requestId, 'independent_workspace_insert', workspaceError || new Error('Workspace insert returned no ID'))
      }
      workspaceId = workspace.id
      const { error: workspaceMembershipError } = await supabaseAdmin.from('workspace_memberships').insert({
        workspace_id: workspace.id, user_id: userId, roles: ['owner', 'coach'], status: 'active',
        permissions: { manage_members: true, manage_schedule: true, manage_pricing: true, view_revenue: true, manage_connect: true, send_documents: true },
      })
      if (workspaceMembershipError) {
        await supabaseAdmin.from('business_workspaces').delete().eq('id', workspace.id)
        await rollbackCreatedAccount({ userId })
        return setupFailureResponse(requestId, 'workspace_membership_insert', workspaceMembershipError)
      }
    }

    if (role === 'league_admin') {
      const leagueName = String(payload?.league_name || payload?.org_name || '').trim() || `${fullName}'s League`
      const { data: league, error: leagueError } = await supabaseAdmin.from('leagues').insert({
        name: leagueName,
        sport: String(payload?.sport || '').trim() || null,
        general_location: String(payload?.general_location || '').trim() || null,
        status: 'active',
      }).select('id').single()
      if (leagueError || !league?.id) {
        await rollbackCreatedAccount({ userId })
        return setupFailureResponse(requestId, 'leagues_insert', leagueError || new Error('League insert returned no ID'))
      }
      leagueId = league.id
      const { error: membershipError } = await supabaseAdmin.from('league_memberships').insert({
        league_id: leagueId, user_id: userId, role: 'league_admin', status: 'active',
      })
      if (membershipError) {
        await rollbackCreatedAccount({ userId, leagueId })
        return setupFailureResponse(requestId, 'league_memberships_insert', membershipError)
      }
      const { data: workspace, error: workspaceError } = await supabaseAdmin.from('business_workspaces').insert({
        workspace_type: 'league', league_id: leagueId, owner_user_id: userId,
        display_name: leagueName, status: 'active',
      }).select('id').single()
      if (workspaceError || !workspace?.id) {
        await rollbackCreatedAccount({ userId, leagueId })
        return setupFailureResponse(requestId, 'league_workspace_insert', workspaceError || new Error('Workspace insert returned no ID'))
      }
      workspaceId = workspace.id
      const { error: workspaceMembershipError } = await supabaseAdmin.from('workspace_memberships').insert({
        workspace_id: workspace.id, user_id: userId, roles: ['owner', 'league_admin'], status: 'active',
        permissions: { manage_members: true, manage_organizations: true, manage_divisions: true, manage_teams: true, manage_schedule: true, manage_registrations: true, manage_payments: true, manage_billing: true, manage_documents: true, send_announcements: true, view_reports: true, view_audit: true, export_records: true },
      })
      if (workspaceMembershipError) {
        await rollbackCreatedAccount({ userId, leagueId })
        return setupFailureResponse(requestId, 'league_workspace_membership_insert', workspaceMembershipError)
      }
    }

    if (payload?.ref_code) {
      const referralResult = await recordReferralSignup({
        refereeId: userId,
        code: String(payload.ref_code),
        role,
      })
      if (!referralResult.ok && referralResult.status !== 'already_recorded' && referralResult.status !== 'already_referred') {
        console.warn('[api/auth/signup] referral capture issue:', referralResult.status, referralResult.message || '')
      }
    }

    const codeResult = await sendEmailVerificationCode({ email, role, tier: selectedTier })
    if (!codeResult.ok) {
      await rollbackCreatedAccount({ userId, organizationId, leagueId })
      if (codeResult.code === 'provider_misconfigured') {
        return fail('verification_provider_unavailable', codeResult.error, 503, true)
      }
      if (codeResult.error.toLowerCase().includes('rate limit')) {
        return fail('verification_rate_limited', codeResult.error, 429, true)
      }
      return fail('verification_delivery_failed', codeResult.error, 503, true)
    }

    const posthog = getPostHogClient()
    posthog.capture({
      distinctId: userId,
      event: 'user_signed_up',
      properties: {
        role,
        selected_tier: selectedTier || null,
        has_referral: Boolean(payload?.ref_code),
        from_slug: payload?.from_slug || null,
        from_type: payload?.from_type || null,
        intended_action: payload?.intended_action || null,
      },
    })
    posthog.identify({
      distinctId: userId,
      properties: {
        email,
        name: fullName,
        role,
      },
    })

    return NextResponse.json({
      created: true,
      code_sent: true,
      code_length: codeResult.codeLength,
      user_id: userId,
      role,
      plan_key: selectedTier,
      workspace_id: workspaceId,
      organization_id: organizationId,
      league_id: leagueId,
      request_id: requestId,
    }, { headers: { 'X-Coaches-Hive-Support-Reference': requestId } })
  } catch (error) {
    console.error('[api/auth/signup] unexpected error', error)
    return fail('signup_unavailable', 'Signup is temporarily unavailable. Please try again shortly.', 503, true)
  }
}
