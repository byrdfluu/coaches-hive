import { NextResponse } from 'next/server'
import { hasSupabaseAdminConfig, supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendEmailVerificationCode } from '@/lib/authVerification'
import { recordReferralSignup } from '@/lib/referrals'
import { getPostHogClient } from '@/lib/posthog-server'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const jsonPublicServerError = (message: string, status = 503) =>
  NextResponse.json({ error: message }, { status })

const ALLOWED_ROLES = new Set(['coach', 'athlete', 'org_admin'])

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

const setupFailureResponse = (step: string, error: SupabaseSetupError | Error) => {
  const actualError = formatSetupError(step, error)
  console.error('[api/auth/signup] account setup failed', { step, error })
  return jsonPublicServerError(
    process.env.NODE_ENV === 'development'
      ? `Account setup failed: ${actualError}`
      : 'Account setup failed. Please try again.',
    503,
  )
}

const rollbackCreatedAccount = async ({ userId, organizationId }: { userId: string; organizationId?: string | null }) => {
  const cleanupErrors: Array<{ step: string; error: unknown }> = []
  if (organizationId) {
    const settingsResult = await supabaseAdmin.from('org_settings').delete().eq('org_id', organizationId)
    if (settingsResult.error) cleanupErrors.push({ step: 'delete_org_settings', error: settingsResult.error })
    const membershipResult = await supabaseAdmin.from('organization_memberships').delete().eq('org_id', organizationId)
    if (membershipResult.error) cleanupErrors.push({ step: 'delete_organization_memberships', error: membershipResult.error })
    const organizationResult = await supabaseAdmin.from('organizations').delete().eq('id', organizationId)
    if (organizationResult.error) cleanupErrors.push({ step: 'delete_organization', error: organizationResult.error })
  }
  const authResult = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (authResult.error) cleanupErrors.push({ step: 'delete_auth_user', error: authResult.error })
  if (cleanupErrors.length) console.error('[api/auth/signup] rollback encountered errors', { userId, organizationId, cleanupErrors })
}

export async function POST(request: Request) {
  try {
    if (!hasSupabaseAdminConfig) {
      return jsonPublicServerError(
        'Signup is temporarily unavailable. Please try again shortly.',
        503,
      )
    }

    const payload = await request.json().catch(() => ({}))
    const email = String(payload?.email || '').trim().toLowerCase()
    const password = String(payload?.password || '')
    const role = String(payload?.role || '').trim()
    const fullName = String(payload?.full_name || '').trim()
    const selectedTier = String(payload?.selected_tier || '').trim() || null
    const billingInterval = payload?.billing_interval === 'year' ? 'year' : 'month'

    if (!email) return jsonError('Email is required.')
    if (!password) return jsonError('Password is required.')
    if (!ALLOWED_ROLES.has(role)) return jsonError('Invalid role.')
    if (!fullName) return jsonError('Full name is required.')

    const userMetadata = {
      role,
      full_name: fullName,
      ref_code: payload?.ref_code || undefined,
      from_slug: payload?.from_slug ? String(payload.from_slug).trim() || undefined : undefined,
      from_type: payload?.from_type ? String(payload.from_type).trim() || undefined : undefined,
      selected_tier: selectedTier || undefined,
      billing_interval: billingInterval,
      lifecycle_state: payload?.lifecycle_state || 'awaiting_verification',
      lifecycle_updated_at: payload?.lifecycle_updated_at || new Date().toISOString(),
      org_name: role === 'org_admin' ? String(payload?.org_name || '').trim() || undefined : undefined,
      org_type: role === 'org_admin' ? String(payload?.org_type || '').trim() || undefined : undefined,
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
        return jsonError('An account with this email already exists.', 409)
      }
      if (
        lowerMessage.includes('password')
        || lowerMessage.includes('email')
        || lowerMessage.includes('invalid')
      ) {
        return jsonError(message, 400)
      }
      if (lowerMessage.includes('rate limit')) {
        return jsonError('Too many attempts. Please wait a minute and try again.', 429)
      }
      return jsonPublicServerError(
        'Unable to create account right now. Please try again in a few minutes.',
        503,
      )
    }

    const userId = created.user?.id
    if (!userId) {
      return jsonError('Unable to create account.', 500)
    }

    let organizationId: string | null = null
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: userId,
      email,
      full_name: fullName,
      role,
    })

    if (profileError) {
      await rollbackCreatedAccount({ userId })
      return setupFailureResponse('profiles_upsert', profileError)
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
        return setupFailureResponse('organizations_insert', organizationError || new Error('Organization insert returned no ID'))
      }
      organizationId = organization.id

      const { error: settingsError } = await supabaseAdmin.from('org_settings').insert({
        org_id: organizationId,
        org_name: orgName,
        primary_contact_email: email,
      })
      if (settingsError) {
        await rollbackCreatedAccount({ userId, organizationId })
        return setupFailureResponse('org_settings_insert', settingsError)
      }

      const { error: membershipError } = await supabaseAdmin.from('organization_memberships').insert({
        user_id: userId,
        org_id: organizationId,
        role: 'org_admin',
        status: 'active',
      })
      if (membershipError) {
        await rollbackCreatedAccount({ userId, organizationId })
        return setupFailureResponse('organization_memberships_insert', membershipError)
      }

      const { error: currentOrgError } = await supabaseAdmin.from('profiles')
        .update({ current_org_id: organizationId })
        .eq('id', userId)
      if (currentOrgError) {
        await rollbackCreatedAccount({ userId, organizationId })
        return setupFailureResponse('profiles_current_org_update', currentOrgError)
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
      await rollbackCreatedAccount({ userId, organizationId })
      if (codeResult.code === 'provider_misconfigured') {
        return jsonPublicServerError(codeResult.error, 503)
      }
      if (codeResult.error.toLowerCase().includes('rate limit')) {
        return jsonError(codeResult.error, 429)
      }
      return jsonPublicServerError(codeResult.error, 503)
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
    })
  } catch (error) {
    console.error('[api/auth/signup] unexpected error', error)
    return jsonPublicServerError(
      'Signup is temporarily unavailable. Please try again shortly.',
      503,
    )
  }
}
