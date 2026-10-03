import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { formatUsPhone } from '../src/lib/phone'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('common U.S. phone entry styles share one canonical display format', () => {
  for (const value of ['9199876632', '919-987-6632', '(919) 987-6632', '919.987.6632', '+1 919 987 6632']) {
    expect(formatUsPhone(value)).toBe('(919) 987-6632')
  }
  expect(formatUsPhone('919987')).toBeNull()
  expect(formatUsPhone('')).toBeNull()
})

test('guardian and emergency-contact writes normalize and safely validate phones', () => {
  expect(read('src/app/api/profile/save/route.ts')).toContain('formatUsPhone(updates.guardian_phone)')
  expect(read('src/app/api/emergency-contacts/route.ts')).toContain('phone: formatUsPhone(contact?.phone)')
  expect(read('src/app/api/onboarding/profile/route.ts')).toContain('phone: contactPhone')
})

test('database normalization protects direct mobile profile writes', () => {
  const migration = read('supabase/migrations/20261003040000_normalize_family_phone_numbers.sql')
  expect(migration).toContain('before insert or update of guardian_phone on public.profiles')
  expect(migration).toContain('before insert or update of phone on public.emergency_contacts')
  expect(migration).toContain("return '(' || left(digits, 3) || ') '")
})
