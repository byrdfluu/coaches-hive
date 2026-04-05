import * as Sentry from '@sentry/nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type SendEmailPayload = {
  toEmail: string
  toName?: string | null
  subject?: string
  htmlBody?: string
  textBody?: string
  tag?: string
  metadata?: Record<string, unknown>
  templateAlias?: string
  templateModel?: Record<string, unknown>
}

const POSTMARK_ENDPOINT = 'https://api.postmarkapp.com/email'
const POSTMARK_TEMPLATE_ENDPOINT = 'https://api.postmarkapp.com/email/withTemplate'
const DEFAULT_SUPPORT_EMAIL = 'support@coacheshive.com'
const POSTMARK_METADATA_KEY_LIMIT = 20
const POSTMARK_METADATA_VALUE_LIMIT = 80
const EMAIL_LOGO_MARK = `
  <svg width="28" height="28" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="presentation">
    <path
      fill="#b80f0a"
      d="M25 8h31v9H33L21 45l18-6 4-12-8-3 7-16h11l-7 18 8 4-5 16-35 11 11-49Z"
    />
  </svg>
`

const resolveBaseUrl = () => {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || null
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://coacheshive.com'
}

const toAbsoluteUrl = (value?: string | null) => {
  if (!value) return resolveBaseUrl()
  if (/^https?:\/\//i.test(value)) return value
  const path = value.startsWith('/') ? value : `/${value}`
  return `${resolveBaseUrl()}${path}`
}

const getFirstName = (value?: string | null) => {
  if (!value) return 'there'
  const trimmed = value.trim()
  if (!trimmed) return 'there'
  return trimmed.split(/\s+/)[0] || 'there'
}

const buildBaseTemplateModel = (toName?: string | null) => ({
  first_name: getFirstName(toName),
  full_name: toName?.trim() || '',
  support_email: process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL,
})

const normalizeTemplateModel = (model?: Record<string, unknown>) => {
  const next = { ...(model || {}) }
  const actionUrl = typeof next.action_url === 'string' ? next.action_url.trim() : ''
  const dashboardUrl = typeof next.dashboard_url === 'string' ? next.dashboard_url.trim() : ''
  next.action_url = toAbsoluteUrl(actionUrl || '/login')
  next.dashboard_url = toAbsoluteUrl(dashboardUrl || '/login')
  return next
}

const normalizeMetadata = (metadata?: Record<string, unknown>) => {
  if (!metadata) return undefined
  const cleaned: Record<string, string> = {}
  const usedKeys = new Set<string>()

  const toPostmarkKey = (input: string) => {
    const base = input.trim().slice(0, POSTMARK_METADATA_KEY_LIMIT)
    if (!base) return ''
    if (!usedKeys.has(base)) {
      usedKeys.add(base)
      return base
    }

    let counter = 2
    while (counter < 1000) {
      const suffix = String(counter)
      const candidate = `${base.slice(0, POSTMARK_METADATA_KEY_LIMIT - suffix.length)}${suffix}`
      if (!usedKeys.has(candidate)) {
        usedKeys.add(candidate)
        return candidate
      }
      counter += 1
    }

    return ''
  }

  const toPostmarkValue = (input: string) => input.trim().slice(0, POSTMARK_METADATA_VALUE_LIMIT)

  Object.entries(metadata).forEach(([key, value]) => {
    if (value === null || value === undefined) return
    const normalizedKey = toPostmarkKey(key)
    if (!normalizedKey) return
    if (typeof value === 'string') {
      const trimmed = toPostmarkValue(value)
      if (!trimmed) return
      cleaned[normalizedKey] = trimmed
      return
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      const normalizedValue = toPostmarkValue(String(value))
      if (!normalizedValue) return
      cleaned[normalizedKey] = normalizedValue
      return
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      cleaned[normalizedKey] = toPostmarkValue(value.toISOString())
      return
    }
    try {
      const json = toPostmarkValue(JSON.stringify(value))
      if (json) cleaned[normalizedKey] = json
    } catch {
      // Ignore non-serializable metadata values.
    }
  })
  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}

const formatDateLabel = (value?: string | null) => {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBD'
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

const formatTimeLabel = (value?: string | null) => {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBD'
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

const normalizeName = (value?: string | null) => (value && value.trim().length ? value.trim() : 'Coach')

export const buildBrandedEmailHtml = (bodyHtml: string, actionUrl?: string, actionLabel?: string) => {
  const supportEmail = process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL
  const ctaButton = actionUrl
    ? `<p style="margin:24px 0 0;">
        <a href="${actionUrl}" style="display:inline-block;background:#b80f0a;color:#ffffff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:999px;text-decoration:none;">
          ${actionLabel || 'Open Coaches Hive'}
        </a>
       </p>`
    : ''
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e0e0e0;">
        <tr>
          <td style="background:#191919;padding:20px 32px;">
            <table cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="vertical-align:middle;padding-right:12px;">${EMAIL_LOGO_MARK}</td>
                <td style="vertical-align:middle;">
                  <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.08em;">COACHES HIVE</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;color:#191919;font-size:15px;line-height:1.6;">
            ${bodyHtml}
            ${ctaButton}
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f9;padding:20px 32px;border-top:1px solid #e0e0e0;">
            <p style="margin:0;color:#888888;font-size:12px;">© Coaches Hive &nbsp;·&nbsp; <a href="https://coacheshive.com" style="color:#888888;text-decoration:none;">coacheshive.com</a></p>
            <p style="margin:6px 0 0;color:#888888;font-size:12px;">Questions? <a href="mailto:${supportEmail}" style="color:#888888;">${supportEmail}</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export const sendTransactionalEmail = async (payload: SendEmailPayload) => {
  const token = process.env.POSTMARK_SERVER_TOKEN
  const fromEmail = process.env.POSTMARK_FROM_EMAIL
  const messageStream = process.env.POSTMARK_MESSAGE_STREAM || 'outbound'

  if (!token || !fromEmail) {
    return { status: 'skipped', reason: 'Missing Postmark configuration' }
  }

  if (!payload.templateAlias && (!payload.subject || !payload.htmlBody)) {
    return { status: 'failed', error: 'Either templateAlias or subject+htmlBody is required' }
  }

  const nowIso = new Date().toISOString()
  const { data: deliveryRow } = await supabaseAdmin
    .from('email_deliveries')
    .insert({
      provider: 'postmark',
      template: payload.templateAlias || payload.tag || null,
      to_email: payload.toEmail,
      to_name: payload.toName || null,
      from_email: fromEmail,
      subject: payload.subject || null,
      status: 'queued',
      metadata: payload.metadata || {},
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .maybeSingle()

  const deliveryId = deliveryRow?.id || ''

  // During Postmark sandbox / pending-approval mode, override the recipient so all
  // emails land in a single controlled inbox rather than being rejected.
  const toOverride = process.env.POSTMARK_TO_OVERRIDE || ''
  const effectiveTo = toOverride || payload.toEmail
  const effectiveName = toOverride ? null : payload.toName
  const shouldLogPostmarkSend = process.env.POSTMARK_DEBUG === '1'

  if (shouldLogPostmarkSend) {
    console.info(
      `[email] Postmark send from=${fromEmail} to=${effectiveTo} stream=${messageStream} template=${payload.templateAlias || 'none'} tag=${payload.tag || 'none'}`,
    )
  }

  const baseMessage = {
    From: fromEmail,
    To: effectiveName ? `${effectiveName} <${effectiveTo}>` : effectiveTo,
    MessageStream: messageStream,
    Tag: payload.tag,
    Metadata: normalizeMetadata(payload.metadata),
  }

  const endpoint = payload.templateAlias ? POSTMARK_TEMPLATE_ENDPOINT : POSTMARK_ENDPOINT
  const message = payload.templateAlias
    ? {
        ...baseMessage,
        TemplateAlias: payload.templateAlias,
        TemplateModel: {
          ...buildBaseTemplateModel(payload.toName),
          ...normalizeTemplateModel(payload.templateModel),
        },
      }
    : {
        ...baseMessage,
        Subject: payload.subject,
        HtmlBody: payload.htmlBody,
        TextBody: payload.textBody || undefined,
      }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify(message),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      await supabaseAdmin
        .from('email_deliveries')
        .update({
          status: 'failed',
          error: data?.Message || data?.message || 'Postmark request failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId)
      return { status: 'failed', error: data?.Message || data?.message || 'Postmark request failed' }
    }

    await supabaseAdmin
      .from('email_deliveries')
      .update({
        status: 'sent',
        message_id: data?.MessageID || null,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)

    return { status: 'sent', messageId: data?.MessageID || null }
  } catch (error) {
    Sentry.captureException(error)
    await supabaseAdmin
      .from('email_deliveries')
      .update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Postmark request failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)
    return { status: 'failed', error: error instanceof Error ? error.message : 'Postmark request failed' }
  }
}

export const sendBookingConfirmationEmail = async (payload: {
  toEmail: string
  toName?: string | null
  coachName?: string | null
  athleteName?: string | null
  startTime?: string | null
  endTime?: string | null
  location?: string | null
  sessionType?: string | null
  sessionId?: string | null
  recipientType?: 'coach' | 'athlete'
  dashboardUrl?: string | null
}) => {
  const coachName = normalizeName(payload.coachName)
  const athleteName = normalizeName(payload.athleteName)
  const isCoachRecipient = payload.recipientType === 'coach'
  const templateAlias = isCoachRecipient ? 'booking_confirmation_coach' : 'booking_confirmation_athlete'

  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: isCoachRecipient ? `New booking from ${athleteName}` : `Booking confirmed with ${coachName}`,
    templateAlias,
    tag: 'booking_confirmation',
    templateModel: {
      coach_name: coachName,
      athlete_name: athleteName,
      session_date: formatDateLabel(payload.startTime),
      session_time: formatTimeLabel(payload.startTime),
      session_location: payload.location || 'TBD',
      session_type: payload.sessionType || 'Training session',
      dashboard_url: toAbsoluteUrl(
        payload.dashboardUrl || (isCoachRecipient ? '/coach/calendar' : '/athlete/calendar')
      ),
    },
    metadata: {
      session_id: payload.sessionId || null,
      coach_name: coachName,
      athlete_name: athleteName,
      recipient_type: payload.recipientType || 'athlete',
    },
  })
}

export const sendPaymentReceiptEmail = async (payload: {
  toEmail: string
  toName?: string | null
  amount?: number | null
  currency?: string | null
  receiptId?: string | null
  description?: string | null
  dashboardUrl?: string | null
}) => {
  const amountNumber = payload.amount !== null && payload.amount !== undefined ? payload.amount : 0
  const amountLabel = amountNumber.toFixed(2)
  const currency = (payload.currency || 'USD').toUpperCase()

  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: `Payment receipt ${payload.receiptId || ''}`.trim(),
    templateAlias: 'payment_receipt',
    tag: 'payment_receipt',
    templateModel: {
      amount: amountLabel,
      currency,
      receipt_id: payload.receiptId || '',
      dashboard_url: toAbsoluteUrl(payload.dashboardUrl || '/login'),
      message_preview: payload.description || '',
    },
    metadata: { receipt_id: payload.receiptId || null },
  })
}

export const sendSessionReminderEmail = async (payload: {
  toEmail: string
  toName?: string | null
  coachName?: string | null
  startTime?: string | null
  location?: string | null
  sessionId?: string | null
  dashboardUrl?: string | null
}) => {
  const coachName = normalizeName(payload.coachName)

  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: `Session reminder with ${coachName}`,
    templateAlias: 'session_reminder',
    tag: 'session_reminder',
    templateModel: {
      coach_name: coachName,
      session_date: formatDateLabel(payload.startTime),
      session_time: formatTimeLabel(payload.startTime),
      session_location: payload.location || 'TBD',
      dashboard_url: toAbsoluteUrl(payload.dashboardUrl || '/athlete/calendar'),
    },
    metadata: { session_id: payload.sessionId || null },
  })
}

