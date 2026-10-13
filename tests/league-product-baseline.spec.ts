import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('web carries the shared league product baseline', () => {
  const migration = source('supabase/migrations/20261013090000_league_product_baseline.sql')
  for (const table of ['league_competitions', 'league_discounts', 'league_discount_redemptions', 'league_venue_fields', 'league_bracket_entries']) {
    expect(migration).toContain(`public.${table}`)
  }
  for (const rpc of ['submit_league_registration', 'apply_league_discount', 'set_league_registration_lifecycle']) {
    expect(migration).toContain(`public.${rpc}`)
  }
  expect(migration).toContain('league_registration_exact_unique')
  expect(migration).toContain("registration_type in ('individual','team','free_agent')")
})

test('league registration lifecycle mutations use the authoritative RPC', () => {
  const route = source('src/app/api/league/data/route.ts')
  const lifecycleBlock = route.slice(route.indexOf("if(action==='update_registration_status')"), route.indexOf("if(action==='create_fee')"))
  expect(lifecycleBlock).toContain("rpc('set_league_registration_lifecycle'")
  expect(lifecycleBlock).not.toContain("from('league_registrations').update")
  for (const status of ['draft', 'provisional', 'submitted', 'registered', 'approved', 'pending', 'eligible', 'ineligible', 'waitlisted', 'withdrawn', 'suspended']) {
    expect(lifecycleBlock).toContain(`'${status}'`)
  }
})

test('organization coach and family portals share the league lifecycle contract', () => {
  const api = source('src/app/api/league/lifecycle/route.ts')
  const workspace = source('src/components/LeagueParticipationWorkspace.tsx')
  for (const rpc of ['submit_league_registration', 'apply_league_discount', 'league_scoped_standings']) {
    expect(api).toContain(`rpc('${rpc}'`)
  }
  for (const route of ['src/app/org/league/page.tsx', 'src/app/coach/league/page.tsx', 'src/app/athlete/league/page.tsx']) {
    expect(source(route)).toContain('LeagueParticipationWorkspace')
  }
  expect(api).toContain('resolveAuthorizedAthleteContext')
  expect(api).toContain("from('org_team_coaches')")
  expect(workspace).toContain("action: 'submit_registration'")
  expect(workspace).toContain("action: 'apply_discount'")
  expect(workspace).toContain('parking_instructions')
  expect(workspace).toContain("type: 'league_fee'")
  expect(workspace).not.toContain('storage_path')
})

test('league administration exposes competition discount and bracket sections', () => {
  const route = source('src/app/api/league/data/route.ts')
  const page = source('src/app/league/[section]/page.tsx')
  for (const resource of ['competitions', 'discounts', 'brackets']) {
    expect(route).toContain(`${resource}:`)
    expect(page).toContain(`'${resource}'`)
  }
  expect(route).toContain("action==='create_competition'")
  expect(route).toContain("action==='create_discount'")
})

test('registration billing remains linked to the existing Stripe league fee ledger', () => {
  const migration = source('supabase/migrations/20261013091000_link_league_registration_billing.sql')
  const lifecycle = source('src/app/api/league/lifecycle/route.ts')
  expect(migration).toContain('registration_id uuid references public.league_registrations')
  expect(migration).toContain('sync_league_registration_fee_assignment')
  expect(lifecycle).toContain("from('league_fee_assignments').upsert")
  expect(lifecycle).toContain("from('league_fee_assignments').select")
  expect(lifecycle).toContain('participation_allowed')
  expect(lifecycle).toContain('missing_requirements')
})

test('sensitive league files are signed only for document managers', () => {
  const route = source('src/app/api/league/data/route.ts')
  expect(route).toContain("(resource==='documents'||resource==='submissions')&&canManageResource")
  expect(source('src/app/api/league/lifecycle/route.ts')).not.toContain('createSignedUrl')
})
