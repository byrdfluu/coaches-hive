import { deliverNotificationPush } from '@/lib/apns'
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

export const insertNotifications = async (
  input: InAppNotification | InAppNotification[],
) => {
  // Keep native role-specific destinations intact for mobile deep-link routing.
  const rows = Array.isArray(input) ? input : [input]
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
