import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8')

test('athlete financial hub exposes equipment and travel obligations',()=>{
 const page=read('src/app/athlete/obligations/page.tsx')
 for(const contract of ['/api/mobile/equipment','/api/mobile/travel','/api/mobile/${kind}/${item.id}/intent'])expect(page).toContain(contract)
 expect(page).toContain('client_secret')
 expect(page).toContain('StripeCheckoutForm')
})

test('athlete financial hub exposes facility discovery checkout and cancellation',()=>{
 const page=read('src/app/athlete/obligations/page.tsx'),bookings=read('src/app/api/athlete/facility-bookings/route.ts')
 expect(page).toContain('/api/mobile/facilities')
 expect(page).toContain('/api/mobile/facilities/${space.id}/intent')
 expect(page).toContain('/api/mobile/facility-bookings/${id}/cancel')
 expect(bookings).toContain(".eq('booked_by_user_id', user.id)")
})

test('organization departure is preflighted and requested authoritatively',()=>{
 const page=read('src/app/athlete/obligations/page.tsx'),route=read('src/app/api/athlete/organization-departure/route.ts')
 expect(page).toContain('/api/athlete/organization-departure')
 expect(route).toContain('organizationDeparturePreflight')
 expect(route).toContain('request_athlete_leave_organization')
 expect(route).toContain('Resolve balances, recurring billing, and future registrations before leaving.')
})

test('canonical receipts are available in the athlete financial hub',()=>{
 const page=read('src/app/athlete/obligations/page.tsx')
 expect(page).toContain('/api/mobile/receipts')
 expect(page).toContain('Canonical receipts')
 expect(page).toContain('receipt_url')
})

test('review and profile browser state is account scoped',()=>{
 const dashboard=read('src/app/athlete/dashboard/page.tsx'),settings=read('src/app/athlete/settings/page.tsx'),profile=read('src/app/athlete/profile/page.tsx')
 expect(dashboard).toContain("accountScopedStorageKey('ch_reviewed_athlete_v1'")
 for(const key of ['ch_full_name','ch_main_athlete_label','ch_avatar_url'])expect(settings).toContain(`accountScopedStorageKey('${key}'`)
 expect(profile).toContain("accountScopedStorageKey('ch_avatar_url'")
 expect(profile).not.toContain("getItem('ch_avatar_url')")
})

test('marketplace local preferences are account scoped and cart has one source of truth',()=>{
 const marketplace=read('src/app/athlete/marketplace/page.tsx'),cart=read('src/app/athlete/marketplace/cart/page.tsx'),product=read('src/app/athlete/marketplace/product/[id]/page.tsx')
 expect(marketplace).toContain('accountScopedStorageKey(SEARCH_STORAGE_KEY,currentUserId)')
 expect(marketplace).toContain('accountScopedStorageKey(SAVED_STORAGE_KEY,currentUserId)')
 expect(product).toContain('accountScopedStorageKey(RECENT_STORAGE_KEY,currentUserId)')
 for(const source of [marketplace,cart,product]){
  expect(source).not.toContain('athlete-marketplace-cart')
  expect(source).not.toContain('storedCart')
 }
})

test('athlete navigation exposes obligations and facilities',()=>{
 const sidebar=read('src/components/AthleteSidebar.tsx')
 expect(sidebar).toContain("href: '/athlete/obligations'")
 expect(sidebar).toContain("'/athlete/obligations':'payments'")
})
