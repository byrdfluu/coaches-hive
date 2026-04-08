import type { AdminPermission } from '@/lib/adminRoles'

type ScopedAdminPermissionEntry = {
  prefix: string
  read: AdminPermission | null
  write?: AdminPermission | null
}

type ScopedOrgPermissionEntry = {
  prefix: string
  key: string | null
}

export const AUTH_SENSITIVE_PATHS = ['/api/auth/send-code', '/api/auth/signup']

export const BILLING_RECOVERY_PAGE_PREFIXES = ['/checkout', '/select-plan', '/logout']

export const BILLING_RECOVERY_API_PREFIXES = [
  '/api/lifecycle',
  '/api/stripe/subscription/checkout',
  '/api/stripe/subscription/confirm',
  '/api/account/subscription/cancel',
  '/api/account/delete',
]

export const PUBLIC_API_PREFIXES = [
  '/api/org/public',
  '/api/org/fees',
  '/api/auth/signup',
  '/api/auth/send-code',
  '/api/support/public',
  '/api/guardian-approvals',
  '/api/guardian-invites',
  '/api/stripe/webhook',
  '/api/webhooks/gmail',
  '/api/webhooks/postmark',
  '/api/reminders/sessions',
  '/api/integrations/google/callback',
  '/api/integrations/zoom/callback',
]

export const ORG_PORTAL_PREFIXES = [
  '/org/audit',
  '/org/billing',
  '/org/calendar',
  '/org/coaches',
  '/org/compliance',
  '/org/contacts',
  '/org/marketplace',
  '/org/messages',
  '/org/notes',
  '/org/notifications',
  '/org/onboarding',
  '/org/payments',
  '/org/permissions',
  '/org/plans',
  '/org/reports',
  '/org/seasons',
  '/org/settings',
  '/org/stripe-setup',
  '/org/support',
  '/org/suspended',
  '/org/teams',
]

const ADMIN_PAGE_PERMISSION_ENTRIES: ScopedAdminPermissionEntry[] = [
  { prefix: '/admin/debug', read: null },
  { prefix: '/admin/settings', read: 'security.manage' },
  { prefix: '/admin/security', read: 'security.manage' },
  { prefix: '/admin/audit', read: 'security.manage' },
  { prefix: '/admin/impersonate', read: 'impersonate' },
  { prefix: '/admin/support', read: 'support.manage' },
  { prefix: '/admin/guardian-links', read: 'support.manage' },
  { prefix: '/admin/guardian-approvals', read: 'support.read' },
  { prefix: '/admin/org-audit', read: 'support.read' },
  { prefix: '/admin/reviews', read: 'support.manage' },
  { prefix: '/admin/verifications', read: 'support.read' },
  { prefix: '/admin/waivers', read: 'support.read' },
  { prefix: '/admin/payouts', read: 'finance.read' },
  { prefix: '/admin/orders', read: 'finance.read' },
  { prefix: '/admin/revenue', read: 'finance.read' },
  { prefix: '/admin/disputes', read: 'finance.read' },
  { prefix: '/admin/operations', read: 'operations.manage' },
  { prefix: '/admin/automations', read: 'operations.manage' },
  { prefix: '/admin/release', read: 'operations.manage' },
  { prefix: '/admin/uptime', read: 'operations.manage' },
  { prefix: '/admin/playbook', read: 'operations.manage' },
  { prefix: '/admin/retention', read: 'operations.manage' },
  { prefix: '/admin/users', read: 'users.read' },
  { prefix: '/admin/athletes', read: 'users.read' },
  { prefix: '/admin/coaches', read: 'users.read' },
  { prefix: '/admin/orgs', read: 'users.read' },
  { prefix: '/admin', read: null },
]