export const sendSessionCancellationEmail = async (payload: {
  toEmail: string
  toName?: string | null
  coachName?: string | null
  athleteName?: string | null
  startTime?: string | null
  sessionType?: string | null
  recipientType?: 'coach' | 'athlete'
  dashboardUrl?: string | null
}) => {
  const coachName = normalizeName(payload.coachName)
  const athleteName = normalizeName(payload.athleteName)
  const isCoachRecipient = payload.recipientType === 'coach'

  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: isCoachRecipient
      ? `Session canceled by ${athleteName}`
      : `Session canceled with ${coachName}`,
    templateAlias: 'session_canceled',
    tag: 'session_cancellation',
    templateModel: {
      coach_name: coachName,
      athlete_name: athleteName,
      session_date: formatDateLabel(payload.startTime),
      session_time: formatTimeLabel(payload.startTime),
      session_type: payload.sessionType || 'Training session',
      dashboard_url: toAbsoluteUrl(
        payload.dashboardUrl || (isCoachRecipient ? '/coach/calendar' : '/athlete/calendar')
      ),
    },
    metadata: {
      coach_name: coachName,
      athlete_name: athleteName,
      recipient_type: payload.recipientType || 'athlete',
    },
  })
}

export const sendAccountEmail = async (payload: {
  toEmail: string
  toName?: string | null
  type: 'welcome' | 'password_reset' | 'verify_email' | 'email_changed'
  actionUrl?: string | null
  dashboardUrl?: string | null
}) => {
  const templateAliasMap = {
    welcome: 'account_welcome',
    password_reset: 'account_password_reset',
    verify_email: 'account_verify_email',
    email_changed: 'account_email_changed',
  } as const

  const subjectMap = {
    welcome: 'Welcome to Coaches Hive',
    password_reset: 'Reset your Coaches Hive password',
    verify_email: 'Verify your Coaches Hive email',
    email_changed: 'Your Coaches Hive email address was changed',
  }

  const defaultActionUrlMap = {
    welcome: '/login',
    password_reset: '/auth/reset',
    verify_email: '/auth/verify',
    email_changed: '/login',
  } as const

  const resolvedActionUrl = toAbsoluteUrl(payload.actionUrl || defaultActionUrlMap[payload.type])
  const resolvedDashboardUrl = toAbsoluteUrl(payload.dashboardUrl || '/login')

  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: subjectMap[payload.type],
    templateAlias: templateAliasMap[payload.type],
    tag: `account_${payload.type}`,
    templateModel: {
      action_url: resolvedActionUrl,
      dashboard_url: resolvedDashboardUrl,
    },
    metadata: { action_url: resolvedActionUrl },
  })
}

