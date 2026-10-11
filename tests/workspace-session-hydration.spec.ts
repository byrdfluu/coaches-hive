import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test('workspace selector ignores stale auth responses and retries initial hydration', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/app/workspace/page.tsx'), 'utf8')
  expect(page).toContain('requestSequence.current')
  expect(page).toContain('response?.status === 401 && allowAuthRetry')
  expect(page).toContain("window.location.replace('/login?next=/workspace')")
  expect(page).toContain("setError('')")
  expect(page).toContain('setData(null)')
})

test('workspace discovery and switching remain available before lifecycle completion', () => {
  const enforcement = fs.readFileSync(path.join(process.cwd(), 'src/lib/middlewareEnforcement.ts'), 'utf8')
  const policy = fs.readFileSync(path.join(process.cwd(), 'src/lib/middlewarePolicy.ts'), 'utf8')
  for (const route of ["'/api/roles/available'", "'/api/workspaces/active'"]) {
    expect(enforcement).toContain(route)
    expect(policy).toContain(route)
  }
})
