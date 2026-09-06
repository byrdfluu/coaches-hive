import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

test('coach and organization shares use permanent IDs', () => {
  expect(source('src/app/coach/dashboard/page.tsx')).toContain('currentUserId || coachSlug')
  expect(source('src/app/coach/settings/page.tsx')).toContain('coachProfileId || fullName')
  expect(source('src/app/org/page.tsx')).toContain('orgId || orgSlug')
  expect(source('src/app/org/settings/page.tsx')).toContain('orgId || profileSlug')
})

test('coach and organization profiles publish social preview metadata', () => {
  for (const file of ['src/app/coaches/[slug]/layout.tsx', 'src/app/organizations/[slug]/layout.tsx']) {
    const content = source(file)
    expect(content).toContain('generateMetadata')
    expect(content).toContain('openGraph')
    expect(content).toContain('twitter')
    expect(content).toContain('alternates')
  }
})

test('public profile APIs enforce privacy and omit private contact data', () => {
  const coach = source('src/app/api/public/coaches/route.ts')
  const org = source('src/app/api/org/public/route.ts')
  expect(coach).toContain("matchedProfile ? 'private' : 'not_found'")
  expect(org).toContain("unavailable_reason: 'private'")
  expect(org).not.toContain('primary_contact_email:')
  expect(org).not.toContain('public_phone:')
})

test('profile links track conversion actions, preserve intent, and expose app links', () => {
  const coach = source('src/components/CoachPublicProfileView.tsx')
  const org = source('src/app/organizations/[slug]/page.tsx')
  const signup = source('src/app/signup/page.tsx')
  for (const content of [coach, org]) {
    expect(content).toContain('public_profile_opened')
    expect(content).toContain('public_profile_action_clicked')
    expect(content).toContain('coacheshive://open')
    expect(content).toContain('intent=')
  }
  expect(signup).toContain('intended_action')
  expect(source('src/app/.well-known/apple-app-site-association/route.ts')).toContain("'/': '/coaches/*'")
})
