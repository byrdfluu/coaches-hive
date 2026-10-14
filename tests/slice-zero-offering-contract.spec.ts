import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { canManageProgramOfferings } from '../src/lib/offeringAuthorization'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('web uses the canonical offering RPC and parameter contract', () => {
  const route = read('src/app/api/org/offerings/route.ts')
  expect(route).toContain("rpc('create_org_program_offering_bundle'")
  for (const parameter of ['p_workspace_id','p_org_id','p_request_id','p_payload']) {
    expect(route).toContain(parameter)
  }
  expect(route).not.toContain("rpc('create_unified_org_offering'")
})

test('tryouts stay on the dedicated tryout contract', () => {
  const wizard = read('src/app/org/offerings/new/page.tsx')
  const route = read('src/app/api/org/offerings/route.ts')
  const tryouts = read('src/app/api/org/tryouts/route.ts')
  expect(wizard).toContain("'/org/tryouts?new=1'")
  expect(route).toContain("String(payload.type||'').trim().toLowerCase()==='tryout'")
  expect(route).toContain('Tryouts must use the tryout creation flow')
  expect(tryouts).toContain("rpc('org_mobile_save_tryout'")
  expect(tryouts).toContain("rpc('set_org_tryout_coaches'")
})

test('only organization admins and program directors manage programs', () => {
  expect(canManageProgramOfferings(['org_admin'])).toBe(true)
  expect(canManageProgramOfferings(['program_director'])).toBe(true)
  expect(canManageProgramOfferings(['coach'])).toBe(false)
  expect(canManageProgramOfferings(['team_manager'])).toBe(false)
})

test('wizard reuses one request ID for retry attempts', () => {
  const wizard = read('src/app/org/offerings/new/page.tsx')
  expect(wizard).toContain('requestId=useMemo(()=>crypto.randomUUID(),[])')
  expect(wizard).toContain("'Idempotency-Key':requestId")
  expect(wizard).toContain('request_id:requestId')
})
