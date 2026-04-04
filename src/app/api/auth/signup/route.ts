import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { hasSupabaseAdminConfig, supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendEmailVerificationCode } from '@/lib/authVerification'
import { resolveGuardianUserIdForAthlete } from '@/lib/guardianApproval'
import { recordReferralSignup } from '@/lib/referrals'
import { sendGuardianInviteEmail } from '@/lib/inviteDelivery'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const jsonPublicServerError = (message: string, status = 503) =>
  NextResponse.json({ error: message }, { status })

const ALLOWED_ROLES = new Set(['coach', 'athlete', 'guardian', 'org_admin'])

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
    const accountOwnerType = String(payload?.account_owner_type || '').trim()
    const guardianEmail = String(payload?.guardian_email || '').trim().toLowerCase()
    const guardianApprovalRule =
      role === 'athlete' && accountOwnerType === 'athlete_minor'
        ? 'required'
        : 'notify'

    if (!email) return jsonError('Email is required.')
    if (!password) return jsonError('Password is required.')
    if (!ALLOWED_ROLES.has(role)) return jsonError('Invalid role.')
    if (!fullName) return jsonError('Full name is required.')
    if (role === 'athlete' && guardianEmail && guardianEmail === email) {
      return jsonError('Guardian email must be different from the athlete email.')
    }

    // 'guardian' is no longer a valid account_owner_type at self-signup — guardians are invited
    const safeAccountOwnerType =
      accountOwnerType === 'athlete_adult' || accountOwnerType === 'athlete_minor'
        ? accountOwnerType
        : role === 'athlete'
        ? 'athlete_adult'
        : undefined

    const userMetadata = {
      role,
      full_name: fullName,
      ref_code: payload?.ref_code || undefined,
      selected_tier: selectedTier || undefined,
      lifecycle_state: payload?.lifecycle_state || 'awaiting_verification',
      lifecycle_updated_at: payload?.lifecycle_updated_at || new Date().toISOString(),
      account_owner_type: role === 'guardian' ? 'guardian' : safeAccountOwnerType || undefined,
      athlete_birthdate: payload?.athlete_birthdate || undefined,
      guardian_name: payload?.guardian_name || undefined,
      guardian_email: guardianEmail || undefined,
      guardian_phone: payload?.guardian_phone || undefined,
      org_name: role === 'org_admin' ? String(payload?.org_name || '').trim() || undefined : undefined,
      org_type: role === 'org_admin' ? String(payload?.org_type || '').trim() || undefined : undefined,
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
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
      athlete_birthdate: role === 'athlete' ? payload?.athlete_birthdate || null : null,
      account_owner_type:
        role === 'athlete'
          ? safeAccountOwnerType || null
          : role === 'guardian'
            ? 'guardian'
            : null,
      guardian_name: role === 'athlete' ? payload?.guardian_name || null : null,
      guardian_email: role === 'athlete' ? guardianEmail || null : null,
      guardian_phone: role === 'athlete' ? payload?.guardian_phone || null : null,
      guardian_approval_rule: role === 'athlete' ? guardianApprovalRule : null,
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

    if (role === 'athlete') {
      await resolveGuardianUserIdForAthlete(userId, {
        id: userId,
        guardian_email: guardianEmail || null,
      })

      // If a guardian email was provided, create an invite and send the email
      if (guardianEmail) {
        try {
          const token = crypto.randomUUID()
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          await supabaseAdmin.from('guardian_invites').upsert(
            {
              token,
              guardian_email: guardianEmail,
              athlete_id: userId,
              athlete_name: fullName,
              status: 'pending',
              expires_at: expiresAt,
            },
            { onConflict: 'guardian_email,athlete_id', ignoreDuplicates: false },
          )
          await sendGuardianInviteEmail({ toEmail: guardianEmail, athleteName: fullName, inviteToken: token })
        } catch (inviteErr) {
          // Non-fatal: athlete account is still created, invite can be resent later
          console.warn('[api/auth/signup] guardian invite creation failed', inviteErr)
        }
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

    return NextResponse.json({ created: true, code_sent: true, code_length: codeResult.codeLength })
  } catch (error) {
    console.error('[api/auth/signup] unexpected error', error)
    return jsonPublicServerError(
      'Signup is temporarily unavailable. Please try again shortly.',
      503,
    )
  }
}
