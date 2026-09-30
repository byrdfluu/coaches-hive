import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('notification migration is web-compatible and tenant aware', () => {
  const sql = source('supabase/migrations/20260930010000_notification_system_hardening.sql')
  for (const column of ['workspace_id', 'category', 'deduplication_key', 'expires_at']) expect(sql).toContain(column)
  expect(sql).toContain('notifications_user_dedupe_uidx')
  expect(sql).toContain('notification_category')
  expect(sql).toContain('notification_is_critical')
  expect(sql).toContain('user_allows_notification')
  expect(sql).toContain('notify_user_v2')
  expect(sql).toContain('create table if not exists public.league_notification_preferences')
  expect(sql).toContain('create table if not exists public.admin_notification_preferences')
})

test('shared insertion service normalizes, deduplicates, checks preferences, and sends only new pushes', () => {
  const service = source('src/lib/inAppNotifications.ts')
  expect(service).toContain('resolveNotificationCategory')
  expect(service).toContain("onConflict: 'user_id,deduplication_key'")
  expect(service).toContain('ignoreDuplicates: true')
  expect(service).toContain("rpc('user_allows_notification'")
  expect(service).toContain('deliverNotificationPush(notification)')
  expect(service).toContain('workspace_id')
  expect(service).toContain('expires_at')
})

test('push delivery health records notification and device identities', () => {
  const apns = source('src/lib/apns.ts')
  expect(apns).toContain(".select('id,token')")
  expect(apns).toContain('notification_id: notification.id || null')
  expect(apns).toContain('device_token_id: result.deviceTokenId')
})

test('inbox hides expired and inaccessible workspace notifications', () => {
  const route = source('src/app/api/notifications/route.ts')
  expect(route).toContain("from('workspace_memberships')")
  expect(route).toContain("row.status === 'active'")
  expect(route).toContain('item.expires_at')
  expect(route).toContain('allowedWorkspaceIds.has(item.workspace_id)')
  expect(route).toContain('isPlatformAdmin')
})

test('categories cover every portal responsibility', () => {
  const prefs = source('src/lib/notificationPrefs.ts')
  for (const category of [
    'messages', 'schedule', 'payments', 'registrations', 'roster', 'documents',
    'marketplace', 'results', 'attendance', 'invites', 'account', 'security', 'general',
  ]) expect(prefs).toContain(`'${category}'`)
})

test('Stripe failures create deduplicated critical superadmin notifications', () => {
  const service = source('src/lib/inAppNotifications.ts')
  const platformWebhook = source('src/app/api/stripe/webhook/route.ts')
  const connectWebhook = source('src/app/api/stripe/connect-webhook/route.ts')
  expect(service).toContain('export const notifySuperadmins')
  expect(service).toContain(".in('role', ['admin', 'superadmin'])")
  expect(platformWebhook).toContain("deduplicationKey: `webhook:${event.id}`")
  expect(connectWebhook).toContain("deduplicationKey: `webhook:${event.id}`")
  expect(platformWebhook).toContain("critical: true")
})
