import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8')
const migration=fs.readFileSync('/Users/juwan/Desktop/CH App/supabase/migrations/20261014180000_calendar_and_notifications.sql','utf8')

test('family calendar uses the canonical program and tryout projection',()=>{
 const route=read('src/app/api/athlete/offering-schedule/route.ts'),panel=read('src/components/OfferingSchedulePanel.tsx')
 expect(route).toContain("rpc('family_offering_calendar'")
 expect(route).toContain('occurrence_id:row.occurrence_id')
 expect(panel).toContain('key={row.occurrence_id||row.id}')
 expect(migration).toContain("select o.id,'program'")
 expect(migration).toContain("select o.id,'tryout'")
})

test('all canonical payment-label variants are returned and rendered verbatim',()=>{
 for(const label of ["'Free'","'1 credit used'","' per date'","'Included in full registration'"])expect(migration).toContain(label)
 expect(read('src/components/OfferingSchedulePanel.tsx')).toContain('row.payment_label')
})

test('occurrence editing preserves stable IDs and surfaces RPC errors',()=>{
 const api=read('src/app/api/org/offerings/route.ts'),page=read('src/app/org/offerings/[id]/dates/page.tsx')
 expect(api).toContain("rpc('save_org_offering_occurrence'")
 expect(api).toContain('p_occurrence_id:parseUuid(input.id)')
 expect(api).toContain('error:error.message')
 expect(page).toContain('id:row.id')
 expect(page).toContain('await load()')
})

test('safe removal distinguishes draft deletion, cancellation, and missing',()=>{
 const api=read('src/app/api/org/offerings/route.ts'),page=read('src/app/org/offerings/[id]/dates/page.tsx')
 expect(api).toContain("rpc('remove_org_offering_occurrence'")
 expect(page).toContain("?'Delete':'Cancel'")
 expect(page).toContain("payload.result==='deleted'")
 expect(page).toContain("payload.result==='cancelled'")
 expect(migration).toContain("return 'missing'")
 expect(migration).toContain("return 'deleted'")
 expect(migration).toContain("return 'cancelled'")
})

test('registered cancellation retains history and database-owned restoration',()=>{
 expect(migration).toContain("set status='cancelled'")
 expect(migration).toContain("'academy_cancellation'")
 expect(migration).not.toContain('delete from public.program_registrations')
 const page=read('src/app/org/offerings/[id]/dates/page.tsx')
 expect(page).toContain('row.cancellation_reason')
 expect(page).toContain('calendar_revision')
})

test('notification UI supports lifecycle destinations without creating notifications',()=>{
 const panel=read('src/components/NotificationsPanel.tsx')
 for(const type of ['offering_changed','offering_cancelled','program_coach_assignment','program_coach_removed','tryout_coach_assignment','tryout_coach_removed'])expect(panel).toContain(type)
 expect(panel).toContain('item.data?.app_destination')
 expect(panel).toContain('item.action_url')
 expect(panel).not.toContain("from('notifications').insert")
})

test('database notification deduplication and retries are stable',()=>{
 expect(migration).toContain("p_event||':'||o.id::text||':'||p_revision::text")
 expect(migration).toContain("'program-coach-added:'||p_program_id::text||':'||v_id::text")
 expect(migration).toContain("'program-coach-removed:'||p_program_id::text||':'||v_id::text")
 expect(migration).toContain("'tryout-coach-added:'||p_tryout_id::text||':'||v_id::text")
 expect(migration).toContain("'tryout-coach-removed:'||p_tryout_id::text||':'||v_id::text")
})

test('mutation controls prevent double submission',()=>{
 const page=read('src/app/org/offerings/[id]/dates/page.tsx')
 expect(page).toContain('if(mutating)return')
 expect(page).toContain('disabled={Boolean(mutating)}')
 expect(page).toContain("setMutating(row.id)")
})
