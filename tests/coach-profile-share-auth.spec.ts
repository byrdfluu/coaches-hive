import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

test('shared coach profile links are public and legacy singular links remain compatible', () => {
  const routing = read('src/lib/appFirstRouting.ts')
  const middleware = read('src/proxy.ts')
  const legacyPage = read('src/app/coach/[slug]/page.tsx')

  expect(routing).toContain('isLegacyPublicCoachProfilePath')
  expect(routing).toContain('COACH_PORTAL_ROUTES')
  expect(middleware).toContain('!isLegacyCoachProfilePage')
  expect(legacyPage).toContain('redirect(destination)')
  expect(legacyPage).toContain('/coaches/')
})

test('app handoff preserves the coach profile return destination', () => {
  const profile = read('src/components/CoachPublicProfileView.tsx')
  const login = read('src/app/login/page.tsx')
  const signup = read('src/app/signup/page.tsx')
  const verify = read('src/app/auth/verify/page.tsx')
  const callback = read('src/app/auth/callback/route.ts')

  expect(profile).toContain("reason: 'authentication_required'")
  expect(profile).toContain('from: intendedReturn')
  expect(login).not.toContain('signupHref')
  expect(signup).toContain('originalDestination')
  expect(verify).toContain('window.location.replace(query.returnTo)')
  expect(callback).toContain('safeNext || roleToPath(role)')
})