export const sendSubscriptionUpdatedEmail = async (payload: {
  toEmail: string
  toName?: string | null
  planName?: string | null
  newStatus?: string | null
  dashboardUrl?: string | null
}) => {
  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: 'Your Coaches Hive subscription has been updated',
    templateAlias: 'subscription_updated',
    tag: 'subscription_updated',
    templateModel: {
      plan_name: payload.planName || 'your plan',
      new_status: payload.newStatus || 'updated',
      dashboard_url: toAbsoluteUrl(payload.dashboardUrl || '/login'),
    },
  })
}

export const sendSubscriptionPaymentFailedEmail = async (payload: {
  toEmail: string
  toName?: string | null
  planName?: string | null
  updateBillingUrl?: string | null
  dashboardUrl?: string | null
}) => {
  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: 'Action required: payment failed for your Coaches Hive subscription',
    templateAlias: 'subscription_payment_failed',
    tag: 'subscription_payment_failed',
    templateModel: {
      plan_name: payload.planName || 'your plan',
      action_url: toAbsoluteUrl(payload.updateBillingUrl || '/login'),
      dashboard_url: toAbsoluteUrl(payload.dashboardUrl || '/login'),
    },
  })
}

export const sendRefundReceiptEmail = async (payload: {
  toEmail: string
  toName?: string | null
  amount?: number | null
  currency?: string | null
  receiptId?: string | null
  description?: string | null
  dashboardUrl?: string | null
}) => {
  const amountNumber = payload.amount !== null && payload.amount !== undefined ? payload.amount : 0
  const amountLabel = amountNumber.toFixed(2)
  const currency = (payload.currency || 'USD').toUpperCase()

  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: `Refund issued${payload.receiptId ? ` — ${payload.receiptId}` : ''}`.trim(),
    templateAlias: 'refund_receipt',
    tag: 'refund_receipt',
    templateModel: {
      amount: amountLabel,
      currency,
      receipt_id: payload.receiptId || '',
      description: payload.description || 'Refund processed',
      dashboard_url: toAbsoluteUrl(payload.dashboardUrl || '/login'),
    },
    metadata: { receipt_id: payload.receiptId || null },
  })
}

