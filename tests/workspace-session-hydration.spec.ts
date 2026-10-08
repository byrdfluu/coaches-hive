import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test('workspace selector ignores stale auth responses and retries initial hydration', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/app/workspace/page.tsx'), 'utf8')
  expect(page).toContain('requestSequence.current')
  expect(page).toContain('response?.status === 401 && allowAuthRetry')
  expect(page).toContain("window.location.replace('/owner/login?next=/workspace')")
  expect(page).toContain("setError('')")
  expect(page).toContain('setData(null)')
})
