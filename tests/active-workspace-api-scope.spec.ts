import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('organization workspace APIs resolve the selected workspace instead of an arbitrary membership', () => {
  const paths = [
    'src/app/api/org/waivers/route.ts',
    'src/app/api/org/waivers/remind/route.ts',
    'src/app/api/facilities/route.ts',
    'src/app/api/storage/branding/route.ts',
    'src/app/api/messages/[id]/route.ts',
    'src/app/api/practice-plans/route.ts',
    'src/app/api/practice-plans/[id]/share/route.ts',
  ]
  for (const path of paths) {
    const route = source(path)
    expect(route, path).toContain('resolveActiveOrganizationStaffContext')
    expect(route, path).toContain('active_workspace_id')
    expect(route, path).toContain('current_org_id')
  }
})
