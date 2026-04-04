'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { getOrgTypeConfig, normalizeOrgType } from '@/lib/orgTypeConfig'
import PortalRoleSwitcher from '@/components/PortalRoleSwitcher'

const baseLinks = [
  { href: '/org', label: 'Overview' },
  { href: '/org/teams', label: 'Teams' },
  { href: '/org/coaches', label: 'Coaches' },
  { href: '/org/contacts', label: 'Contacts' },
  { href: '/org/notifications', label: 'Notifications' },
  { href: '/org/messages', label: 'Messages' },
  { href: '/org/notes', label: 'Notes' },
  { href: '/org/marketplace', label: 'Marketplace' },
  { href: '/org/calendar', label: 'Calendar' },
  { href: '/org/payments', label: 'Payments' },
  { href: '/org/permissions', label: 'Permissions' },
  { href: '/org/reports', label: 'Reports' },
  { href: '/org/support', label: 'Support' },
  { href: '/org/settings', label: 'Settings' },
]

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#191919" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="5" x2="15" y2="5" />
      <line x1="3" y1="9" x2="15" y2="9" />
      <line x1="3" y1="13" x2="15" y2="13" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#191919" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="3" x2="15" y2="15" />
      <line x1="15" y1="3" x2="3" y2="15" />
    </svg>
  )
}

