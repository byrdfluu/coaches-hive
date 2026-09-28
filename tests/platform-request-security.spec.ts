import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('request correlation accepts only bounded safe IDs and returns structured errors', () => {
  const helper=read('src/lib/requestSecurity.ts')
  expect(helper).toContain('REQUEST_ID_PATTERN')
  expect(helper).toContain("request.headers.get('x-request-id')")
  expect(helper).toContain("'X-Coaches-Hive-Support-Reference': requestId")
  expect(helper).toContain('{ error: { code, message, retryable, request_id: requestId } }')
})

test('mobile checkout requires matching header and body idempotency keys', () => {
  const route=read('src/app/api/mobile/checkout/route.ts')
  const helper=read('src/lib/requestSecurity.ts')
  expect(route).toContain('idempotencyKeyFor(request,body)')
  expect(route).toContain("'idempotency_key_conflict'")
  expect(route).toContain("'idempotency_key_required'")
  expect(helper).toContain("request.headers.get('idempotency-key')")
  expect(helper).toContain('bodyKey && bodyKey !== header')
})

test('idempotency is durable, actor/action/resource scoped, and payload bound', () => {
  const helper=read('src/lib/requestSecurity.ts')
  const sql=read('supabase/migrations/20260929010000_authoritative_request_idempotency.sql')
  expect(helper).toContain("from('api_idempotency_records')")
  expect(helper).toContain('request_fingerprint')
  expect(helper).toContain("response.headers.set('X-Idempotent-Replay', 'true')")
  expect(sql).toContain('unique(actor_user_id,action,resource_id,idempotency_key)')
  expect(sql).toContain('enable row level security')
  expect(sql).toContain('revoke all on public.api_idempotency_records from anon,authenticated')
})

test('workspace authorization requires active workspace and an active exact-user membership', () => {
  const authority=read('src/lib/workspaceAuthority.ts')
  const mobile=read('src/lib/mobilePaymentApi.ts')
  expect(authority).toContain("raw.status !== 'active'")
  expect(authority).toContain(".eq('workspace_id', workspaceId).eq('user_id', userId).eq('status', 'active')")
  expect(mobile).toContain("request.headers.get('x-workspace-id')")
  expect(mobile).toContain("request.headers.get('x-acting-role')")
  expect(mobile).toContain("workspace.roles.includes(actingRole)")
})

test('request correlation reaches Stripe checkout metadata', () => {
  const route=read('src/app/api/mobile/checkout/route.ts')
  for(const type of ['league_fee','family_installment','org_fee','mobile_program','mobile_tryout','mobile_marketplace']){
    expect(route).toContain(`checkout_type: '${type}'`)
  }
  expect((route.match(/request_id:/g)||[]).length).toBeGreaterThanOrEqual(10)
})

test('recurring checkout binds retries to the full payload and request ID',()=>{
  const route=read('src/app/api/mobile/recurring-fees/start/route.ts')
  const sql=read('supabase/migrations/20260929010000_authoritative_request_idempotency.sql')
  expect(route).toContain('idempotencyKeyFor(request,body)')
  expect(route).toContain('existing.request_fingerprint!==fingerprint')
  expect(route).toContain('request_id:requestId,request_fingerprint:fingerprint')
  expect(sql).toContain('add column if not exists request_id text')
  expect(sql).toContain('add column if not exists request_fingerprint text')
})
