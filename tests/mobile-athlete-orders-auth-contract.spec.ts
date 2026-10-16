import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/athlete/orders/route.ts'), 'utf8')

test('athlete orders accepts the shared mobile bearer-token authentication contract', () => {
  expect(source).toContain("getMobileRequestUser(request)")
  expect(source).not.toContain("getSessionRole(['athlete', 'admin'])")
  expect(source).toContain("code: 'AUTHENTICATION_REQUIRED'")
  expect(source).toContain("message: 'A valid mobile access token is required.'")
  expect(source).toContain('{ status: 401 }')
})

test('athlete orders scopes canonical purchases to the authenticated user', () => {
  expect(source).toContain(".eq('buyer_id', user.id)")
  expect(source).not.toMatch(/searchParams\.get\(['\"]user_id/)
})

test('requested athlete profiles require a server-verified family relationship', () => {
  expect(source).toContain('resolveAuthorizedAthleteContext(user.id, requestedAthleteProfileId)')
  expect(source).toContain("code: 'ATHLETE_PROFILE_UNAVAILABLE'")
  expect(source).toContain(".eq('owner_user_id', user.id)")
})

test('legacy orders are limited to authenticated and authorized athlete identities', () => {
  expect(source).toContain(".in('athlete_id', athleteIds)")
  expect(source).toContain('Array.from(new Set(authorizedAthleteIds))')
})