export const sendPayoutSentEmail = async (payload: {
  toEmail: string
  toName?: string | null
  amount?: number | null
  currency?: string | null
  payoutId?: string | null
  dashboardUrl?: string | null
}) => {
  const amountNumber = payload.amount !== null && payload.amount !== undefined ? payload.amount : 0
  const amountLabel = amountNumber.toFixed(2)
  const currency = (payload.currency || 'USD').toUpperCase()

  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: `Payout of $${amountLabel} is on its way`,
    templateAlias: 'payout_sent',
    tag: 'payout_sent',
    templateModel: {
      amount: amountLabel,
      currency,
      payout_id: payload.payoutId || '',
      dashboard_url: toAbsoluteUrl(payload.dashboardUrl || '/coach/dashboard'),
    },
    metadata: { payout_id: payload.payoutId || null },
  })
}

export const sendMarketplaceOrderConfirmationEmail = async (payload: {
  toEmail: string
  toName?: string | null
  productName?: string | null
  amount?: number | null
  currency?: string | null
  orderId?: string | null
  dashboardUrl?: string | null
}) => {
  const amountNumber = payload.amount !== null && payload.amount !== undefined ? payload.amount : 0
  const amountLabel = amountNumber.toFixed(2)
  const currency = (payload.currency || 'USD').toUpperCase()

  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: `Order confirmed — ${payload.productName || 'your purchase'}`,
    templateAlias: 'marketplace_order_confirmation_buyer',
    tag: 'marketplace_order_confirmation_buyer',
    templateModel: {
      product_name: payload.productName || 'your purchase',
      amount: amountLabel,
      currency,
      order_id: payload.orderId || '',
      dashboard_url: toAbsoluteUrl(payload.dashboardUrl || '/athlete/marketplace/orders'),
    },
    metadata: { order_id: payload.orderId || null },
  })
}