const ADMIN_API_PERMISSION_ENTRIES: ScopedAdminPermissionEntry[] = [
  { prefix: '/api/admin/security', read: 'security.manage', write: 'security.manage' },
  { prefix: '/api/admin/make-admin', read: 'security.manage', write: 'security.manage' },
  { prefix: '/api/admin/env-check', read: 'security.manage', write: 'security.manage' },
  { prefix: '/api/admin/health', read: 'security.manage', write: 'security.manage' },
  { prefix: '/api/admin/settings', read: 'security.manage', write: 'security.manage' },
  { prefix: '/api/admin/audit', read: 'security.manage', write: 'security.manage' },
  { prefix: '/api/admin/actions', read: 'users.manage', write: 'users.manage' },
  { prefix: '/api/admin/impersonate', read: 'impersonate', write: 'impersonate' },
  { prefix: '/api/admin/support', read: 'support.read', write: 'support.manage' },
  { prefix: '/api/admin/guardian-links', read: 'support.read', write: 'support.manage' },
  { prefix: '/api/admin/guardian-approvals', read: 'support.read', write: 'support.manage' },
  { prefix: '/api/admin/org-audit', read: 'support.read', write: 'support.manage' },
  { prefix: '/api/admin/reviews', read: 'support.read', write: 'support.manage' },
  { prefix: '/api/admin/verifications', read: 'support.read', write: 'verifications.manage' },
  { prefix: '/api/admin/waivers', read: 'support.read', write: 'support.manage' },
  { prefix: '/api/admin/notices', read: 'support.read', write: 'support.manage' },
  { prefix: '/api/admin/payouts', read: 'finance.read', write: 'finance.manage' },
  { prefix: '/api/admin/orders', read: 'finance.read', write: 'finance.manage' },
  { prefix: '/api/admin/revenue', read: 'finance.read', write: 'finance.manage' },
  { prefix: '/api/admin/disputes', read: 'finance.read', write: 'finance.manage' },
  { prefix: '/api/admin/billing', read: 'finance.read', write: 'finance.manage' },
  { prefix: '/api/admin/operations', read: 'operations.manage', write: 'operations.manage' },
  { prefix: '/api/admin/automations', read: 'operations.manage', write: 'operations.manage' },
  { prefix: '/api/admin/release', read: 'operations.manage', write: 'operations.manage' },
  { prefix: '/api/admin/uptime', read: 'operations.manage', write: 'operations.manage' },
  { prefix: '/api/admin/playbook', read: 'operations.manage', write: 'operations.manage' },
  { prefix: '/api/admin/retention', read: 'operations.manage', write: 'operations.manage' },
  { prefix: '/api/admin/users', read: 'users.read', write: 'users.manage' },
  { prefix: '/api/admin/athletes', read: 'users.read', write: 'users.manage' },
  { prefix: '/api/admin/coaches', read: 'users.read', write: 'users.manage' },
  { prefix: '/api/admin/orgs', read: 'users.read', write: 'users.manage' },
  { prefix: '/api/admin/metrics', read: null, write: null },
]

const ORG_PAGE_PERMISSION_ENTRIES: ScopedOrgPermissionEntry[] = [
  { prefix: '/org/teams', key: 'teams' },
  { prefix: '/org/coaches', key: 'coaches' },
  { prefix: '/org/contacts', key: 'contacts' },
  { prefix: '/org/notifications', key: 'notifications' },
  { prefix: '/org/messages', key: 'messages' },
  { prefix: '/org/notes', key: 'notes' },
  { prefix: '/org/marketplace', key: 'marketplace' },
  { prefix: '/org/calendar', key: 'calendar' },
  { prefix: '/org/payments', key: 'payments' },
  { prefix: '/org/permissions', key: 'permissions' },
  { prefix: '/org/reports', key: 'reports' },
  { prefix: '/org/audit', key: 'reports' },
  { prefix: '/org/settings', key: 'settings' },
  { prefix: '/org/billing', key: 'settings' },
  { prefix: '/org/plans', key: 'settings' },
  { prefix: '/org/seasons', key: 'settings' },
  { prefix: '/org/compliance', key: 'settings' },
  { prefix: '/org/stripe-setup', key: 'settings' },
  { prefix: '/org/support', key: null },
  { prefix: '/org/suspended', key: null },
  { prefix: '/org/onboarding', key: null },
  { prefix: '/org', key: 'overview' },
]

