import { NextResponse } from 'next/server'
import { sendAccountEmail } from '@/lib/email'
import { hasSupabaseAdminConfig, supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveBaseUrl } from '@/lib/siteUrl'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status })

const buildResetRedirectUrl = () => `${resolveBaseUrl()}/auth/reset`

const isUnknownUserError = (message: string) => {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('user not found')
    || normalized.includes('not found')
    || normalized.includes('no user')
  )
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}))
    const email = String(payload?.email || '').trim().toLowerCase()

    if (!email) return jsonError('Email is required.')

    if (!hasSupabaseAdminConfig) {
      return jsonError(
        'Password reset is temporarily unavailable. Please try again shortly.',
        503,
      )
    }

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: buildResetRedirectUrl() },
    })

    if (error) {
      const message = error.message || 'Unable to generate password reset link.'
      if (isUnknownUserError(message)) {
        return NextResponse.json({ sent: true })
      }
      if (message.toLowerCase().includes('rate limit')) {
        return jsonError('Too many attempts. Please wait a minute and try again.', 429)
      }
      return jsonError(
        'Unable to send reset email. Please try again shortly.',
        503,
      )
    }

    const actionUrl = String(data?.properties?.action_link || '').trim()
    if (!actionUrl) {
      return jsonError(
        'Unable to generate password reset link. Please try again shortly.',
        503,
      )
    }

    const delivery = await sendAccountEmail({
      toEmail: email,
      toName: typeof data?.user?.user_metadata?.full_name === 'string'
        ? data.user.user_metadata.full_name
        : null,
      type: 'password_reset',
      actionUrl,
      dashboardUrl: '/login',
    })

    if (delivery.status !== 'sent') {
      const reason =
        (delivery as { reason?: string }).reason
        || (delivery as { error?: string }).error
        || 'Unable to send reset email. Please try again shortly.'
      const isMissingProvider = reason.toLowerCase().includes('postmark')
        || reason.toLowerCase().includes('configuration')
      return jsonError(
        isMissingProvider
          ? 'Password reset email provider is temporarily unavailable. Please try again shortly.'
          : reason,
        503,
      )
    }

    return NextResponse.json({ sent: true })
  } catch (error) {
    console.error('[api/auth/password-reset] unexpected error', error)
    return jsonError(
      'Unable to send reset email. Please try again shortly.',
      503,
    )
  }
}
