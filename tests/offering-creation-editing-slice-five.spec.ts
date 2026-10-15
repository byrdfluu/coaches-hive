import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { zonedLocalToIso } from '../src/lib/offeringTimezone'

const root=process.cwd()
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8')
const mobileMigration='/Users/juwan/Desktop/CH App/supabase/migrations/20261014170000_offering_creation_editing_ux.sql'

test('IANA conversion follows daylight-saving offsets',()=>{
 expect(zonedLocalToIso('2026-03-07','09:00','America/New_York')).toBe('2026-03-07T14:00:00.000Z')
 expect(zonedLocalToIso('2026-03-09','09:00','America/New_York')).toBe('2026-03-09T13:00:00.000Z')
})

test('creation and editing merge exact times and enforce the offering range',()=>{
 const create=read('src/app/org/offerings/new/page.tsx'),dates=read('src/app/org/offerings/[id]/dates/page.tsx'),api=read('src/app/api/org/offerings/route.ts')
 expect(create).toContain('zonedLocalToIso')
 expect(create).toContain('merged.some(existing=>existing.starts_at===row.starts_at&&existing.ends_at===row.ends_at)')
 expect(dates).toContain('Edit, exclude, or remove dates before saving')
 expect(api).toContain('Every date and time must be inside the offering date range.')
 expect(api).toContain("dateInTimezone(input.starts_at,timezone)")
})

test('schedule rules persist and display',()=>{
 const api=read('src/app/api/org/offerings/route.ts'),details=read('src/app/org/offerings/[id]/page.tsx')
 expect(api).toContain("from('org_offering_schedule_rules')")
 expect(api).toContain('row.schedule_rules=')
 expect(details).toContain('Schedule rules')
})

test('duplication delegates to the canonical draft-copy RPC',()=>{
 const api=read('src/app/api/org/offerings/route.ts'),details=read('src/app/org/offerings/[id]/page.tsx'),sql=fs.readFileSync(mobileMigration,'utf8')
 expect(api).toContain("rpc('duplicate_org_program_offering'")
 expect(details).toContain('Duplicate as Draft')
 expect(sql).toContain("'status','draft'")
 expect(sql).not.toContain('program_registrations')
})

test('details expose financial snapshots, occurrence selections, and canonical credit balances',()=>{
 const api=read('src/app/api/org/offerings/route.ts'),details=read('src/app/org/offerings/[id]/page.tsx')
 expect(api).toContain("from('org_offering_registration_occurrences')")
 expect(api).toContain("rpc('org_offering_eligible_credit_cycles'")
 expect(details).toContain('Family service fee')
 expect(details).toContain('Selected dates:')
 expect(details).toContain('available')
})

test('credit restoration is validated, scoped, and delegated to the canonical RPC',()=>{
 const api=read('src/app/api/org/offerings/route.ts'),details=read('src/app/org/offerings/[id]/page.tsx')
 expect(api).toContain("action==='restore_credits'")
 expect(api).toContain(".eq('org_id',orgId)")
 expect(api).toContain("rpc('restore_org_offering_credits'")
 expect(details).toContain('minLength={3}')
})

test('coach edits use the canonical diff and notification contract',()=>{
 const api=read('src/app/api/org/offerings/route.ts'),sql=fs.readFileSync(mobileMigration,'utf8')
 expect(api).toContain("rpc('set_org_program_coaches'")
 expect(sql).toContain('except select unnest(v_ids)')
 expect(sql).toContain('except select coach_id from public.org_program_coaches')
 expect(sql).toContain("'program_coach_assignment'")
 expect(sql).toContain("'program_coach_removed'")
})
