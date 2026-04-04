import { NextResponse } from 'next/server'
import { sendEmailVerificationCode } from '@/lib/authVerification'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const jsonPublicServerError = (message: string, status = 503) =>
  NextResponse.json({ error: message }, { status })

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}))
    const email = String(payload?.email || '').trim().toLowerCase()
    const role = String(payload?.role || '').trim() || null
    const tier = String(payload?.tier || '').trim() || null

    if (!email) return jsonError('Email is required.')

    const result = await sendEmailVerificationCode({ email, role, tier })
    if (!result.ok) {
      if (result.code === 'provider_misconfigured') {
        return jsonPublicServerError(result.error, 503)
      }
      if (result.error.toLowerCase().includes('rate limit')) {
        return jsonError(result.error, 429)
      }
      return jsonPublicServerError(result.error, 503)
    }

    return NextResponse.json({ sent: true, code_length: result.codeLength })
  } catch (error) {
    console.error('[api/auth/send-code] unexpected error', error)
    return jsonPublicServerError(
      'Unable to send verification code. Please try again.',
      503,
    )
  }
}
