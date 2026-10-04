import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const source=(file:string)=>fs.readFileSync(path.join(root,file),'utf8')

test('user deletion preview is audited and blocks protected records',()=>{
  const code=source('src/app/api/admin/users/deletion-preview/route.ts')
  expect(code).toContain('requireSuperadminApi(request)')
  expect(code).toContain("action:'admin.user.deletion_preview'")
  for(const field of ['can_delete','recommended_action','owned_workspaces','athlete_profiles','financial_records','subscriptions','stripe_connect_accounts','refunds','signed_documents','blocking_reasons'])expect(code).toContain(field)
})

test('ownership transfer is reason-required and database-audited',()=>{
  const route=source('src/app/api/admin/workspaces/transfer-ownership/route.ts')
  const migration=source('supabase/migrations/20261003060000_superadmin_mobile_hardening_contracts.sql')
  expect(route).toContain('p_reason:reason')
  expect(migration).toContain('admin_transfer_workspace_ownership')
  expect(migration).toContain("nullif(trim(p_reason),'')")
  expect(migration).toContain('workspace_audit_events')
  expect(migration).toContain('admin_audit_log')
})

test('failure feed preserves old fields and appends mobile diagnostics',()=>{
  const migration=source('supabase/migrations/20261003060000_superadmin_mobile_hardening_contracts.sql')
  for(const field of ['event_id','source','event_type','status','error_detail','occurred_at','workspace_id','request_id','error_code','route','http_status','retryable','app_version','build_number'])expect(migration).toContain(field)
})

test('storefront preview reuses the authoritative family storefront implementation',()=>{
  const preview=source('src/app/api/admin/storefront-preview/route.ts')
  const storefront=source('src/app/api/mobile/family/storefront/route.ts')
  expect(preview).toContain('familyStorefrontResponse')
  expect(preview).toContain('trustedAdminPreview:true')
  expect(storefront).toContain('export async function familyStorefrontResponse')
  expect(storefront).toContain('return familyStorefrontResponse(request)')
})

test('diagnostic feeds are read-only and bearer-compatible',()=>{
  for(const file of ['family-relationships','offering-integrity','release-health']){
    const code=source(`src/app/api/admin/${file}/route.ts`)
    expect(code).toContain('requireSuperadminApi(request)')
    expect(code).not.toContain('export async function POST')
    expect(code).not.toContain('.update(')
    expect(code).not.toContain('.delete(')
  }
  expect(source('src/lib/adminApiAuth.ts')).toContain('getMobileRequestUser(request)')
})