export default function OrgSidebar() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const pathname = usePathname()
  const currentPath = pathname && pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname
  const [orgType, setOrgType] = useState('organization')
  const [orgName, setOrgName] = useState<string | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [memberRole, setMemberRole] = useState<string | null>(null)
  const [rolePermissions, setRolePermissions] = useState<Record<string, Record<string, boolean>>>({})
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    const checkRole = async () => {
      const { data } = await supabase.auth.getUser()
      if (!active) return
      const role = data.user?.user_metadata?.role
      if (role === 'athlete') {
        router.replace('/athlete')
      }
    }
    checkRole()
    return () => {
      active = false
    }
  }, [router, supabase])

  useEffect(() => {
    let active = true
    const loadOrgType = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!active) return
      const userId = userData.user?.id
      const role = userData.user?.user_metadata?.role
      if (!userId) return
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id, role')
        .eq('user_id', userId)
        .maybeSingle()
      const membershipRow = (membership || null) as { org_id?: string | null; role?: string | null } | null
      if (!membershipRow?.org_id) {
        if (role === 'admin') {
          setMemberRole('admin')
          return
        }
        router.replace('/org/onboarding')
        return
      }
      setOrgId(membershipRow.org_id)
      setMemberRole(membershipRow.role || null)
      const { data: org } = await supabase
        .from('organizations')
        .select('org_type, name')
        .eq('id', membershipRow.org_id)
        .maybeSingle()
      const orgRow = (org || null) as { org_type?: string | null; name?: string | null } | null
      if (!active) return
      setOrgType(normalizeOrgType(orgRow?.org_type))
      if (orgRow?.name) setOrgName(orgRow.name)
    }
    loadOrgType()
    return () => {
      active = false
    }
  }, [router, supabase])

  useEffect(() => {
    if (!orgId) return
    let active = true
    const loadPermissions = async () => {
      const { data } = await supabase
        .from('org_role_permissions')
        .select('role, permissions')
        .eq('org_id', orgId)
      if (!active) return
      const permissionRows = (data || []) as Array<{
        role?: string | null
        permissions?: Record<string, boolean>
      }>
      const map: Record<string, Record<string, boolean>> = {}
      permissionRows.forEach((row) => {
        if (row.role) {
          map[row.role] = row.permissions || {}
        }
      })
      setRolePermissions(map)
    }
    loadPermissions()
    return () => {
      active = false
    }
  }, [orgId, supabase])

  const navConfig = useMemo(() => getOrgTypeConfig(orgType).nav, [orgType])
  const links = useMemo(() => baseLinks.map((link) => {
    if (link.href === '/org/teams') return { ...link, label: navConfig.teams }
    if (link.href === '/org/calendar') return { ...link, label: navConfig.calendar }
    if (link.href === '/org/reports') return { ...link, label: navConfig.reports }
    if (link.href === '/org/payments') return { ...link, label: navConfig.payments }
    return link
  }), [navConfig])

  const linkPermissionKey = useMemo(
    () => ({
      '/org': 'overview',
      '/org/teams': 'teams',
      '/org/coaches': 'coaches',
      '/org/contacts': 'contacts',
      '/org/notifications': 'notifications',
      '/org/messages': 'messages',
      '/org/notes': 'notes',
      '/org/marketplace': 'marketplace',
      '/org/calendar': 'calendar',
      '/org/payments': 'payments',
      '/org/permissions': 'permissions',
      '/org/reports': 'reports',
      '/org/settings': 'settings',
    }),
    []
  )

  const resolvePermissionKey = useCallback(
    (path: string | null | undefined) => {
      if (!path) return null
      const keys = Object.keys(linkPermissionKey).sort((a, b) => b.length - a.length)
      for (const key of keys) {
        if (path === key || path.startsWith(`${key}/`)) return linkPermissionKey[key as keyof typeof linkPermissionKey]
      }
      return null
    },
    [linkPermissionKey]
  )

  const adminRoles = useMemo(
    () =>
      new Set([
        'admin',
        'org_admin',
        'club_admin',
        'travel_admin',
        'school_admin',
        'athletic_director',
        'program_director',
        'team_manager',
      ]),
    []
  )

  const linkStates = useMemo(() => {
    if (!memberRole) return links.map((link) => ({ ...link, allowed: true }))
    if (adminRoles.has(memberRole)) return links.map((link) => ({ ...link, allowed: true }))
    const perms = rolePermissions[memberRole] || {}
    return links.map((link) => {
      const key = linkPermissionKey[link.href as keyof typeof linkPermissionKey]
      if (!key) return { ...link, allowed: true }
      if (Object.keys(perms).length === 0) return { ...link, allowed: true }
      return { ...link, allowed: perms[key] !== false }
    })
  }, [adminRoles, linkPermissionKey, links, memberRole, rolePermissions])

  useEffect(() => {
    if (!memberRole) return
    if (adminRoles.has(memberRole)) return
    const key = resolvePermissionKey(currentPath)
    if (!key) return
    const perms = rolePermissions[memberRole] || {}
    if (Object.keys(perms).length === 0) return
    if (perms[key] === false) {
      router.replace('/org')
    }
  }, [adminRoles, currentPath, memberRole, resolvePermissionKey, rolePermissions, router])

  const activeLinkLabel = useMemo(() => {
    const active = linkStates.find((link) => {
      const isRoot = link.href === '/org'
      const linkPath = link.href !== '/' ? link.href.replace(/\/+$/, '') : link.href
      return isRoot
        ? currentPath === linkPath
        : currentPath === linkPath || currentPath.startsWith(`${linkPath}/`)
    })
    return active?.label ?? 'Menu'
  }, [linkStates, currentPath])

  return (
    <aside className="glass-card w-full self-start border border-[#191919] bg-white px-3 py-3 lg:max-w-[200px]">
      <div className="space-y-3">
        <PortalRoleSwitcher currentPortal="org" />

        {orgName && (
          <div className="px-2 py-2 border-b border-[#e8e8e8]">
            <p className="text-[10px] uppercase tracking-widest text-[#9a9a9a] font-medium mb-0.5">Organization</p>
            <p className="text-sm font-semibold text-[#191919] truncate">{orgName}</p>
          </div>
        )}

        {/* Mobile: hamburger toggle */}
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl px-2 py-1.5"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <span className="text-sm font-semibold text-[#191919]">{activeLinkLabel}</span>
            {open ? <CloseIcon /> : <HamburgerIcon />}
          </button>
          {open && (
            <nav className="mt-2 space-y-1 pb-1">
              {linkStates.map((link) => {
                const isRoot = link.href === '/org'
                const linkPath = link.href !== '/' ? link.href.replace(/\/+$/, '') : link.href
                const isActive = isRoot
                  ? currentPath === linkPath
                  : currentPath === linkPath || currentPath.startsWith(`${linkPath}/`)
                const isAllowed = link.allowed

                return isAllowed ? (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                      isActive ? 'bg-[#191919] text-white' : 'hover:bg-[#e8e8e8] text-[#191919]'
                    }`}
                  >
                    {link.label}
                  </Link>
                ) : (
                  <div
                    key={link.href}
                    className="flex items-center rounded-2xl px-3 py-2.5 text-sm font-semibold cursor-not-allowed text-[#9a9a9a] opacity-70"
                    title="Don't have access"
                  >
                    {link.label}
                  </div>
                )
              })}
            </nav>
          )}
        </div>

        {/* Desktop: full vertical sidebar */}
        <nav className="hidden lg:block space-y-2 text-sm font-semibold text-[#191919]">
          {linkStates.map((link) => {
            const isRoot = link.href === '/org'
            const linkPath = link.href !== '/' ? link.href.replace(/\/+$/, '') : link.href
            const isActive = isRoot
              ? currentPath === linkPath
              : currentPath === linkPath || currentPath.startsWith(`${linkPath}/`)
            const isAllowed = link.allowed
            const baseClass = isAllowed
              ? isActive
                ? 'bg-[#191919] text-white'
                : 'hover:bg-[#e8e8e8] text-[#191919]'
              : 'cursor-not-allowed text-[#9a9a9a] opacity-70'

            return (
              isAllowed ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex min-w-0 items-center rounded-2xl px-3 py-3 leading-tight transition ${baseClass}`}
                >
                  <span className="truncate">{link.label}</span>
                </Link>
              ) : (
                <div
                  key={link.href}
                  className={`group flex min-w-0 items-center rounded-2xl px-3 py-3 leading-tight transition ${baseClass}`}
                  title="Don't have access"
                >
                  <span className="truncate">{link.label}</span>
                  <span className="ml-auto hidden text-[10px] font-semibold text-[#b80f0a] opacity-0 transition group-hover:opacity-100 lg:inline">
                    No access
                  </span>
                </div>
              )
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
