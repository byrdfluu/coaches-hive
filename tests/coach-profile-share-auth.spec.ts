import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

test('shared coach profile links are public and legacy singular links remain compatible', () => {
  const routing = read('src/lib/appFirstRouting.ts')
  const middleware = read('src/middleware.ts')
  const legacyPage = read('src/app/coach/[slug]/page.tsx')

  expect(routing).toContain('isLegacyPublicCoachProfilePath')
  expect(routing).toContain('COACH_PORTAL_ROUTES')
  expect(middleware).toContain('!isLegacyCoachProfilePage')
  expect(legacyPage).toContain('redirect(destination)')
  expect(legacyPage).toContain('/coaches/')
})

test('sign in and signup preserve the coach profile return destination', () => {
  const profile = read('src/components/CoachPublicProfileView.tsx')
  const login = read('src/app/login/page.tsx')
  const signup = read('src/app/signup/page.tsx')
  const verify = read('src/app/auth/verify/page.tsx')
  const callback = read('src/app/auth/callback/route.ts')

  expect(profile).toContain('Sign in and return directly to this profile.')
  expect(profile).toContain('return_to: intendedReturn')
  expect(login).toContain('signupHref')
  expect(signup).toContain('pending_verification_return_to')
  expect(verify).toContain('window.location.replace(query.returnTo)')
  expect(callback).toContain('safeNext || roleToPath(role)')
})
