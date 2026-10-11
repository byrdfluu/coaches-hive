import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('organization notification preferences use the active workspace and expose every shared category', () => {
  const route = source('src/app/api/notification-preferences/route.ts')
  expect(route).toContain('resolveActiveOrganizationStaffContext')
  for (const field of ['new_message', 'payment_reminders', 'marketplace_orders', 'roster_updates', 'schedule_changes', 'new_invite_accepted', 'attendance_alerts', 'weekly_digest']) {
    expect(route).toContain(`'${field}'`)
  }
})

test('legacy and current organization preference names stay synchronized', () => {
  const migration = source('supabase/migrations/20261011060000_unify_org_notification_preferences.sql')
  expect(migration).toContain('add column if not exists weekly_digest')
  expect(migration).toContain('sync_org_notification_preference_aliases')
  expect(migration).toContain('new.new_payment_received := new.payment_reminders')
  expect(migration).toContain('new.team_updates := new.roster_updates')
})
