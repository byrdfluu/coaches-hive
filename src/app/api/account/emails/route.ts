import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { sendAccountEmail } from '@/lib/email'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['admin', 'org', 'coach', 'athlete'])
  if (error || !session) return error

  const payload = await request.json().catch(() => ({}))
  const type = String(payload?.type || '').toLowerCase()

  // Only allow relative paths to prevent open redirect / phishing via actionUrl
  const rawActionUrl = typeof payload?.action_url === 'string' ? payload.action_url : null
  const actionUrl = rawActionUrl && rawActionUrl.startsWith('/') ? rawActionUrl : null

  // Always send to the authenticated user's own email — never accept an arbitrary address from the body
  const toEmail = session.user.email
  const toName = typeof payload?.name === 'string' ? payload.name : session.user.user_metadata?.full_name

  if (!['welcome', 'password_reset', 'verify_email', 'email_changed'].includes(type)) {
    return jsonError('Invalid email type')
  }

  if (!toEmail) return jsonError('Email is required')

  await sendAccountEmail({
    toEmail,
    toName,
    type: type as 'welcome' | 'password_reset' | 'verify_email' | 'email_changed',
    actionUrl,
  })

  return NextResponse.json({ sent: true })
}
