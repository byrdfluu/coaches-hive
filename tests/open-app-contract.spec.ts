import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('native app handoff contract', () => {
  test('opens the native app without unlocking retired web portals', () => {
    const button = source('src/app/open-app/OpenAppButton.tsx')
    const proxy = source('src/proxy.ts')
    expect(button).toContain('coacheshive://open')
    expect(button).not.toContain('resolveWebPortalPath')
    expect(button).not.toContain('ch_web_portal=1')
    expect(proxy).not.toContain('webPortalRequested')
  })

  test('keeps optional native destinations refresh-only and safely encoded', () => {
    const button = source('src/app/open-app/OpenAppButton.tsx')
    expect(button).toContain("params.set('path', destination)")
    expect(button).toContain('URLSearchParams')
    expect(button).not.toContain("params.set('status'")
    expect(button).not.toContain('markPaid')
  })

  test('generates the desktop QR code from the same App Store URL', () => {
    const page = source('src/app/open-app/page.tsx')
    const qr = source('src/app/open-app/AppStoreQrCode.tsx')
    expect(page).toContain('NEXT_PUBLIC_APP_STORE_URL')
    expect(page).toContain("url.hostname === 'apps.apple.com'")
    expect(page).toContain("url.hostname === 'testflight.apple.com'")
    expect(page).toContain('<AppStoreQrCode appStoreUrl={appStoreUrl}')
    expect(qr).toContain('value={appStoreUrl}')
    expect(qr).toContain('href={appStoreUrl}')
    expect(qr).toContain('hidden')
    expect(qr).toContain('md:block')
  })

  test('preserves native notification destinations', () => {
    const notifications = source('src/lib/inAppNotifications.ts')
    expect(notifications).not.toContain('toAppFirstActionUrl')
    expect(notifications).toContain('const rows = Array.isArray(input) ? input : [input]')
  })
})
