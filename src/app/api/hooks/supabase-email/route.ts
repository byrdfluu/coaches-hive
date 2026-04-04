import { NextResponse } from 'next/server'
import { sendAccountEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const normalizeEventType = (value: unknown) => String(value || '').trim().toLowerCase()

const resolveHookType = (payload: Record<string, any>) => {
  const candidates = [
    payload.email_action_type,
    payload.type,
    payload.action,
    payload.event,
    payload.email_data?.email_action_type,
  ]

  return candidates
    .map(normalizeEventType)
    .find((value) => value.length > 0) || ''
}

const resolveEmail = (payload: Record<string, any>) => {
  const candidates = [
    payload.email_data?.current_email,
    payload.current_email,
    payload.previous_email,
    payload.old_email,
    payload.email,
    payload.user?.email,
    payload.new_email,
    payload.user?.new_email,
    payload.email_data?.new_email,
  ]

  const email = candidates.find((value) => typeof value === 'string' && value.trim().length > 0)
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

const resolveName = (payload: Record<string, any>) => {
  const candidates = [
    payload.user?.user_metadata?.full_name,
    payload.user?.user_metadata?.name,
    payload.user_metadata?.full_name,
    payload.user_metadata?.name,
  ]

  const name = candidates.find((value) => typeof value === 'string' && value.trim().length > 0)
  return typeof name === 'string' ? name.trim() : null
}

const resolveActionUrl = (payload: Record<string, any>) => {
  const candidates = [
    payload.action_link,
    payload.email_data?.action_link,
    payload.redirect_to,
    payload.email_data?.redirect_to,
  ]

  const actionUrl = candidates.find((value) => typeof value === 'string' && value.trim().length > 0)
  return typeof actionUrl === 'string' ? actionUrl.trim() : null
}

export async function POST(request: Request) {
  const secret = process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET
  if (secret) {
    const header = request.headers.get('x-supabase-hook-secret')
    if (header !== secret) {
      return jsonError('Unauthorized', 401)
    }
  }

  const payload = await request.json().catch(() => ({})) as Record<string, any>
  const hookType = resolveHookType(payload)

  if (hookType.includes('recovery')) {
    const toEmail = resolveEmail(payload)
    if (!toEmail) {
      return jsonError('Email is required', 400)
    }

    await sendAccountEmail({
      toEmail,
      toName: resolveName(payload),
      type: 'password_reset',
      actionUrl: resolveActionUrl(payload),
      dashboardUrl: '/login',
    })

    return NextResponse.json({ handled: true })
  }

  if (!hookType.includes('email_change')) {
    return NextResponse.json({ handled: false, reason: 'ignored' })
  }

  const toEmail = resolveEmail(payload)
  if (!toEmail) {
    return jsonError('Email is required', 400)
  }

  await sendAccountEmail({
    toEmail,
    toName: resolveName(payload),
    type: 'email_changed',
    actionUrl: resolveActionUrl(payload),
    dashboardUrl: '/login',
  })

  return NextResponse.json({ handled: true })
}
