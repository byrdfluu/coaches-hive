import { expect, test } from '@playwright/test'
import { isRetainedPortalWorkflowPath,isRetiredPortalPagePath,toAppFirstActionUrl } from '../src/lib/middlewarePolicy'
import { roleToPath } from '../src/lib/roleRedirect'
import { isPortalPagePath } from '../src/lib/middlewareEnforcement'

test.describe('active web portal routing policy',()=>{
  test('keeps every customer portal active on web',()=>{
    for(const path of ['/athlete/dashboard','/coach/calendar','/org/teams']){
      expect(isRetiredPortalPagePath(path)).toBe(false)
      expect(isRetainedPortalWorkflowPath(path)).toBe(true)
      expect(toAppFirstActionUrl(path)).toBe(path)
    }
  })
  test('sends each role to its web portal',()=>{
    expect(roleToPath('athlete')).toBe('/athlete/dashboard')
    expect(roleToPath('coach')).toBe('/coach/dashboard')
    expect(roleToPath('org_admin')).toBe('/org')
    expect(roleToPath('club_admin')).toBe('/org')
    expect(roleToPath('organization')).toBe('/org')
    expect(roleToPath('org')).toBe('/org')
    expect(roleToPath('parent')).toBe('/athlete/dashboard')
    expect(roleToPath('admin')).toBe('/admin')
    expect(roleToPath('superadmin')).toBe('/admin')
  })
  test('does not rewrite public or external destinations',()=>{
    expect(toAppFirstActionUrl('/waivers')).toBe('/waivers')
    expect(toAppFirstActionUrl('https://checkout.stripe.com/example')).toBe('https://checkout.stripe.com/example')
  })
  test('keeps authenticated portal pages inside their portals',()=>{
    for(const path of ['/coach/dashboard','/coach/calendar','/athlete/dashboard','/athlete/payments','/org','/org/teams']){
      expect(isPortalPagePath(path)).toBe(true)
    }
    expect(isPortalPagePath('/pricing')).toBe(false)
    expect(isPortalPagePath('/select-plan')).toBe(false)
  })
})
