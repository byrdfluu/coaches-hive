import { expect, test } from '@playwright/test'
import {
  isRetainedPortalWorkflowPath,
  isRetiredPortalPagePath,
  toAppFirstActionUrl,
} from '../src/lib/middlewarePolicy'
import { roleToPath } from '../src/lib/roleRedirect'

test.describe('app-first web routing policy', () => {
  test('retires normal user portal pages', () => {
    expect(isRetiredPortalPagePath('/athlete/dashboard')).toBe(true)
    expect(isRetiredPortalPagePath('/coach/calendar')).toBe(true)
    expect(isRetiredPortalPagePath('/org/teams')).toBe(true)
  })

  test('retains temporary browser-only workflows', () => {
    expect(isRetainedPortalWorkflowPath('/athlete/waivers')).toBe(true)
    expect(isRetainedPortalWorkflowPath('/athlete/payments/assignment-id/receipt')).toBe(true)
    expect(isRetiredPortalPagePath('/athlete/waivers')).toBe(false)
    expect(isRetiredPortalPagePath('/athlete/payments')).toBe(false)
  })

  test('keeps marketing and admin routes outside the retired policy', () => {
    expect(isRetiredPortalPagePath('/athletes')).toBe(false)
    expect(isRetiredPortalPagePath('/coaches/example-coach')).toBe(false)
    expect(isRetiredPortalPagePath('/organizations/example-org')).toBe(false)
    expect(isRetiredPortalPagePath('/admin')).toBe(false)
    expect(isRetiredPortalPagePath('/payment/complete')).toBe(false)
  })

  test('sends normal roles to the app handoff and admins to superadmin', () => {
    expect(roleToPath('athlete')).toBe('/open-app')
    expect(roleToPath('coach')).toBe('/open-app')
    expect(roleToPath('org_admin')).toBe('/open-app')
    expect(roleToPath('admin')).toBe('/admin')
    expect(roleToPath('superadmin')).toBe('/admin')
  })

  test('converts legacy internal destinations without rewriting external or retained workflows', () => {
    expect(toAppFirstActionUrl('/coach/calendar')).toBe('/open-app?from=%2Fcoach%2Fcalendar')
    expect(toAppFirstActionUrl('https://app.coacheshive.com/org/permissions?tab=members'))
      .toBe('/open-app?from=%2Forg%2Fpermissions%3Ftab%3Dmembers')
    expect(toAppFirstActionUrl('/waivers')).toBe('/waivers')
    expect(toAppFirstActionUrl('/athlete/waivers')).toBe('/athlete/waivers')
    expect(toAppFirstActionUrl('https://checkout.stripe.com/example')).toBe('https://checkout.stripe.com/example')
  })
})
