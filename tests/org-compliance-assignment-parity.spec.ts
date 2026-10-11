import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('organization compliance API preserves the iOS assignment and edit contract', () => {
  const route = read('src/app/api/org/compliance/items/route.ts')

  expect(route).toContain(".from('org_compliance_items')")
  expect(route).toContain('assigned_to: assignedTo')
  expect(route).toContain('update.description')
  expect(route).toContain('update.due_date')
  expect(route).toContain('update.assigned_to')
  expect(route).toContain(".eq('status', 'active')")
  expect(route).toContain(".eq('org_id', auth.orgId)")
})

test('organization compliance page can assign and fully edit shared items', () => {
  const page = read('src/app/org/compliance/page.tsx')

  expect(page).toContain('setItemAssignee')
  expect(page).toContain('beginEditItem')
  expect(page).toContain('saveItemEdit')
  expect(page).toContain('assigned_to: itemForm.assignedTo || null')
  expect(page).toContain('Add compliance item')
})
