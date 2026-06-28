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

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: userId,
      full_name: fullName,
      role,
    })

    if (profileError) {
      const { error: fallbackProfileError } = await supabaseAdmin.from('profiles').upsert({
        id: userId,
        full_name: fullName,
        role,
      })

      if (fallbackProfileError) {
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => null)
        return jsonPublicServerError(
          'Account setup failed. Please try again.',
          503,
        )
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
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => null)
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

    return NextResponse.json({ created: true, code_sent: true, code_length: codeResult.codeLength })
  } catch (error) {
    console.error('[api/auth/signup] unexpected error', error)
    return jsonPublicServerError(
      'Signup is temporarily unavailable. Please try again shortly.',
      503,
    )
  }
}
