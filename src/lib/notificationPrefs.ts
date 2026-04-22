export type NotificationChannelPrefs = {
  email: boolean
  push: boolean
}

export type NotificationPrefs = Record<string, NotificationChannelPrefs>

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
}

export const resolveNotificationCategory = (type?: string | null, dataCategory?: string | null) => {
  if (dataCategory) return toCategoryKey(dataCategory)
  if (!type) return ''
  return notificationTypeCategoryMap[type] || ''
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

