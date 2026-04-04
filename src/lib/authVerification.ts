import { sendTransactionalEmail } from '@/lib/email'
import { hasSupabaseAdminConfig, supabaseAdmin } from '@/lib/supabaseAdmin'

export type VerificationCodeResult =
  | { ok: true; codeLength: number }
  | {
      ok: false
      error: string
      code: 'provider_misconfigured' | 'generate_failed' | 'delivery_failed'
    }

const resolveBaseUrl = () => {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || null
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://coacheshive.com'
}

const buildVerifyRedirectUrl = (params: { role?: string | null; tier?: string | null; email: string }) => {
  const search = new URLSearchParams()
  if (params.role) search.set('role', params.role)
  if (params.tier) search.set('tier', params.tier)
  search.set('email', params.email)
  const query = search.toString()
  return `${resolveBaseUrl()}/auth/verify${query ? `?${query}` : ''}`
}

export const sendEmailVerificationCode = async (params: {
  email: string
  role?: string | null
  tier?: string | null
}): Promise<VerificationCodeResult> => {
  const email = params.email.trim().toLowerCase()
  if (!email) {
    return { ok: false, error: 'Email is required.', code: 'generate_failed' }
  }

  if (!hasSupabaseAdminConfig) {
    return {
      ok: false,
      error: 'Verification is temporarily unavailable. Please try again shortly.',
      code: 'generate_failed',
    }
  }

  if (!process.env.POSTMARK_SERVER_TOKEN || !process.env.POSTMARK_FROM_EMAIL) {
    return {
      ok: false,
      error: 'Verification email provider is temporarily unavailable. Please try again shortly.',
      code: 'provider_misconfigured',
    }
  }

  const redirectTo = buildVerifyRedirectUrl({ role: params.role, tier: params.tier, email })
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  })

  if (error) {
    const message = error.message || 'Unable to generate verification code.'
    if (message.toLowerCase().includes('rate limit')) {
      return {
        ok: false,
        error: 'Too many attempts. Please wait a minute and try again.',
        code: 'generate_failed',
      }
    }
    return { ok: false, error: message, code: 'generate_failed' }
  }

  const code = String(data?.properties?.email_otp || '').trim()
  if (!code) {
    return { ok: false, error: 'Unable to generate verification code.', code: 'generate_failed' }
  }
  if (!/^\d+$/.test(code)) {
    return { ok: false, error: 'Unable to generate verification code.', code: 'generate_failed' }
  }

  const metadata = {
    verification_channel: 'email_code',
    role: params.role || null,
    tier: params.tier || null,
  }
  const codeLength = code.length

  let delivery = await sendTransactionalEmail({
    toEmail: email,
    templateAlias: 'account_verify_code',
    tag: 'account_verify_code',
    templateModel: {
      verification_code: code,
      code_length: codeLength,
      action_url: redirectTo,
    },
    metadata,
  })

  if (delivery.status === 'failed' && (delivery as { error?: string }).error?.toLowerCase().includes('template')) {
    // Fallback only when the template is missing in Postmark — not on transient errors,
    // because the first request may have already been queued and sent.
    delivery = await sendTransactionalEmail({
      toEmail: email,
      subject: 'Your Coaches Hive verification code',
      htmlBody: `
        <div style="font-family: Arial, Helvetica, sans-serif; color: #191919; line-height: 1.5;">
          <p>Use this verification code to continue:</p>
          <p style="font-size: 30px; font-weight: 700; letter-spacing: 4px; margin: 16px 0;">${code}</p>
          <p>This code expires soon. Do not share it.</p>
        </div>
      `,
      textBody: `Your Coaches Hive verification code is ${code}. This code expires soon.`,
      tag: 'account_verify_code',
      metadata,
    })
  }

  if (delivery.status !== 'sent') {
    const reason =
      (delivery as { reason?: string }).reason ||
      (delivery as { error?: string }).error ||
      'Unable to send verification code email.'
    return {
      ok: false,
      error: reason,
      code: 'delivery_failed',
    }
  }

  return { ok: true, codeLength }
}