export const sendMarketplaceNewOrderSellerEmail = async (payload: {
  toEmail: string
  toName?: string | null
  productName?: string | null
  buyerName?: string | null
  amount?: number | null
  currency?: string | null
  orderId?: string | null
  dashboardUrl?: string | null
}) => {
  const amountNumber = payload.amount !== null && payload.amount !== undefined ? payload.amount : 0
  const amountLabel = amountNumber.toFixed(2)
  const currency = (payload.currency || 'USD').toUpperCase()

  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: `New order for ${payload.productName || 'your product'}`,
    templateAlias: 'marketplace_new_order_seller',
    tag: 'marketplace_new_order_seller',
    templateModel: {
      product_name: payload.productName || 'your product',
      buyer_name: payload.buyerName || 'A buyer',
      amount: amountLabel,
      currency,
      order_id: payload.orderId || '',
      dashboard_url: toAbsoluteUrl(payload.dashboardUrl || '/coach/marketplace'),
    },
    metadata: { order_id: payload.orderId || null },
  })
}

export const sendMarketplaceOrderUpdateEmail = async (payload: {
  toEmail: string
  toName?: string | null
  productName?: string | null
  newStatus?: string | null
  orderId?: string | null
  dashboardUrl?: string | null
}) => {
  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: `Order update — ${payload.productName || 'your order'}`,
    templateAlias: 'marketplace_order_update',
    tag: 'marketplace_order_update',
    templateModel: {
      product_name: payload.productName || 'your order',
      new_status: payload.newStatus || 'updated',
      order_id: payload.orderId || '',
      dashboard_url: toAbsoluteUrl(payload.dashboardUrl || '/athlete/marketplace/orders'),
    },
    metadata: { order_id: payload.orderId || null },
  })
}

