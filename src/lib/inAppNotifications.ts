import { deliverNotificationPush } from '@/lib/apns'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveNotificationCategory } from '@/lib/notificationPrefs'

export type InAppNotification = {
  user_id: string
  type?: string | null
  title?: string | null
  body?: string | null
  action_url?: string | null
  workspace_id?: string | null
  category?: string | null
  deduplication_key?: string | null
  expires_at?: string | null
  data?: Record<string, unknown> | null
  [key: string]: unknown
}

export const insertNotifications = async (
  input: InAppNotification | InAppNotification[],
) => {
  // Keep native role-specific destinations intact for mobile deep-link routing.
  const incoming = Array.isArray(input) ? input : [input]
  const rows = incoming.map((row) => {
    const data = row.data || {}
    const eventKey = data.event_id || data.request_id || data.stripe_event_id || null
    const resourceKey = data.record_id || data.assignment_id || data.invitation_id || data.request_id || null
    return {
      ...row,
      data,
      workspace_id: row.workspace_id || (typeof data.workspace_id === 'string' ? data.workspace_id : null),
      category: row.category || resolveNotificationCategory(row.type, typeof data.category === 'string' ? data.category : null),
      deduplication_key: row.deduplication_key || (eventKey ? `${row.type || 'general'}:${eventKey}:${resourceKey || ''}` : null),
    }
  }).filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now())

  const inserted: any[] = []
  for (const row of rows) {
    let query = supabaseAdmin.from('notifications')
    const result = row.deduplication_key
      ? await query.upsert(row as any, { onConflict: 'user_id,deduplication_key', ignoreDuplicates: true })
        .select('id,user_id,type,title,body,action_url,data,workspace_id,category,deduplication_key,expires_at')
      : await query.insert(row as any)
        .select('id,user_id,type,title,body,action_url,data,workspace_id,category,deduplication_key,expires_at')
    if (result.error) return result
    inserted.push(...(result.data || []))
  }
  const result = { data: inserted, error: null }

  if (result.data.length) {
    const deliveries = await Promise.allSettled(
      result.data.map(async (notification) => {
        const { data: allowed } = await (supabaseAdmin as any).rpc('user_allows_notification', {
          p_user_id: notification.user_id,
          p_type: notification.type,
          p_category: notification.category,
          p_data: notification.data || {},
        })
        return allowed === false ? null : deliverNotificationPush(notification)
      }),
    )
    deliveries.forEach((delivery) => {
      if (delivery.status === 'rejected') {
        console.error('[inAppNotifications] APNs delivery failed', delivery.reason)
      }
    })
  }
  return result
}

export const notifySuperadmins = async (input: {
  type: string
  title: string
  body: string
  workspaceId?: string | null
  destination?: string | null
  deduplicationKey: string
  group?: 'operational' | 'commerce' | 'support_safety'
  critical?: boolean
  data?: Record<string, unknown>
}) => {
  const { data: admins, error } = await supabaseAdmin.from('profiles').select('id').in('role', ['admin', 'superadmin'])
  if (error || !admins?.length) return { data: [], error }
  const ids = admins.map(row => row.id)
  const { data: preferences } = await supabaseAdmin.from('admin_notification_preferences')
    .select('user_id,operational_alerts,commerce_alerts,support_and_safety').in('user_id', ids)
  const preferenceMap = new Map((preferences || []).map(row => [row.user_id, row]))
  const group = input.group || 'operational'
  return insertNotifications(admins.filter(admin => {
    if (input.critical) return true
    const prefs = preferenceMap.get(admin.id)
    if (!prefs) return true
    return group === 'commerce' ? prefs.commerce_alerts
      : group === 'support_safety' ? prefs.support_and_safety : prefs.operational_alerts
  }).map(admin => ({
    user_id: admin.id,
    type: input.type,
    category: input.critical ? 'security' : group === 'commerce' ? 'payments' : 'account',
    title: input.title,
    body: input.body,
    workspace_id: input.workspaceId || null,
    action_url: input.destination || '/admin',
    deduplication_key: `admin:${input.deduplicationKey}`,
    data: { ...(input.data || {}), critical: Boolean(input.critical), admin_group: group },
  })))
}
