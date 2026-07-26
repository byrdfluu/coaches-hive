import { deliverNotificationPush } from '@/lib/apns'
import { toAppFirstActionUrl } from '@/lib/appFirstRouting'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type InAppNotification = {
  user_id: string
  type?: string | null
  title?: string | null
  body?: string | null
  action_url?: string | null
  data?: Record<string, unknown> | null
  [key: string]: unknown
}

const appFirstNotification = (notification: InAppNotification): InAppNotification => {
  const actionUrl = typeof notification.action_url === 'string' ? notification.action_url.trim() : ''
  const normalizedActionUrl = toAppFirstActionUrl(actionUrl)
  if (!normalizedActionUrl || normalizedActionUrl === actionUrl) {
    return notification
  }

  return {
    ...notification,
    action_url: normalizedActionUrl,
    data: {
      ...(notification.data || {}),
      app_destination: actionUrl,
    },
  }
}

export const insertNotifications = async (
  input: InAppNotification | InAppNotification[],
) => {
  const rows = (Array.isArray(input) ? input : [input]).map(appFirstNotification)
  const result = await supabaseAdmin
    .from('notifications')
    .insert(rows)
    .select('id, user_id, type, title, body, action_url, data')

  if (!result.error && result.data?.length) {
    const deliveries = await Promise.allSettled(
      result.data.map((notification) => deliverNotificationPush(notification)),
    )
    deliveries.forEach((delivery) => {
      if (delivery.status === 'rejected') {
        console.error('[inAppNotifications] APNs delivery failed', delivery.reason)
      }
    })
  }
  return result
}
