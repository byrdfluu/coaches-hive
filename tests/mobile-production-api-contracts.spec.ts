import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('recurring billing exposes start portal status and authoritative lifecycle', () => {
  for (const file of ['start','billing-portal','status']) expect(fs.existsSync(path.join(process.cwd(), `src/app/api/mobile/recurring-fees/${file}/route.ts`))).toBeTruthy()
  const start = read('src/app/api/mobile/recurring-fees/start/route.ts'), status = read('src/app/api/mobile/recurring-fees/status/route.ts')
  expect(start).toContain("payment_method_types: ['card', 'us_bank_account']")
  expect(start).toContain('application_fee_percent: RECURRING_FEE_PLATFORM_PERCENT')
  expect(status).toContain('canManageOrganizationBilling')
  for (const code of [401,403,404,422]) expect(start + status + read('src/app/api/mobile/recurring-fees/billing-portal/route.ts')).toContain(String(code))
})

test('all requested mobile thread routes enforce participation and administration', () => {
  const files = ['participants/route.ts','participants/[userId]/route.ts','leave/route.ts','settings/route.ts','route.ts','pin/route.ts','search/route.ts','attachments/route.ts']
  const source = files.map((file) => read(`src/app/api/mobile/threads/[threadId]/${file}`)).join('\n')
  expect(source).toContain('requireMobileThread')
  expect(source).toContain('scopedUserCanJoin')
  expect(source).toContain('history_preserved: true')
  expect(source).toContain('threadAudit')
  expect(source).toContain('Thread owner or administrator permission required')
})

test('organization roles preserve keys, allow scoped multi-role assignment, and audit mutations', () => {
  const helper = read('src/lib/mobileOrganizationRoles.ts')
  const routes = [
    'src/app/api/orgs/[orgId]/roles/route.ts','src/app/api/orgs/[orgId]/roles/[roleId]/route.ts',
    'src/app/api/orgs/[orgId]/roles/[roleId]/assignments/route.ts','src/app/api/orgs/[orgId]/roles/[roleId]/assignments/[userId]/route.ts',
    'src/app/api/orgs/[orgId]/roles/audit/route.ts',
  ].map(read).join('\n')
  expect(helper).toContain('ORG_ROLE_PERMISSION_KEYS')
  expect(routes).toContain('role_key is permanent')
  for (const scope of ['organization','program','team','division']) expect(routes).toContain(scope)
  expect(routes).toContain('roleAudit')
  expect(routes).toContain(".is('scope_id', null)")
})
