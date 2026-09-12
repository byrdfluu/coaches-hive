import { expect,test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8')

test.describe('league web parity foundation',()=>{
  test('uses assigned league memberships for role and workspace switching',()=>{
    expect(read('src/app/api/roles/available/route.ts')).toContain("from('league_memberships')")
    expect(read('src/app/api/workspaces/active/route.ts')).toContain("eq('user_id',session.user.id)")
    expect(read('src/app/api/workspaces/active/route.ts')).toContain("eq('status','active')")
  })
  test('wires the authoritative governance RPCs behind superadmin authorization and audit',()=>{
    const route=read('src/app/api/admin/governance/route.ts')
    expect(route).toContain("rpc('admin_governance_snapshot')")
    expect(route).toContain("rpc('admin_retry_slack_events')")
    expect(route).toContain('requireSuperadminApi')
    expect(route).toContain('logAdminAction')
  })
  test('provides a league director dashboard scoped to explicit membership',()=>{
    const page=read('src/app/league/page.tsx')
    expect(page).toContain("from('league_memberships')")
    expect(page).toContain("eq('user_id', session.user.id)")
    expect(page).toContain('League Director Portal')
    expect(page).toContain('max_teams')
  })
  test('provides named league sections and cross-portal participation without public athlete data',()=>{
    const dataRoute=read('src/app/api/league/data/route.ts')
    expect(dataRoute).toContain("from('profiles').select('id,full_name,avatar_url')")
    expect(read('src/app/league/[section]/page.tsx')).toContain('Schedule, standings & results')
    expect(read('src/app/org/page.tsx')).toContain('LeagueParticipationCard')
    expect(read('src/app/coach/orgs-teams/page.tsx')).toContain('LeagueParticipationCard')
    expect(read('src/app/athlete/orgs-teams/page.tsx')).toContain('LeagueParticipationCard')
    expect(read('src/app/api/league/participation/route.ts')).toContain("if(!session?.user)")
  })
})