export const sendSupportTicketReceivedEmail = async (payload: {
  toEmail: string
  toName?: string | null
  subject?: string | null
  ticketId?: string | null
}) => {
  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: `We received your support request — ${payload.subject || 'your ticket'}`,
    templateAlias: 'support_ticket_received',
    tag: 'support_ticket_received',
    templateModel: {
      ticket_subject: payload.subject || 'Support request',
      ticket_id: payload.ticketId || '',
      dashboard_url: toAbsoluteUrl('/support'),
    },
    metadata: { ticket_id: payload.ticketId || null },
  })
}

export const sendSupportTicketReplyEmail = async (payload: {
  toEmail: string
  toName?: string | null
  subject?: string | null
  replyBody?: string | null
  ticketId?: string | null
  messageId?: string | null
}) => {
  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: `Re: ${payload.subject || 'Support request'}`,
    templateAlias: 'support_ticket_reply',
    tag: 'support_reply',
    templateModel: {
      ticket_subject: payload.subject || 'Support request',
      reply_body: payload.replyBody || '',
      dashboard_url: toAbsoluteUrl('/support'),
    },
    metadata: {
      ticket_id: payload.ticketId || null,
      support_message_id: payload.messageId || null,
    },
  })
}

export const sendSessionRescheduledEmail = async (payload: {
  toEmail: string
  toName?: string | null
  coachName?: string | null
  athleteName?: string | null
  newStartTime?: string | null
  location?: string | null
  sessionType?: string | null
  sessionId?: string | null
  recipientType?: 'coach' | 'athlete'
  dashboardUrl?: string | null
}) => {
  const coachName = normalizeName(payload.coachName)
  const athleteName = normalizeName(payload.athleteName)
  const isCoachRecipient = payload.recipientType === 'coach'

  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: isCoachRecipient
      ? `Session rescheduled by ${athleteName}`
      : `Session rescheduled with ${coachName}`,
    templateAlias: 'session_rescheduled',
    tag: 'session_rescheduled',
    templateModel: {
      coach_name: coachName,
      athlete_name: athleteName,
      session_date: formatDateLabel(payload.newStartTime),
      session_time: formatTimeLabel(payload.newStartTime),
      session_location: payload.location || 'TBD',
      session_type: payload.sessionType || 'Training session',
      dashboard_url: toAbsoluteUrl(
        payload.dashboardUrl || (isCoachRecipient ? '/coach/calendar' : '/athlete/calendar')
      ),
    },
    metadata: {
      session_id: payload.sessionId || null,
      recipient_type: payload.recipientType || 'athlete',
    },
  })
}

export const sendOrgRoleChangedEmail = async (payload: {
  toEmail: string
  toName?: string | null
  newRole?: string | null
  orgName?: string | null
  dashboardUrl?: string | null
}) => {
  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: `Your role in ${payload.orgName || 'your organization'} has changed`,
    templateAlias: 'org_role_changed',
    tag: 'org_role_changed',
    templateModel: {
      new_role: payload.newRole || 'member',
      org_name: payload.orgName || 'your organization',
      dashboard_url: toAbsoluteUrl(payload.dashboardUrl || '/org'),
    },
  })
}
