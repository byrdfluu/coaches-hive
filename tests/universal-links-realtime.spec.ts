import fs from 'fs'
import path from 'path'
import { expect, test } from '@playwright/test'

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('Universal Links remain configured when optional Vercel variables are absent', async ({ request }) => {
  const response = await request.get('/.well-known/apple-app-site-association')
  expect(response.ok()).toBeTruthy()
  expect(response.headers()['content-type']).toContain('application/json')
  const body = await response.json()
  expect(body.applinks.details[0].appID).toBe('YMHDXJZ674.com.coacheshive.mobile')
  expect(body.applinks.details[0].components.map((item: { '/': string }) => item['/'])).toEqual(
    expect.arrayContaining(['/coaches/*', '/organizations/*', '/open-app*', '/payment/complete*']),
  )
})

test('coach and organization portals subscribe to authorized realtime changes', () => {
  const realtime = source('src/components/PortalRealtimeRefresh.tsx')
  expect(realtime).toContain("'active_workspace_preferences'")
  expect(realtime).toContain("'coach_notes'")
  expect(realtime).toContain("'availability_blocks'")
  expect(realtime).toContain("'coach_membership_subscriptions'")
  expect(realtime).toContain("'coach_programs'")
  expect(realtime).toContain("'payment_transactions'")
  expect(realtime).toContain("window.location.reload()")
  expect(source('src/app/coach/layout.tsx')).toContain('<PortalRealtimeRefresh portal="coach"')
  expect(source('src/app/org/layout.tsx')).toContain('<PortalRealtimeRefresh portal="organization"')
})
