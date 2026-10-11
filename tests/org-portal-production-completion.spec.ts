import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8')

test('calendar event and coach assignments save atomically',()=>{
 const sql=read('supabase/migrations/20261010160000_atomic_calendar_event_coach_save.sql')
 expect(sql).toContain('save_org_calendar_event_with_coaches')
 expect(sql).toContain('insert into org_calendar_event_coaches')
 expect(sql).toContain('coach_not_active_in_organization')
 for(const page of ['src/app/org/calendar/page.tsx','src/app/org/calendar-events/page.tsx']){
  const source=read(page)
  expect(source).toContain("rpc('save_org_calendar_event_with_coaches'")
  expect(source).not.toContain("rpc('set_org_calendar_event_coaches'")
 }
})

test('calendar team creation uses the durable organization team API',()=>{
 const page=read('src/app/org/calendar/page.tsx')
 expect(page).toContain("fetch('/api/org/teams'")
 expect(page).toContain("method:'POST'")
})

test('event collections require and authorize athlete assignments',()=>{
 const page=read('src/app/org/collections/page.tsx'),route=read('src/app/api/org/payment-events/route.ts')
 expect(page).toContain('player_ids:selected')
 expect(page).not.toContain('player_ids:[]')
 expect(route).toContain('Select at least one athlete')
 expect(route).toContain("from('athlete_organization_memberships')")
 expect(route).toContain("from('org_event_collections').delete()")
})

test('equipment and travel collection management share mobile authority',()=>{
 const page=read('src/app/org/collections/page.tsx'),contract=read('src/lib/orgPaymentCollections.ts'),charges=read('src/app/api/org/charges/route.ts')
 expect(page).toContain("equipment:'/api/mobile/org/equipment'")
 expect(page).toContain("travel:'/api/mobile/org/travel'")
 expect(page).toContain("insurance:'/api/org/charges'")
 expect(page).toContain("audience_type:'athlete'")
 expect(page).toContain('organizationWorkspaceHeaders')
 expect(page).toContain('player_ids:selected')
 expect(contract).toContain("from('athlete_organization_memberships')")
 expect(contract).toContain(".in('athlete_id', playerIds)")
 expect(charges).toContain("from('athlete_organization_memberships')")
 expect(charges).toContain('Every selected athlete must belong to this organization.')
 expect(charges).toContain("from('org_fees').delete()")
})

test('organization web exposes recurring offers and guarded leave-request review',()=>{
 const recurring=read('src/app/org/recurring-fees/page.tsx'),leaves=read('src/app/org/member-requests/page.tsx'),sidebar=read('src/components/OrgSidebar.tsx')
 expect(recurring).toContain('/api/mobile/org/recurring-fee-offers')
 expect(recurring).toContain('/assignments')
 expect(leaves).toContain('/leave-requests')
 expect(leaves).toContain("decision:'approve'|'decline'")
 expect(leaves).toContain('!preflight?.can_approve')
 expect(sidebar).toContain("'/org/recurring-fees'")
 expect(sidebar).toContain("'/org/member-requests'")
})

test('team coach invitation flow writes the authoritative join table',()=>{
 const page=read('src/app/org/teams/page.tsx')
 expect(page).toContain("from('org_team_coaches').upsert")
 expect(page).not.toContain("from('org_teams').update({ coach_id: coachId })")
})
