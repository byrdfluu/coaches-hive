import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { mobileApiError, safeMobileMessage } from '../src/lib/mobileApiContract'

const mobileRoutesRoot = path.join(process.cwd(), 'src/app/api/mobile')
const routeFiles = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name)
  return entry.isDirectory() ? routeFiles(target) : entry.name === 'route.ts' ? [target] : []
})

test('canonical mobile error response keeps request metadata separate from its safe message', async () => {
  const response = mobileApiError({
    code: 'profile_validation_failed',
    message: 'Review the highlighted information and try again.',
    status: 422,
    retryable: false,
    requestId: 'mobile-request-1234',
    fieldErrors: { state: 'Select a valid state.' },
  })
  expect(response.status).toBe(422)
  expect(await response.json()).toEqual({ error: {
    code: 'profile_validation_failed',
    message: 'Review the highlighted information and try again.',
    retryable: false,
    request_id: 'mobile-request-1234',
    reference_id: 'mobile-request-1234',
    field_errors: { state: 'Select a valid state.' },
  } })
  expect(response.headers.get('X-Coaches-Hive-Support-Reference')).toBe('mobile-request-1234')
})

test('database and provider details are never customer-facing', async () => {
  const unsafe = [
    'new row violates check constraint athlete_profiles_state_check',
    'PostgREST schema cache could not find a column',
    'Supabase relation public.profiles does not exist',
    'Stripe: No such payment_intent',
    'duplicate key violates unique constraint',
  ]
  for (const message of unsafe) {
    expect(safeMobileMessage(message, 409)).toBe('This action conflicts with the current state. Refresh and try again.')
  }
  expect(safeMobileMessage('Anything internal', 503)).toBe('This service is temporarily unavailable. Please try again.')
})

test('all mobile routes avoid legacy unstructured and raw provider error paths', () => {
  for (const file of routeFiles(mobileRoutesRoot)) {
    const source = fs.readFileSync(file, 'utf8')
    expect(source, file).not.toMatch(/from ['"]@\/lib\/apiAuth['"]/)
    expect(source, file).not.toMatch(/NextResponse\.json\(\{\s*error\s*:\s*['"]/) 
    expect(source, file).not.toMatch(/NextResponse\.json\(\{\s*error\s*:\s*\{/)
    expect(source, file).not.toMatch(/(?:mobileError|jsonError)\([^\n]*(?:error|checkoutError)\??\.message/)
    expect(source, file).not.toContain('Reference: ${')
  }
})

test('legacy mobile error calls delegate to the canonical typed envelope', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/mobilePaymentApi.ts'), 'utf8')
  expect(source).toContain('return correlatedError(requestId, code, error, status, retryable, fieldErrors)')
  expect(source).not.toContain('reference_id:')
})
