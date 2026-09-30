export type NotificationChannelPrefs = {
  email: boolean
  push: boolean
}

export type NotificationPrefs = Record<string, NotificationChannelPrefs>

export const NOTIFICATION_CATEGORIES = [
  'messages', 'schedule', 'payments', 'registrations', 'roster', 'documents',
  'marketplace', 'results', 'attendance', 'invites', 'account', 'security', 'general',
] as const

export const DEFAULT_CHANNEL_PREFS: NotificationChannelPrefs = {
  email: true,
  push: true,
}

export const toCategoryKey = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

export const buildNotificationPrefs = (labels: string[]) => {
  return labels.reduce<NotificationPrefs>((acc, label) => {
    acc[toCategoryKey(label)] = { ...DEFAULT_CHANNEL_PREFS }
    return acc
  }, {})
}

export const mergeNotificationPrefs = (defaults: NotificationPrefs, stored: unknown) => {
  const merged: NotificationPrefs = { ...defaults }
  if (!stored || typeof stored !== 'object') return merged
  Object.entries(stored as Record<string, unknown>).forEach(([key, value]) => {
    const normalizedKey = toCategoryKey(key)
    const current = merged[normalizedKey] || { ...DEFAULT_CHANNEL_PREFS }
    if (value && typeof value === 'object') {
      const entry = value as Record<string, unknown>
      merged[normalizedKey] = {
        email: typeof entry.email === 'boolean' ? entry.email : current.email,
        push: typeof entry.push === 'boolean' ? entry.push : current.push,
      }
    } else {
      merged[normalizedKey] = current
    }
  })
  return merged
}

export const notificationTypeCategoryMap: Record<string, string> = {
  org_invite: 'messages',
  org_invite_approval: 'messages',
  org_invite_declined: 'messages',
  org_invite_approved: 'messages',
  session_booked: 'sessions',
  session_payment: 'payments',
  review_submitted: 'reviews',
  marketplace_order: 'marketplace',
  support_reply: 'messages',
  announcement: 'messages',
  mention: 'messages',
  booking_created: 'schedule',
  booking_canceled: 'schedule',
  schedule_changed: 'schedule',
  payment_failed: 'payments',
  payment_refunded: 'payments',
  league_fee: 'payments',
  roster_changed: 'roster',
  organization_membership: 'roster',
  leave_request: 'roster',
  waiver_reminder: 'documents',
  document_requested: 'documents',
  document_submitted: 'documents',
  document_reviewed: 'documents',
  compliance_update: 'documents',
  attendance_reminder: 'attendance',
  team_created: 'roster',
  team_assignment_changed: 'roster',
  roster_status_changed: 'roster',
  league_division_created: 'registrations',
  league_season_created: 'schedule',
  league_score_submitted: 'results',
  league_document_created: 'documents',
  league_announcement: 'messages',
  league_join_requested: 'registrations',
  admin_webhook_failure: 'security',
  admin_checkout_failure: 'payments',
  admin_security_event: 'security',
}

export const resolveNotificationCategory = (type?: string | null, dataCategory?: string | null) => {
  if (dataCategory) return toCategoryKey(dataCategory)
  if (!type) return ''
  const mapped = notificationTypeCategoryMap[type]
  if (mapped) return mapped
  const normalized = toCategoryKey(type)
  if (/security|password|login|account|verification/.test(normalized)) return 'security'
  if (/message|mention|announcement/.test(normalized)) return 'messages'
  if (/schedule|session|booking|game|event/.test(normalized)) return 'schedule'
  if (/payment|fee|dues|refund|payout|subscription|dispute/.test(normalized)) return 'payments'
  if (/registration|join_request|waitlist/.test(normalized)) return 'registrations'
  if (/invite/.test(normalized)) return 'invites'
  if (/roster|team|coach|athlete|leave_request/.test(normalized)) return 'roster'
  if (/waiver|document|compliance|consent/.test(normalized)) return 'documents'
  if (/marketplace|order|product/.test(normalized)) return 'marketplace'
  if (/score|result|standing/.test(normalized)) return 'results'
  if (/attendance|check_in/.test(normalized)) return 'attendance'
  return 'general'
}

const resolveChannel = (prefs: unknown, categoryKey: string) => {
  if (!prefs || typeof prefs !== 'object') return null
  const key = toCategoryKey(categoryKey)
  const entry = (prefs as NotificationPrefs)[key]
  if (!entry || typeof entry !== 'object') return null
  return entry
}

export const isChannelEnabled = (prefs: unknown, categoryKey: string, channel: keyof NotificationChannelPrefs) => {
  const entry = resolveChannel(prefs, categoryKey)
  if (!entry) return true
  if (typeof entry[channel] === 'boolean') return entry[channel]
  return true
}

export const isPushEnabled = (prefs: unknown, categoryKey: string) => {
  return isChannelEnabled(prefs, categoryKey, 'push')
}

export const isEmailEnabled = (prefs: unknown, categoryKey: string) => {
  return isChannelEnabled(prefs, categoryKey, 'email')
}
