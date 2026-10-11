import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8')

test('marketplace never substitutes fake demand signals',()=>{
 const page=read('src/app/coach/marketplace/page.tsx')
 for(const fake of ['Speed mechanics','Return-to-play','Strength plans','Remote video review','Team packages','Weekly check-ins'])expect(page).not.toContain(fake)
 expect(page).toContain('No current demand signals have been recorded.')
 expect(page).toContain('Demand data is temporarily unavailable.')
})

test('organization assignments use a canonical paginated server projection',()=>{
 const page=read('src/app/coach/organization-assignments/page.tsx'),route=read('src/app/api/coach/organization-assignments/route.ts')
 expect(page).toContain('/api/coach/organization-assignments?limit=20')
 expect(page).not.toContain("supabase.from(config.join)")
 expect(route).toContain('next_cursor')
 expect(route).toContain('Organization assignments are temporarily unavailable.')
 for(const table of ['org_program_coaches','org_tryout_coaches','org_training_package_coaches','org_training_session_coaches','org_calendar_event_coaches'])expect(route).toContain(table)
})

test('coach bookings expose authoritative rescheduling',()=>{
 const page=read('src/app/coach/bookings/page.tsx')
 expect(page).toContain('/api/mobile/bookings/${rescheduleTarget.id}/reschedule')
 expect(page).toContain('duration_minutes')
 expect(page).toContain('Save new time')
})

test('coach assignment operations expose scoped occurrence cancellation',()=>{
 const page=read('src/app/coach/organization-assignments/page.tsx')
 expect(page).toContain('/api/mobile/org/training-occurrences/${cancel.item.id}/cancel')
 expect(page).toContain("'occurrence'|'future'|'series'")
 expect(page).toContain('Required reason')
 expect(page).toContain('refunds')
})

test('coach messages expose authoritative advanced thread controls',()=>{
 const page=read('src/app/coach/messages/page.tsx')
 for(const contract of ['/participants','/presence','/settings','/pin','/leave'])expect(page).toContain(contract)
 expect(page).toContain('notification_level')
 expect(page).toContain('addThreadParticipant')
 expect(page).toContain('removeThreadParticipant')
 expect(page).toContain('Leave conversation')
 expect(page).toContain('detailAttachments')
})
