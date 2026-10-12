import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const iosSource = (path: string) => readFileSync(resolve('/Users/juwan/Desktop/CH App', path), 'utf8')

test('league registrations and payments expose the same mutations as iOS', () => {
  const api = source('src/app/api/league/data/route.ts')
  const page = source('src/app/league/[section]/page.tsx')
  const registrations = iosSource('CH App/LeaguePortal/Registrations/LeagueRegistrationsView.swift')
  const payments = iosSource('CH App/LeaguePortal/Payments/LeaguePaymentsView.swift')
  const assignments = iosSource('CH App/LeaguePortal/Payments/LeagueFeeAssignmentSheet.swift')

  for (const status of ['pending', 'eligible', 'ineligible', 'waitlisted', 'withdrawn']) {
    expect(api).toContain(`'${status}'`)
    expect(registrations).toContain(`"${status}"`)
  }
  for (const action of ['update_registration_status', 'create_fee', 'assign_fee', 'waive_fee_assignment']) {
    expect(api).toContain(`action==='${action}'`)
    expect(page).toContain(`action:'${action}'`)
  }
  expect(api).toContain("loadStripeConnectAccountStatus('league',leagueId,{refresh:true})")
  expect(api).toContain('isStripeConnectEnabled(connect)')
  expect(payments).toContain('.from("league_fees")')
  expect(assignments).toContain('.from("league_fee_assignments")')
})

test('league API resolves athlete profile IDs instead of treating them as account IDs', () => {
  const api = source('src/app/api/league/data/route.ts')
  expect(api).toContain("supabaseAdmin.from('athlete_profiles').select('id,full_name,avatar_url')")
  expect(api).not.toContain("['user_id','athlete_id','submitted_by']")
  expect(api).toContain("fee:(fees||[]).find(f=>f.id===row.fee_id)")
})

test('league management endpoint rejects unauthenticated reads and mutations', async ({ request }) => {
  const read = await request.get('/api/league/data?resource=payments')
  expect(read.status()).toBe(401)
  const write = await request.post('/api/league/data', {
    data: { action: 'update_registration_status', registration_id: crypto.randomUUID(), status: 'eligible' },
  })
  expect(write.status()).toBe(401)
})
