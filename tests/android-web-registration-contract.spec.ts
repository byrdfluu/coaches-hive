import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('routes Android app calls to the public web registration flow', () => {
  const button = source('src/components/GetTheAppButton.tsx')
  const profile = source('src/app/organizations/[slug]/page.tsx')
  expect(button).toContain('/Android/i')
  expect(button).toContain("device === 'android'")
  expect(button).toContain('window.location.assign(androidHref)')
  expect(profile).toContain('androidHref={`${publicProfilePath}#registration`}')
  expect(profile).toContain('id="registration"')
})

test('keeps iPhone and iPad app calls pointed at the Apple listing', () => {
  const button = source('src/components/GetTheAppButton.tsx')
  const registration = source('src/components/DeviceAwareRegistrationLink.tsx')
  const profile = source('src/app/organizations/[slug]/page.tsx')
  expect(button).toContain('/iPhone|iPad|iPod/i')
  expect(button).toContain("device === 'ios'")
  expect(button).toContain('window.location.assign(APP_STORE_URL)')
  expect(registration).toContain('/iPhone|iPad|iPod/i')
  expect(registration).toContain('setHref(APP_STORE_URL)')
  expect(registration).toContain('Download the app to register')
  expect(profile).toContain('DeviceAwareRegistrationLink')
})

test('ships the minimum installable PWA surface', () => {
  const manifest = source('src/app/manifest.ts')
  const layout = source('src/app/layout.tsx')
  const registrar = source('src/components/PwaRegistrar.tsx')
  const worker = source('public/sw.js')
  expect(manifest).toContain("display: 'standalone'")
  expect(manifest).toContain("start_url: '/organizations?source=pwa'")
  expect(layout).toContain('<PwaRegistrar />')
  expect(registrar).toContain("register('/sw.js')")
  expect(worker).toContain("const OFFLINE_URL = '/offline'")
})

test('public enrollment renders and server-validates full waivers', () => {
  const page = source('src/app/enroll/[slug]/page.tsx')
  const route = source('src/app/api/enroll/[slug]/route.ts')
  expect(page).toContain('waiver.body')
  expect(page).toContain('waiver_signer_name')
  expect(route).toContain(".from('org_waivers')")
  expect(route).toContain('Every required waiver must be reviewed and accepted')
  expect(route).toContain("tag: 'registration_confirmation'")
})

test('organizations configure private parent document requirements', () => {
  const orgPage = source('src/app/org/enrollment/page.tsx')
  const publicPage = source('src/app/enroll/[slug]/page.tsx')
  const uploadRoute = source('src/app/api/enroll/[slug]/documents/route.ts')
  const submitRoute = source('src/app/api/enroll/[slug]/route.ts')
  const migration = source('supabase/migrations/20260921010000_public_registration_documents.sql')
  expect(orgPage).toContain('Required parent documents')
  expect(orgPage).toContain('Save requirements')
  expect(publicPage).toContain('Registration documents')
  expect(publicPage).toContain('document_uploads: Object.values(documentUploads)')
  expect(uploadRoute).toContain("from('registration-documents').upload")
  expect(submitRoute).toContain('Upload every required registration document before continuing')
  expect(migration).toContain('org_enrollment_document_uploads')
  expect(migration).toContain("'registration-documents'")
})

test('public registrations include schedules, guardian decisions, and passwordless return access', () => {
  const publicApi = source('src/app/api/org/public/route.ts')
  const profile = source('src/app/organizations/[slug]/page.tsx')
  const enrollApi = source('src/app/api/enroll/[slug]/route.ts')
  const accessApi = source('src/app/api/registrations/access/route.ts')
  const accessPage = source('src/app/registrations/access/RegistrationAccessClient.tsx')
  expect(publicApi).toContain(".from('sessions')")
  expect(profile).toContain('Camps, practices and availability')
  expect(enrollApi).toContain("from('guardian_registration_approvals')")
  expect(enrollApi).toContain("from('registration_access_tokens')")
  expect(accessApi).toContain("decision === 'approved'")
  expect(accessPage).toContain('Approve registration')
  expect(accessPage).toContain('No registrations were found')
})
