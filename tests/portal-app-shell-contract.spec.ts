import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

test('all authenticated portals use the shared Coaches Hive application shell', () => {
  const shell = source('src/components/PortalAppShell.tsx')
  const styles = source('src/app/globals.css')

  expect(source('src/app/org/layout.tsx')).toContain('<PortalAppShell portal="organization">')
  expect(source('src/components/CoachLayoutShell.tsx')).toContain('<PortalAppShell portal="coach">')
  expect(source('src/app/athlete/AthleteLayoutShell.tsx')).toContain('<PortalAppShell portal="family">')
  expect(source('src/app/admin/layout.tsx')).toContain('<AdminLayoutShell>')
  expect(source('src/components/AdminLayoutShell.tsx')).toContain('<PortalAppShell portal="admin">')
  expect(source('src/app/league/layout.tsx')).toContain('<PortalAppShell portal="league">')
  expect(shell).toContain("fetch('/api/roles/available', { cache: 'no-store' })")
  expect(shell).toContain("fetch('/api/workspaces/active'")
  expect(shell).toContain('buildPortalChoices(portalContext || {})')
  expect(shell).toContain('Search portal pages')
  expect(shell).toContain("event.key.toLowerCase() === 'k'")
  expect(shell).toContain('{config.groups.map((group) => {')
  expect(shell).toContain('const mobilePrimaryGroups = config.groups.slice(0, 4)')
  expect(shell).toContain("fetch('/api/notifications', { cache: 'no-store' })")
  expect(shell).toContain('<PortalHomeActionStrip portal={portal} attentionCount={attentionCount}/>')
  expect(styles).toContain('--ch-sidebar-width: 252px')
  expect(styles).toContain('.ch-mobile-bottom-nav')
  expect(styles).toContain('background: #c91512')
  expect(styles).toContain('.ch-desktop-sidebar .brand-wordmark-coaches { color: #fff; }')
  expect(styles).toContain("[class*='lg:grid-cols']:has(> [data-legacy-portal-nav])")
  expect(styles).toContain('padding-top: 12px !important')
})

test('superadmin uses the same primary and contextual left navigation', () => {
  const shell = source('src/components/PortalAppShell.tsx')
  const adminLayout = source('src/components/AdminLayoutShell.tsx')

  expect(adminLayout).toContain('<PortalAppShell portal="admin">')
  expect(shell).toContain("eyebrow: 'Superadmin'")
  expect(shell).toContain("{ label: 'Operations', href: '/admin/operations'")
  expect(shell).toContain("{ label: 'Governance', href: '/admin/governance'")
})

test('portal home surfaces mobile-inspired quick actions and resumable onboarding', () => {
  const actions = source('src/components/PortalHomeActionStrip.tsx')

  expect(actions).toContain("label: 'Take attendance'")
  expect(actions).toContain("label: 'View schedule'")
  expect(actions).toContain("label: 'Review roster'")
  expect(actions).toContain("fetch('/api/onboarding/profile', { cache: 'no-store' })")
  expect(actions).toContain('Your answers are saved.')
  expect(actions).toContain('Resume setup')
})

test('workspace switching stays inside the portal shell', () => {
  const shell = source('src/components/PortalAppShell.tsx')
  const orgSettings = source('src/app/org/settings/page.tsx')

  expect(source('src/app/org/page.tsx')).not.toContain('<RoleSwitcher />')
  expect(source('src/app/coach/dashboard/page.tsx')).not.toContain('<RoleSwitcher hideOrgOptions />')
  expect(source('src/app/league/page.tsx')).not.toContain('Switch workspace</Link>')
  expect(shell).toContain('window.location.assign(destination)')
  expect(orgSettings).not.toContain('<RoleSwitcher />')
  expect(orgSettings).not.toContain('Jump to</p>')
  expect(shell).toContain("{ href: '#account', label: 'Account controls' }")
})

test('portal dashboard pills scroll with controls and public footer stays external', () => {
  const pillNav = source('src/components/ScrollablePillNav.tsx')
  const league = source('src/app/league/page.tsx')
  const footer = source('src/components/PublicFooter.tsx')

  expect(league).toContain('<ScrollablePillNav items={sections}')
  expect(pillNav).toContain("scroller.scrollBy({ left: direction *")
  expect(pillNav).toContain('Scroll navigation left')
  expect(pillNav).toContain('Scroll navigation right')
  expect(pillNav).toContain('shrink-0')
  for (const root of ['/coach', '/athlete', '/org', '/admin', '/league', '/workspace']) {
    expect(footer).toContain(`'${root}'`)
  }
  expect(footer).not.toContain("'/guardian'")
  expect(footer).not.toContain("pathname.startsWith('/coaches/')")
})
