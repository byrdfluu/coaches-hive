import { expect, test } from '@playwright/test'
import fs from 'node:fs'

const read = (path: string) => fs.readFileSync(path, 'utf8')

test('organization announcements use the authoritative recipient and notification contract', () => {
  const sql = read('supabase/migrations/20261006040000_harden_announcements_and_family_avatars.sql')
  const route = read('src/app/api/org/messages/announcements/route.ts')
  expect(sql).toContain("'org_announcement'")
  expect(sql).toContain("'program_director'")
  expect(sql).toContain("'org-announcement:'||v_id::text||':'||recipient.user_id::text")
  expect(sql).toContain("'announcement_id',v_id")
  expect(route).toContain("rpc('send_org_announcement'")
  expect(route).not.toContain(".from('org_announcements')\n    .insert")
})

test('announcement cancellation read state and RLS retire inaccessible content', () => {
  const sql = read('supabase/migrations/20261006040000_harden_announcements_and_family_avatars.sql')
  expect(sql).toContain('announcement.canceled_at is null')
  expect(sql).toContain('announcement.expires_at is null or announcement.expires_at>now()')
  expect(sql).toContain('set expires_at=now(),read_at=coalesce(read_at,now()),is_read=true')
  expect(sql).toContain('public.mark_org_announcement_read')
})

test('message reads and primary athlete avatar updates reconcile canonical state', () => {
  const sql = read('supabase/migrations/20261006040000_harden_announcements_and_family_avatars.sql')
  expect(sql).toContain('reconcile_message_notifications_after_read_trigger')
  expect(sql).toContain("notification.data->>'thread_id'=new.thread_id::text")
  expect(sql).toContain('sync_primary_athlete_avatar_to_account_trigger')
  expect(sql).toContain('update public.profiles set avatar_url=new.avatar_url')
})
