import * as Sentry from '@sentry/nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveBaseUrl, toAbsoluteUrl } from '@/lib/siteUrl'

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
  replyTo?: string | null
  from?: string | null
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

const escapeHtml = (value?: string | null) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const formatMoneyLabel = (amount?: string | number | null, currency?: string | null) => {
  const numericAmount =
    typeof amount === 'number'
      ? amount
      : typeof amount === 'string'
        ? Number.parseFloat(amount)
        : 0
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0
  const currencyCode = (currency || 'USD').toUpperCase()
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount)
}

type LocalRenderedEmail = {
  subject?: string
  bodyHtml: string
  textBody?: string
  actionUrl?: string | null
}

const buildGreeting = (firstName?: string | null) => `<p>Hi ${escapeHtml(firstName || 'there')},</p>`

const buildDetailList = (items: Array<{ label: string; value?: string | null }>) => {
  const rows = items
    .filter((item) => item.value && String(item.value).trim().length > 0)
    .map(
      (item) =>
        `<tr><td style="padding:0 12px 8px 0;color:#666666;font-size:14px;vertical-align:top;"><strong>${escapeHtml(item.label)}</strong></td><td style="padding:0 0 8px;color:#191919;font-size:14px;">${escapeHtml(item.value)}</td></tr>`,
    )
    .join('')

  if (!rows) return ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 0;">${rows}</table>`
}