const ORG_API_PERMISSION_ENTRIES: ScopedOrgPermissionEntry[] = [
  { prefix: '/api/org/messages', key: 'messages' },
  { prefix: '/api/org/marketplace', key: 'marketplace' },
  { prefix: '/api/org/products', key: 'marketplace' },
  { prefix: '/api/org/reports', key: 'reports' },
  { prefix: '/api/org/exports', key: 'reports' },
  { prefix: '/api/org/audit', key: 'reports' },
  { prefix: '/api/org/fees', key: 'payments' },
  { prefix: '/api/org/charges', key: 'payments' },
  { prefix: '/api/org/stripe', key: 'payments' },
  { prefix: '/api/org/settings', key: 'settings' },
  { prefix: '/api/org/waivers', key: 'settings' },
  { prefix: '/api/org/permissions', key: 'permissions' },
  { prefix: '/api/org/memberships', key: 'permissions' },
  { prefix: '/api/org/invites', key: 'permissions' },
  { prefix: '/api/org/calendar', key: 'calendar' },
  { prefix: '/api/org/contacts', key: 'contacts' },
  { prefix: '/api/org/notes', key: 'notes' },
  { prefix: '/api/org/create', key: null },
  { prefix: '/api/org/join-requests', key: null },
  { prefix: '/api/org/onboarding', key: null },
  { prefix: '/api/org/public', key: null },
]

export const matchesPathPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

const matchesAnyPathPrefix = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => matchesPathPrefix(pathname, prefix))

const sortEntriesByPrefixLength = <T extends { prefix: string }>(entries: T[]) =>
  [...entries].sort((a, b) => b.prefix.length - a.prefix.length)

const resolveAdminPermission = (pathname: string, method: string, entries: ScopedAdminPermissionEntry[]) => {
  const normalizedMethod = method.toUpperCase()
  const isReadMethod = normalizedMethod === 'GET' || normalizedMethod === 'HEAD'

  for (const entry of sortEntriesByPrefixLength(entries)) {
    if (matchesPathPrefix(pathname, entry.prefix)) {
      return isReadMethod ? entry.read : (entry.write ?? entry.read)
    }
  }
  return null
}

const resolveOrgPermissionKey = (pathname: string, entries: ScopedOrgPermissionEntry[]) => {
  for (const entry of sortEntriesByPrefixLength(entries)) {
    if (matchesPathPrefix(pathname, entry.prefix)) {
      return entry.key
    }
  }
  return null
}

export const isAuthSensitivePath = (pathname: string) => matchesAnyPathPrefix(pathname, AUTH_SENSITIVE_PATHS)

export const isPublicApiPath = (pathname: string) => matchesAnyPathPrefix(pathname, PUBLIC_API_PREFIXES)

export const isBillingRecoveryPagePath = (pathname: string) => matchesAnyPathPrefix(pathname, BILLING_RECOVERY_PAGE_PREFIXES)

export const isBillingRecoveryApiPath = (pathname: string) => matchesAnyPathPrefix(pathname, BILLING_RECOVERY_API_PREFIXES)

export const isOrgPortalPage = (pathname: string) =>
  pathname === '/org' || matchesAnyPathPrefix(pathname, ORG_PORTAL_PREFIXES)

export const isOrgPublicPage = (pathname: string) => {
  if (!(pathname === '/org' || pathname.startsWith('/org/'))) return false
  const pathSegments = pathname.split('/').filter(Boolean)
  return pathSegments.length === 2 && !isOrgPortalPage(pathname)
}

export const requiresOrgMembershipGuardForPath = (pathname: string) => {
  const isOrg = pathname === '/org' || pathname.startsWith('/org/')
  const isOrgApi = pathname.startsWith('/api/org')
  if (!isOrg && !isOrgApi) return false

  return !isOrgPublicPage(pathname)
    && !matchesPathPrefix(pathname, '/api/org/public')
    && !matchesPathPrefix(pathname, '/api/org/invites/respond')
    && !matchesPathPrefix(pathname, '/api/org/onboarding')
    && !matchesPathPrefix(pathname, '/api/org/join-requests')
    && !matchesPathPrefix(pathname, '/api/org/create')
}

export const getAdminPermissionForPath = (pathname: string, method: string) =>
  resolveAdminPermission(
    pathname,
    method,
    pathname.startsWith('/api/') ? ADMIN_API_PERMISSION_ENTRIES : ADMIN_PAGE_PERMISSION_ENTRIES,
  )

export const getOrgPermissionKeyForPath = (pathname: string) =>
  resolveOrgPermissionKey(
    pathname,
    pathname.startsWith('/api/') ? ORG_API_PERMISSION_ENTRIES : ORG_PAGE_PERMISSION_ENTRIES,
  )
