import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

test('public organization API accepts UUID or name slug and disables caching', () => {
  const route = source('src/app/api/org/public/route.ts')
  expect(route).toContain('isUuid(identifier)')
  expect(route).toContain(".eq('id', identifier)")
  expect(route).toContain("slugify(row.name || '') === slugify(identifier)")
  expect(route).toContain("'Cache-Control': 'no-store")
  expect(route).toContain('export const revalidate = 0')
})

test('native organization profile tables are authoritative and roster identities stay private', () => {
  const route = source('src/app/api/org/public/route.ts')
  for (const table of ['org_settings','org_teams','org_team_coaches','athlete_organization_memberships','profile_gallery_images']) {
    expect(route).toContain(`from('${table}')`)
  }
  for (const field of ['director_display_name','profile_image_url','competition_levels','public_document_urls','active_athlete_count','coach_names']) {
    expect(route).toContain(field)
  }
  expect(route).toContain("select('id', { count: 'exact', head: true })")
  expect(route).not.toContain("from('athlete_profiles').select")
  expect(route).not.toContain("from('org_team_members')")
})

test('legacy portal preferences are fallback-only', () => {
  const route = source('src/app/api/org/public/route.ts')
  expect(route).toContain('legacyObject(preferences.public_profile)')
  expect(route).toContain('description: text((settings as any).description, legacy.mission)')
  expect(route.indexOf("'org_name','director_display_name','profile_image_url'")).toBeLessThan(route.indexOf('legacyObject(preferences.public_profile)'))
})