const stripHtml = (value?: string | null) =>
  String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const renderLocalTemplateEmail = (
  templateAlias: string,
  model: Record<string, unknown>,
): LocalRenderedEmail | null => {
  const firstName = typeof model.first_name === 'string' ? model.first_name : 'there'
  const coachName = normalizeName(typeof model.coach_name === 'string' ? model.coach_name : null)
  const athleteName = normalizeName(typeof model.athlete_name === 'string' ? model.athlete_name : null)
  const actionUrl = typeof model.action_url === 'string' ? model.action_url : null
  const dashboardUrl = typeof model.dashboard_url === 'string' ? model.dashboard_url : null
  const productName = typeof model.product_name === 'string' ? model.product_name : 'your item'
  const ticketSubject = typeof model.ticket_subject === 'string' ? model.ticket_subject : 'Support request'
  const inviteBodyHtml = typeof model.body_html === 'string' ? model.body_html : ''
  const messagePreview = typeof model.message_preview === 'string' ? model.message_preview : ''

  switch (templateAlias) {
    case 'account_verify_code': {
      const code = escapeHtml(typeof model.verification_code === 'string' ? model.verification_code : '')
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>Use this verification code to continue:</p>
          <p style="margin:20px 0;font-size:34px;font-weight:700;letter-spacing:0.18em;color:#191919;">${code}</p>
          <p>This code expires soon. Do not share it.</p>
        `,
        textBody: `Hi ${firstName},\n\nUse this verification code to continue:\n\n${stripHtml(code)}\n\nContinue here: ${actionUrl || dashboardUrl || resolveBaseUrl()}`,
        actionUrl,
      }
    }
    case 'user_invite':
      return {
        bodyHtml: `${buildGreeting(firstName)}${inviteBodyHtml}`,
        textBody: `Hi ${firstName},\n\n${stripHtml(inviteBodyHtml)}\n\nOpen this link: ${actionUrl || dashboardUrl || resolveBaseUrl()}`,
        actionUrl,
      }
    case 'booking_confirmation_athlete':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>Your session with <strong>${escapeHtml(coachName)}</strong> is confirmed.</p>
          ${buildDetailList([
            { label: 'Date', value: typeof model.session_date === 'string' ? model.session_date : null },
            { label: 'Time', value: typeof model.session_time === 'string' ? model.session_time : null },
            { label: 'Type', value: typeof model.session_type === 'string' ? model.session_type : null },
            { label: 'Location', value: typeof model.session_location === 'string' ? model.session_location : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'booking_confirmation_coach':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>You have a new booking from <strong>${escapeHtml(athleteName)}</strong>.</p>
          ${buildDetailList([
            { label: 'Date', value: typeof model.session_date === 'string' ? model.session_date : null },
            { label: 'Time', value: typeof model.session_time === 'string' ? model.session_time : null },
            { label: 'Type', value: typeof model.session_type === 'string' ? model.session_type : null },
            { label: 'Location', value: typeof model.session_location === 'string' ? model.session_location : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'session_reminder':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>This is a reminder for your upcoming session with <strong>${escapeHtml(coachName)}</strong>.</p>
          ${buildDetailList([
            { label: 'Date', value: typeof model.session_date === 'string' ? model.session_date : null },
            { label: 'Time', value: typeof model.session_time === 'string' ? model.session_time : null },
            { label: 'Location', value: typeof model.session_location === 'string' ? model.session_location : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'session_canceled':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>${escapeHtml(
            `The ${typeof model.session_type === 'string' ? model.session_type : 'session'} between ${athleteName} and ${coachName} was canceled.`,
          )}</p>
          ${buildDetailList([
            { label: 'Date', value: typeof model.session_date === 'string' ? model.session_date : null },
            { label: 'Time', value: typeof model.session_time === 'string' ? model.session_time : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'session_rescheduled':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>${escapeHtml(
            `The ${typeof model.session_type === 'string' ? model.session_type : 'session'} between ${athleteName} and ${coachName} was rescheduled.`,
          )}</p>
          ${buildDetailList([
            { label: 'New date', value: typeof model.session_date === 'string' ? model.session_date : null },
            { label: 'New time', value: typeof model.session_time === 'string' ? model.session_time : null },
            { label: 'Location', value: typeof model.session_location === 'string' ? model.session_location : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'payment_receipt':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>We processed your payment${typeof model.receipt_id === 'string' && model.receipt_id ? ` for receipt <strong>${escapeHtml(model.receipt_id)}</strong>` : ''}.</p>
          ${buildDetailList([
            { label: 'Amount', value: formatMoneyLabel(typeof model.amount === 'string' ? model.amount : null, typeof model.currency === 'string' ? model.currency : null) },
            { label: 'Description', value: typeof model.message_preview === 'string' ? model.message_preview : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'refund_receipt':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>Your refund has been processed.</p>
          ${buildDetailList([
            { label: 'Amount', value: formatMoneyLabel(typeof model.amount === 'string' ? model.amount : null, typeof model.currency === 'string' ? model.currency : null) },
            { label: 'Receipt', value: typeof model.receipt_id === 'string' ? model.receipt_id : null },
            { label: 'Description', value: typeof model.description === 'string' ? model.description : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'payout_sent':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>Your payout is on its way.</p>
          ${buildDetailList([
            { label: 'Amount', value: formatMoneyLabel(typeof model.amount === 'string' ? model.amount : null, typeof model.currency === 'string' ? model.currency : null) },
            { label: 'Payout ID', value: typeof model.payout_id === 'string' ? model.payout_id : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'marketplace_order_confirmation_buyer':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>Your order for <strong>${escapeHtml(productName)}</strong> is confirmed.</p>
          ${buildDetailList([
            { label: 'Amount', value: formatMoneyLabel(typeof model.amount === 'string' ? model.amount : null, typeof model.currency === 'string' ? model.currency : null) },
            { label: 'Order ID', value: typeof model.order_id === 'string' ? model.order_id : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'marketplace_new_order_seller':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>You received a new order for <strong>${escapeHtml(productName)}</strong>.</p>
          ${buildDetailList([
            { label: 'Buyer', value: typeof model.buyer_name === 'string' ? model.buyer_name : null },
            { label: 'Amount', value: formatMoneyLabel(typeof model.amount === 'string' ? model.amount : null, typeof model.currency === 'string' ? model.currency : null) },
            { label: 'Order ID', value: typeof model.order_id === 'string' ? model.order_id : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'marketplace_order_update':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>Your order for <strong>${escapeHtml(productName)}</strong> was updated.</p>
          ${buildDetailList([
            { label: 'Status', value: typeof model.new_status === 'string' ? model.new_status : null },
            { label: 'Order ID', value: typeof model.order_id === 'string' ? model.order_id : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'support_ticket_received':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>We received your support request.</p>
          ${buildDetailList([
            { label: 'Subject', value: ticketSubject },
            { label: 'Ticket ID', value: typeof model.ticket_id === 'string' ? model.ticket_id : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'support_ticket_reply':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>You have a new reply on your support request.</p>
          ${buildDetailList([{ label: 'Subject', value: ticketSubject }])}
          <div style="margin-top:16px;padding:16px;border:1px solid #e0e0e0;border-radius:12px;background:#fafafa;color:#191919;font-size:14px;line-height:1.6;">
            ${escapeHtml(typeof model.reply_body === 'string' ? model.reply_body : '')}
          </div>
        `,
        actionUrl: dashboardUrl,
      }
    case 'subscription_updated':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>Your Coaches Hive subscription was updated.</p>
          ${buildDetailList([
            { label: 'Plan', value: typeof model.plan_name === 'string' ? model.plan_name : null },
            { label: 'Status', value: typeof model.new_status === 'string' ? model.new_status : null },
          ])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'subscription_payment_failed':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>Your subscription payment did not go through.</p>
          ${buildDetailList([{ label: 'Plan', value: typeof model.plan_name === 'string' ? model.plan_name : null }])}
        `,
        actionUrl: actionUrl || dashboardUrl,
      }
    case 'account_welcome':
      return {
        bodyHtml: `${buildGreeting(firstName)}<p>Welcome to Coaches Hive. Your account is ready.</p>`,
        actionUrl: actionUrl || dashboardUrl,
      }
    case 'account_password_reset':
      return {
        bodyHtml: `${buildGreeting(firstName)}<p>You requested a password reset for your Coaches Hive account.</p>`,
        actionUrl: actionUrl || dashboardUrl,
      }
    case 'account_verify_email':
      return {
        bodyHtml: `${buildGreeting(firstName)}<p>Please verify your Coaches Hive email address.</p>`,
        actionUrl: actionUrl || dashboardUrl,
      }
    case 'account_email_changed':
      return {
        bodyHtml: `${buildGreeting(firstName)}<p>Your Coaches Hive email address was changed.</p>`,
        actionUrl: actionUrl || dashboardUrl,
      }
    case 'org_role_changed':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>Your role in <strong>${escapeHtml(typeof model.org_name === 'string' ? model.org_name : 'your organization')}</strong> has changed.</p>
          ${buildDetailList([{ label: 'New role', value: typeof model.new_role === 'string' ? model.new_role : null }])}
        `,
        actionUrl: dashboardUrl,
      }
    case 'coach_broadcast':
      return {
        bodyHtml: `${buildGreeting(firstName)}${typeof model.body_html === 'string' ? model.body_html : `<p>${escapeHtml(messagePreview)}</p>`}`,
        actionUrl: actionUrl || dashboardUrl,
      }
    case 'guardian_approval_request':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>${escapeHtml(messagePreview || `${athleteName} requested your approval.`)}</p>
        `,
        actionUrl,
      }
    case 'guardian_approved':
    case 'guardian_declined':
      return {
        bodyHtml: `
          ${buildGreeting(firstName)}
          <p>${escapeHtml(messagePreview || `There is an update on ${athleteName}'s request.`)}</p>
        `,
        actionUrl: dashboardUrl,
      }
    default:
      if (inviteBodyHtml || messagePreview) {
        return {
          bodyHtml: `${buildGreeting(firstName)}${inviteBodyHtml || `<p>${escapeHtml(messagePreview)}</p>`}`,
          actionUrl: actionUrl || dashboardUrl,
        }
      }
      return null
  }
}

export const buildBrandedEmailHtml = (bodyHtml: string, actionUrl?: string | null, actionLabel?: string) => {
  const supportEmail = process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL
  void actionLabel
  const directLink = actionUrl
    ? `<div style="margin:24px 0 0;padding:16px 18px;border:1px solid #e0e0e0;border-radius:12px;background:#fafafa;">
        <p style="margin:0 0 8px;color:#555555;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Open this link</p>
        <a href="${actionUrl}" style="color:#b80f0a;font-size:14px;line-height:1.6;word-break:break-word;text-decoration:underline;">${escapeHtml(actionUrl)}</a>
       </div>`
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
            ${directLink}
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

  const baseMessage: Record<string, unknown> = {
    From: payload.from || fromEmail,
    To: effectiveName ? `${effectiveName} <${effectiveTo}>` : effectiveTo,
    MessageStream: messageStream,
    Tag: payload.tag,
    Metadata: normalizeMetadata(payload.metadata),
  }
  if (payload.replyTo) {
    baseMessage.ReplyTo = payload.replyTo
  }

  const normalizedTemplateModel = payload.templateAlias
    ? {
        ...buildBaseTemplateModel(payload.toName),
        ...normalizeTemplateModel(payload.templateModel),
      }
    : null
  const localRenderedTemplate =
    payload.templateAlias && normalizedTemplateModel
      ? renderLocalTemplateEmail(payload.templateAlias, normalizedTemplateModel)
      : null

  const endpoint = payload.templateAlias && !localRenderedTemplate ? POSTMARK_TEMPLATE_ENDPOINT : POSTMARK_ENDPOINT
  const message = payload.templateAlias && !localRenderedTemplate
    ? {
        ...baseMessage,
        TemplateAlias: payload.templateAlias,
        TemplateModel: normalizedTemplateModel,
      }
    : {
        ...baseMessage,
        Subject: payload.subject || localRenderedTemplate?.subject,
        HtmlBody: payload.htmlBody || (localRenderedTemplate
          ? buildBrandedEmailHtml(localRenderedTemplate.bodyHtml, localRenderedTemplate.actionUrl)
          : undefined),
        TextBody: payload.textBody || localRenderedTemplate?.textBody || undefined,
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
  dashboardUrl?: string | null
}) => {
  const supportEmail = process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL
  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject: `We received your support request — ${payload.subject || 'your ticket'}`,
    templateAlias: 'support_ticket_received',
    tag: 'support_ticket_received',
    replyTo: supportEmail,
    templateModel: {
      ticket_subject: payload.subject || 'Support request',
      ticket_id: payload.ticketId || '',
      dashboard_url: toAbsoluteUrl(payload.dashboardUrl || '/support'),
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
  dashboardUrl?: string | null
}) => {
  const supportEmail = process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL
  return sendTransactionalEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    from: supportEmail,
    subject: `Re: ${payload.subject || 'Support request'}`,
    templateAlias: 'support_ticket_reply',
    tag: 'support_reply',
    replyTo: supportEmail,
    templateModel: {
      ticket_subject: payload.subject || 'Support request',
      reply_body: payload.replyBody || '',
      dashboard_url: toAbsoluteUrl(payload.dashboardUrl || '/support'),
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
