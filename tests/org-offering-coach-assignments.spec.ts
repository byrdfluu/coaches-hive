import{test,expect}from'@playwright/test'
import{readFileSync}from'fs'
const read=(path:string)=>readFileSync(path,'utf8')
const sql=read('supabase/migrations/20261009070000_org_offering_coach_assignments.sql')

test('authoritative offering assignment schema and atomic RPCs cover every offering family',()=>{
 for(const table of['org_program_coaches','org_training_package_coaches','org_tryout_coaches','org_training_session_coaches'])expect(sql).toContain(table)
 for(const rpc of['set_org_program_coaches','set_org_training_package_coaches','set_org_tryout_coaches','set_org_training_session_coaches'])expect(sql).toContain(rpc)
 expect(sql).toContain("m.role in ('owner','org_admin'")
 expect(sql).toContain("'program_director'")
 expect(sql).toContain('coach_not_active_in_organization')
 expect(sql).not.toMatch(/update programs set coach_id/i)
})

test('assigned coaches receive scoped advance roster access',()=>{
 expect(sql).toContain('my_org_program_roster')
 expect(sql).toContain('my_org_tryout_roster')
 expect(sql).toContain('my_org_training_session_roster')
 expect(sql).toContain('program_roster_denied')
 expect(sql).toContain('tryout_roster_denied')
 expect(sql).toContain('training_session_roster_denied')
})

test('public coach projection excludes drafts and private profile fields',()=>{
 expect(sql).toContain('public_org_offering_coaches')
 expect(sql).toContain("is_public=true")
 expect(sql).toContain("p.status='published'")
 expect(sql).toContain("s.status='published'")
 const projection=sql.slice(sql.indexOf('create or replace function public.public_org_offering_coaches'))
 expect(projection).not.toContain('email')
 expect(projection).not.toContain('permissions')
})

test('web management and coach workspace use authoritative RPCs',()=>{
 const manager=read('src/app/org/offering-coaches/[kind]/[id]/page.tsx'),coach=read('src/app/coach/organization-assignments/page.tsx')
 for(const rpc of['set_org_program_coaches','set_org_training_package_coaches','set_org_tryout_coaches','set_org_training_session_coaches'])expect(manager).toContain(rpc)
 for(const rpc of['my_org_program_roster','my_org_tryout_roster','my_org_training_session_roster'])expect(coach).toContain(rpc)
 expect(manager).not.toMatch(/\.from\(source\.assignment\)\.delete|\.from\(source\.assignment\)\.insert/)
})

test('offering cards navigate and management actions live on detail pages',()=>{
 const cards=read('src/app/org/offering-coaches/page.tsx'),detail=read('src/app/org/offering-coaches/[kind]/[id]/page.tsx'),sessions=read('src/app/org/training-sessions/page.tsx')
 expect(cards).toContain('href={`/org/offering-coaches/${offering.kind}/${offering.id}`}')
 expect(cards).not.toContain('Save assigned coaches')
 expect(detail).toContain('Save assigned coaches')
 expect(sessions).toContain('href={`/org/training-sessions/${s.id}`}')
 expect(sessions).not.toContain('View roster</button>')
})

test('training session save is transactional and clears stale errors',()=>{
 const page=read('src/app/org/training-sessions/page.tsx'),detail=read('src/app/org/training-sessions/[id]/page.tsx'),sql=read('supabase/migrations/20261010150000_atomic_training_session_coach_save.sql')
 expect(page).toContain("setToast('')")
 expect(page).toContain('session and coach assignments')
 expect(detail).toContain('my_org_training_session_roster')
 expect(sql).toContain('save_org_training_sessions_with_coaches')
 expect(sql).toContain('for v_index in 0..v_count-1 loop')
})

test('family storefront emits the shared assigned coach contract',()=>{
 const storefront=read('src/app/api/mobile/family/storefront/route.ts')
 expect(storefront).toContain("rpc('public_org_offering_coaches'")
 expect(storefront).toContain('assigned_coaches:assignedCoachesFor(program.id)')
 expect(storefront).toContain('assigned_coaches:assignedCoachesFor(tryout.id)')
 expect(storefront).toContain('assigned_coaches:assignedCoachesFor(trainingPackage.id)')
 expect(storefront).toContain('assigned_coaches:assignedCoachesFor(occurrence.id)')
})
