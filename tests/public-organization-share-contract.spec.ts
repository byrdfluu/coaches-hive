import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('organization shares resolve organization and workspace UUIDs through shared Supabase records', () => {
  const resolver = source('src/lib/publicOrganizationResolver.ts')
  expect(resolver).toContain(".from('organizations')")
  expect(resolver).toContain(".from('org_settings')")
  expect(resolver).toContain(".from('business_workspaces')")
  expect(resolver).toContain(".eq('id', identifier)")
  expect(resolver).toContain(".eq('organization_id', identifier)")
  expect(resolver).toContain('hasConfirmedActiveState')
})

test('public organization endpoint honors active and explicitly private states', () => {
  const endpoint = source('src/app/api/org/public/route.ts')
  expect(endpoint).toContain('resolvePublicOrganization(identifier)')
  expect(endpoint).toContain("organization.status !== 'active'")
  expect(endpoint).toContain("unavailable_reason: 'private'")
  expect(endpoint).toContain('const galleryRows = galleryResult.error ? []')
  expect(endpoint).toContain("formsResult.error?.code === '42703'")
})

test('public profile provides download and support actions without duplicate app handoffs', () => {
  const page = source('src/app/organizations/[slug]/page.tsx')
  expect(page).toContain('Download the app')
  expect(page).toContain('Contact Coaches Hive')
  expect(page).not.toContain('Open in Coaches Hive')
  expect(page).not.toContain('OpenAppButton')
  expect(page).not.toContain('Connect with {org.name}')
  expect(page).not.toContain("Join {org?.name")
  expect(page).not.toContain('fixed bottom-0')
  expect(page).not.toContain('h-48 w-full bg-cover bg-center')
  expect(page).toContain('This organization profile is temporarily unavailable. Please try again or browse other organizations.')
  expect(page).not.toContain('organization may no longer be active')
})

test('production association file covers permanent organization profile links', () => {
  expect(source('src/app/.well-known/apple-app-site-association/route.ts')).toContain("{ '/': '/organizations/*'")
})
