import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

const profileFields = [
  'coaching_philosophy', 'specialties', 'age_groups', 'competition_levels', 'certifications',
  'coaching_experience_years', 'website_url', 'inquiry_url', 'availability_summary', 'achievements',
]

const independentFields = [
  'services', 'training_locations', 'remote_available', 'in_person_available', 'pricing_summary',
  'session_price_cents', 'group_session_price_cents', 'camp_price_cents', 'testimonials',
]

test('coach profile save accepts canonical fields and only writes provided keys', () => {
  const route = source('src/app/api/profile/save/route.ts')
  for (const field of [...profileFields, ...independentFields]) expect(route).toContain(`'${field}'`)
  expect(route).toContain('if (key in body) updates[key] = body[key]')
  expect(route).toContain('if (key in body) independentCoachUpdates[key] = body[key]')
  expect(route).toContain("from('independent_coach_profiles').update(patch)")
  expect(route).toContain("from('independent_coach_profiles').insert({ coach_id: userId, is_active: true, ...patch })")
})

test('web editor and public profile use the canonical coach fields', () => {
  const editor = source('src/app/coach/settings/page.tsx')
  const publicRoute = source('src/app/api/public/coaches/route.ts')
  const publicView = source('src/components/CoachPublicProfileView.tsx')
  for (const field of profileFields) {
    expect(editor).toContain(field)
    expect(publicRoute).toContain(field)
  }
  for (const field of independentFields) {
    expect(editor).toContain(field)
    expect(publicRoute).toContain(field)
  }
  expect(publicView).toContain('independent_profile')
  expect(editor).not.toContain('coach_profile_settings: profileSettings')
})
