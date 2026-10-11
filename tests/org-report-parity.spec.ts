import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('saved report API uses the shared organization report contract', () => {
  const source = read('src/app/api/org/reports/saved/route.ts')

  expect(source).toContain(".from('org_saved_reports')")
  expect(source).toContain('resolveActiveOrganizationId(session.user.id)')
  expect(source).toContain('created_by: context.session.user.id')
  expect(source).toContain(".eq('org_id', context.orgId)")
  expect(source).toContain('export async function DELETE')
})

test('report alert API supports the same create and lifecycle operations as iOS', () => {
  const source = read('src/app/api/org/reports/alerts/route.ts')

  expect(source).toContain(".from('org_report_alerts')")
  expect(source).toContain("'attendance_rate'")
  expect(source).toContain("'payment_completion'")
  expect(source).toContain("'outstanding_balance'")
  expect(source).toContain('export async function PATCH')
  expect(source).toContain('export async function DELETE')
  expect(source).toContain(".eq('org_id', context.orgId)")
})

test('web reports page reads and writes shared saved views and alerts', () => {
  const source = read('src/app/org/reports/page.tsx')

  expect(source).toContain("fetch('/api/org/reports/saved'")
  expect(source).toContain("fetch('/api/org/reports/alerts'")
  expect(source).toContain('Save current view')
  expect(source).toContain('Automated alerts')
  expect(source).toContain('handleApplySavedReport')
  expect(source).toContain('handleToggleReportAlert')
})

test('web schedules link to the shared saved report record used by iOS', () => {
  const source = read('src/app/api/org/reports/schedule/route.ts')

  expect(source).toContain(".from('org_saved_reports')")
  expect(source).toContain('saved_report_id: savedReportId')
  expect(source).toContain('created_by: session.user.id')
  expect(source).toContain('next_delivery_at:')
  expect(source).toContain('is_active: Boolean(body.enabled)')
})
