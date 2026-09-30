import { expect, test } from '@playwright/test'
import fs from 'node:fs'

const read = (path: string) => fs.readFileSync(path, 'utf8')

test('mobile organization writes remain tenant-scoped during API migration', () => {
  const migration = read('supabase/migrations/20260930020000_mobile_org_write_compatibility.sql')
  const feeRoute = read('src/app/api/org/charges/route.ts')
  expect(migration).toContain('normalize_org_fee_title')
  expect(migration).toContain("m.org_id=org_tryouts.org_id")
  expect(migration).toContain("m.status='active'")
  expect(migration).toContain('create_org_document_with_targets')
  expect(migration).toContain('A selected team does not belong to this organization')
  expect(migration).toContain('A selected athlete does not belong to this organization')
  expect(migration).toContain("workspace_type='organization'")
  expect(migration).toContain("notify pgrst,'reload schema'")
  expect(feeRoute).toContain('body?.title || body?.name')
})

test('acting role validation normalizes aliases but still checks active membership roles', () => {
  const authority = read('src/lib/workspaceAuthority.ts')
  const payments = read('src/lib/mobilePaymentApi.ts')
  const links = read('src/lib/staffFeePaymentLinks.ts')
  expect(authority).toContain('normalizeWorkspaceRole')
  expect(authority).toContain("organization_admin: 'org_admin'")
  expect(payments).toContain('activeWorkspaceRole(workspace')
  expect(links).toContain('activeWorkspaceRole(workspace')
  expect(payments).not.toContain('workspace.roles.includes(actingRole)')
})

test('coach document requests use their dedicated durable path', () => {
  const organization = read('src/app/api/org/coach-documents/route.ts')
  const coach = read('src/app/api/coach/documents/route.ts')
  const migration = read('supabase/migrations/20260906030000_coach_document_exchange_and_accountability.sql')
  expect(organization).toContain("from('coach_document_requests').insert")
  expect(coach).toContain("from('coach_document_submissions').insert")
  expect(migration).toContain('review_coach_document_request')
  expect(organization).not.toContain('create_org_document_with_targets')
  expect(coach).not.toContain('create_org_document_with_targets')
})
