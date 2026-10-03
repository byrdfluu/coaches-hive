import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),'utf8')

test('published and directly assigned organization fees share one storefront contract',()=>{
  const route=read('src/app/api/mobile/family/storefront/route.ts')
  expect(route).toContain("eq('publication_status', 'published')")
  expect(route).toContain("offering_type:'organization_fee'")
  expect(route).toContain('checkout_record_id:row?.id||null')
  expect(route).toContain('new Map<string,{fee:any;assignment:any}>()')
  expect(route).toContain("row?.status==='partial'?'pending_payment':'available'")
  expect(route).toContain("!['purchased','processing','refunded','canceled'].includes(feeStatus)")
})

test('unassigned published fee preparation creates an assignment before checkout',()=>{
  const route=read('src/app/api/mobile/family/offerings/prepare/route.ts')
  expect(route).toContain("offeringType === 'organization_fee'")
  expect(route).toContain("rpc('prepare_published_org_fee_assignment'")
  expect(route).toContain("type: input.offeringType === 'organization_fee' ? 'fee'")
})

test('fee publication is opt-in and self-service assignment is tenant safe',()=>{
  const migration=read('supabase/migrations/20261002090000_publishable_organization_fees.sql')
  expect(migration).toContain("publication_status text not null default 'draft'")
  expect(migration).toContain('pg_advisory_xact_lock')
  expect(migration).toContain('athlete_organization_memberships')
  expect(migration).toContain("v_fee.audience_type not in ('all','team')")
  expect(migration).toContain("grant execute on function public.prepare_published_org_fee_assignment")
})

test('expired fee checkout sessions are cleared instead of reused',()=>{
  const checkout=read('src/app/api/mobile/checkout/route.ts')
  expect(checkout).toContain("staleSession?.status === 'expired'")
  expect(checkout).toContain("stripe_checkout_session_id:null")
})
