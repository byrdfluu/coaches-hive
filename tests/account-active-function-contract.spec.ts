import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('invite notification dependency defines account_is_active safely', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260926020000_restore_account_is_active.sql'), 'utf8')
  expect(sql).toContain('function public.account_is_active(p_user_id uuid)')
  expect(sql).toContain("coalesce(p.status, 'active') = 'active'")
  expect(sql).toContain('security definer')
  expect(sql).toContain('grant execute on function public.account_is_active(uuid) to authenticated, service_role')
})
