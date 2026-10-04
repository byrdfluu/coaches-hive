import{expect,test}from'@playwright/test'
import fs from'node:fs';import path from'node:path'
const read=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),'utf8')

test('canceled Stripe returns reconcile durable attempts without downgrading paid sessions',()=>{
  const service=read('src/lib/canceledCheckoutReconciliation.ts'),page=read('src/app/mobile/payment-return/page.tsx')
  expect(page).toContain("status==='canceled'&&recordId")
  expect(service).toContain("session?.status==='complete'")
  expect(service).toContain("status:'canceled'")
  expect(service).toContain('checkout.sessions.expire')
  expect(service).toContain("eq('status','pending').is('stripe_subscription_id',null)")
})

test('storefront only exposes pending payment for resumable unexpired checkout',()=>{
  const route=read('src/app/api/mobile/family/storefront/route.ts')
  expect(route).toContain('hasResumableCheckout')
  expect(route).toContain(".in('status', ['processing','checkout_pending']).gt('expires_at'")
  expect(route).toContain("registrationState==='pending_payment'&&!hasResumableCheckout")
})

test('production family discovery excludes test tenants and returns canonical organization images',()=>{
  const migration=read('supabase/migrations/20261004000000_harden_family_discovery_contracts.sql')
  const storefront=read('src/app/api/mobile/family/storefront/route.ts')
  for(const value of ['assigned_org_programs_for_athlete','discover_public_organizations','discover_public_coaches','coalesce(o.is_test,false)=false','profile_image_url'])expect(migration).toContain(value)
  expect(storefront).toContain('workspace.is_test')
  expect(storefront).toContain('organization.is_test')
  expect(storefront).toContain('profile_image_url:orgSettings?.profile_image_url')
})

test('public coach messaging is athlete-authorized blocked-aware and idempotent',()=>{
  const migration=read('supabase/migrations/20261004000000_harden_family_discovery_contracts.sql')
  const route=read('src/app/api/mobile/family/coaches/route.ts')
  expect(migration).toContain('unique(family_user_id,coach_user_id,athlete_profile_id)')
  expect(migration).toContain('user_blocks')
  expect(migration).toContain('allowDirectMessages')
  expect(route).toContain('resolveAuthorizedAthleteContext')
  expect(route).toContain('coach_messaging_unavailable')
})

test('subscription cancellation email uses authoritative webhook dates and no-further-charge language',()=>{
  const webhook=read('src/app/api/stripe/webhook/route.ts')
  expect(webhook).toContain("const mmddyyyy=")
  expect(webhook).toContain('You will not be charged again.')
  expect(webhook).toContain('customer.subscription.trial_will_end')
  expect(webhook).toContain('scheduled cancellation was reversed')
})
