'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { getOrgTypeConfig, normalizeOrgType } from '@/lib/orgTypeConfig'
import PortalRoleSwitcher from '@/components/PortalRoleSwitcher'

const baseLinks = [
  { href: '/org', label: 'Overview' },
  { href: '/org/notifications', label: 'Notifications' },
  { href: '/org/teams', label: 'Teams' },
  { href: '/org/coaches', label: 'Coaches' },
  { href: '/org/contacts', label: 'Contacts' },
  { href: '/org/permissions', label: 'Permissions' },
  { href: '/org/messages', label: 'Messages' },
  { href: '/org/notes', label: 'Notes' },
  { href: '/org/waivers', label: 'Waivers' },
  { href: '/org/tryouts', label: 'Tryouts' },
  { href: '/org/enrollment', label: 'Enrollment' },
  { href: '/org/calendar', label: 'Calendar' },
  { href: '/org/games', label: 'Games' },
  { href: '/org/seasons', label: 'Seasons' },
  { href: '/org/marketplace', label: 'Marketplace' },
  { href: '/org/payments', label: 'Payments' },
  { href: '/org/billing', label: 'Billing' },
  { href: '/org/stripe-setup', label: 'Stripe setup' },
  { href: '/org/reports', label: 'Reports' },
  { href: '/org/audit', label: 'Audit' },
  { href: '/org/compliance', label: 'Compliance' },
  { href: '/org/settings', label: 'Settings' },
  { href: '/org/support', label: 'Support' },
]

type NavLink = { href: string; label: string; allowed: boolean }
type NavGroup = { id: string; label: string; icon: ReactNode; links: NavLink[] }

const USER_LINKS = [
  { href: '/org/settings', label: 'Organization settings' },
  { href: '/org/permissions', label: 'Permissions' },
  { href: '/org/support', label: 'Support' },
  { href: '/logout', label: 'Sign out' },
]

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="6" height="6" rx="1.5" fill="currentColor" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" fill="currentColor" />
      <rect x="3" y="11" width="14" height="6" rx="1.5" fill="currentColor" />
    </svg>
  )
}

function IconPeople() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <circle cx="7" cy="6" r="2.6" />
      <path d="M2 16c0-3.2 2.2-5.3 5-5.3s5 2.1 5 5.3H2Z" />
      <circle cx="14.2" cy="6.8" r="2.1" opacity=".65" />
      <path d="M12.7 15.8c-.1-1.7-.7-3.2-1.8-4.3.7-.5 1.6-.8 2.7-.8 2.5 0 4.4 1.9 4.4 5.1h-5.3Z" opacity=".65" />
    </svg>
  )
}

function IconComms() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <path d="M3 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H7.2L3 17.5V4Z" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M7 2v4M13 2v4M3 9h14" />
      <path d="M7 12.5h.01M10 12.5h.01M13 12.5h.01" strokeWidth="2.4" />
    </svg>
  )
}

function IconCommerce() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h12l-1.2 10H5.2L4 7Z" />
      <path d="M7 7a3 3 0 0 1 6 0" />
      <path d="M8 12h4" />
    </svg>
  )
}

function IconReports() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17V3h12v14H4Z" />
      <path d="M7 13V9M10 13V6M13 13v-3" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
    </svg>
  )
}

function IconSupport() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M7.8 8a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.8-2.2 3.1M10 15h.01" />
    </svg>
  )
}

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

export default function OrgSidebar({ desktop = false }: { desktop?: boolean }) {
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
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null)
  const [pinnedGroupId, setPinnedGroupId] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('Org')
  const desktopNavRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedAvatar = window.localStorage.getItem('ch_avatar_url')
    const storedName = window.localStorage.getItem('ch_full_name')
    if (storedAvatar && !storedAvatar.includes('placeholder')) setAvatarUrl(storedAvatar)
    if (storedName) setDisplayName(storedName.split(' ')[0] || storedName)

    const onAvatarUpdate = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url
      if (url) setAvatarUrl(url)
    }
    const onNameUpdate = (event: Event) => {
      const name = (event as CustomEvent<{ name?: string }>).detail?.name
      if (name) setDisplayName(name.split(' ')[0] || name)
    }
    window.addEventListener('ch:avatar-updated', onAvatarUpdate)
    window.addEventListener('ch:name-updated', onNameUpdate)
    return () => {
      window.removeEventListener('ch:avatar-updated', onAvatarUpdate)
      window.removeEventListener('ch:name-updated', onNameUpdate)
    }
  }, [])

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
      '/org/waivers': 'waivers',
      '/org/tryouts': 'teams',
      '/org/enrollment': 'teams',
      '/org/games': 'calendar',
      '/org/marketplace': 'marketplace',
      '/org/calendar': 'calendar',
      '/org/payments': 'payments',
      '/org/permissions': 'permissions',
      '/org/reports': 'reports',
      '/org/billing': 'settings',
      '/org/stripe-setup': 'settings',
      '/org/audit': 'reports',
      '/org/compliance': 'settings',
      '/org/seasons': 'settings',
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

  const linkByHref = useMemo(() => {
    const map = new Map<string, NavLink>()
    linkStates.forEach((link) => map.set(link.href, link))
    return map
  }, [linkStates])

  const makeGroupLinks = useCallback(
    (hrefs: string[]) =>
      hrefs
        .map((href) => linkByHref.get(href))
        .filter((link): link is NavLink => Boolean(link)),
    [linkByHref],
  )

  const navGroups = useMemo<NavGroup[]>(
    () => [
      {
        id: 'home',
        label: 'Home',
        icon: <IconHome />,
        links: makeGroupLinks(['/org', '/org/notifications']),
      },
      {
        id: 'people',
        label: 'People',
        icon: <IconPeople />,
        links: makeGroupLinks(['/org/teams', '/org/coaches', '/org/contacts', '/org/permissions', '/org/enrollment']),
      },
      {
        id: 'communication',
        label: 'Communication',
        icon: <IconComms />,
        links: makeGroupLinks(['/org/messages', '/org/notes', '/org/waivers']),
      },
      {
        id: 'calendar',
        label: 'Calendar',
        icon: <IconCalendar />,
        links: makeGroupLinks(['/org/calendar', '/org/games', '/org/seasons']),
      },
      {
        id: 'commerce',
        label: 'Commerce',
        icon: <IconCommerce />,
        links: makeGroupLinks(['/org/marketplace', '/org/payments', '/org/billing', '/org/stripe-setup']),
      },
      {
        id: 'reports',
        label: 'Reports',
        icon: <IconReports />,
        links: makeGroupLinks(['/org/reports', '/org/audit', '/org/compliance']),
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: <IconSettings />,
        links: makeGroupLinks(['/org/settings']),
      },
      {
        id: 'support',
        label: 'Support',
        icon: <IconSupport />,
        links: makeGroupLinks(['/org/support']),
      },
    ],
    [makeGroupLinks],
  )

  const activeGroupId = useMemo(() => {
    const active = navGroups.find((group) =>
      group.links.some((link) => {
        const isRoot = link.href === '/org'
        const linkPath = link.href !== '/' ? link.href.replace(/\/+$/, '') : link.href
        return isRoot
          ? currentPath === linkPath
          : currentPath === linkPath || currentPath.startsWith(`${linkPath}/`)
      }),
    )
    return active?.id ?? null
  }, [currentPath, navGroups])

  const openGroupId = pinnedGroupId ?? hoveredGroupId
  const openGroup = openGroupId === 'user' ? null : (navGroups.find((group) => group.id === openGroupId) || null)
  const userFlyoutOpen = openGroupId === 'user'
  const userInitials = (displayName || 'O').charAt(0).toUpperCase()

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (desktopNavRef.current && !desktopNavRef.current.contains(event.target as Node)) {
        setPinnedGroupId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const renderMobileLink = (link: NavLink) => {
    const isRoot = link.href === '/org'
    const linkPath = link.href !== '/' ? link.href.replace(/\/+$/, '') : link.href
    const isActive = isRoot
      ? currentPath === linkPath
      : currentPath === linkPath || currentPath.startsWith(`${linkPath}/`)
    const baseClass = link.allowed
      ? isActive
        ? 'bg-[#191919] text-white'
        : 'hover:bg-[#e8e8e8] text-[#191919]'
      : 'cursor-not-allowed text-[#9a9a9a] opacity-70'

    return link.allowed ? (
      <Link
        key={link.href}
        href={link.href}
        onClick={() => setOpen(false)}
        className={`flex items-center rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${baseClass}`}
      >
        {link.label}
      </Link>
    ) : (
      <div
        key={link.href}
        className={`flex items-center rounded-2xl px-3 py-2.5 text-sm font-semibold ${baseClass}`}
        title="Don't have access"
      >
        {link.label}
      </div>
    )
  }

  return (
    <aside
      className={
        desktop
          ? 'fixed left-0 top-0 z-[200] hidden h-screen w-[72px] bg-transparent lg:block'
          : 'glass-card mb-4 min-w-0 w-full self-start overflow-hidden border border-[#191919] bg-white px-2.5 py-2.5 sm:px-3 sm:py-3 lg:hidden'
      }
    >
      <div className="space-y-3 lg:h-full lg:space-y-0">
        {!desktop ? (
        <div>
          <PortalRoleSwitcher currentPortal="org" />
        </div>
        ) : null}

        {/* Mobile: hamburger toggle */}
        {!desktop ? (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl px-3 py-3.5"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <span className="text-sm font-semibold text-[#191919]">{activeLinkLabel}</span>
            {open ? <CloseIcon /> : <HamburgerIcon />}
          </button>
          {open && (
            <nav className="mt-2 max-h-[70vh] space-y-1 overflow-y-auto pb-1 pr-1">
              {linkStates.map(renderMobileLink)}
            </nav>
          )}
        </div>
        ) : null}

        {/* Desktop: coach-style grouped icon rail with flyout */}
        {desktop ? (
        <div
          ref={desktopNavRef}
          className="relative flex h-full"
          onMouseLeave={() => setHoveredGroupId(null)}
        >
          <nav className="flex h-full w-[72px] flex-shrink-0 flex-col items-center gap-1 border-r border-[#e8e8e8] bg-white px-2 py-3">
            {navGroups.map((group) => {
              const isActive = activeGroupId === group.id
              const isOpen = openGroupId === group.id
              return (
                <div key={group.id} className="group relative" onMouseEnter={() => setHoveredGroupId(group.id)}>
                  <button
                    type="button"
                    onClick={() => setPinnedGroupId((prev) => (prev === group.id ? null : group.id))}
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${
                      isActive ? 'bg-[#191919] text-white' : 'text-[#4a4a4a] hover:bg-[#f5f5f5]'
                    }`}
                    aria-label={group.label}
                  >
                    {group.icon}
                  </button>
                  {!isOpen ? (
                    <span className="pointer-events-none absolute left-[52px] top-1/2 z-[60] -translate-y-1/2 whitespace-nowrap rounded-xl bg-[#191919] px-2.5 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {group.label}
                    </span>
                  ) : null}
                </div>
              )
            })}

            <div className="mt-auto">
              <div className="group relative" onMouseEnter={() => setHoveredGroupId('user')}>
                <button
                  type="button"
                  onClick={() => setPinnedGroupId((prev) => (prev === 'user' ? null : 'user'))}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl transition-colors hover:bg-[#f5f5f5]"
                  aria-label={displayName}
                >
                  {avatarUrl ? (
                    <span
                      className="h-8 w-8 rounded-full border border-[#dcdcdc] bg-[#f7f6f4] bg-cover bg-center"
                      style={{ backgroundImage: `url(${avatarUrl})` }}
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f5f5] text-xs font-bold text-[#191919]">
                      {userInitials}
                    </span>
                  )}
                </button>
                {!userFlyoutOpen ? (
                  <span className="pointer-events-none absolute left-[52px] top-1/2 z-[60] -translate-y-1/2 whitespace-nowrap rounded-xl bg-[#191919] px-2.5 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {displayName}
                  </span>
                ) : null}
              </div>
            </div>
          </nav>

          {(openGroup || userFlyoutOpen) ? (
            <div className="flex h-full w-56 flex-col border-r border-[#e8e8e8] bg-white shadow-[4px_0_24px_rgba(0,0,0,0.08)]">
              <div className="border-b border-[#ececec] px-2 pb-3">
                <p className="px-2 pt-5 text-xs font-semibold uppercase tracking-[0.24em] text-[#9a9a9a]">
                  {userFlyoutOpen ? 'Account' : 'Org portal'}
                </p>
                {userFlyoutOpen ? (
                  <div className="mt-3 flex items-center gap-2.5 px-2">
                    {avatarUrl ? (
                      <span
                        className="h-8 w-8 flex-shrink-0 rounded-full border border-[#dcdcdc] bg-[#f7f6f4] bg-cover bg-center"
                        style={{ backgroundImage: `url(${avatarUrl})` }}
                      />
                    ) : (
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#f5f5f5] text-xs font-bold text-[#191919]">
                        {userInitials}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#191919]">{displayName}</p>
                      {orgName ? <p className="truncate text-xs text-[#6b5f55]">{orgName}</p> : null}
                    </div>
                  </div>
                ) : (
                  <h2 className="mt-1 px-2 text-lg font-semibold text-[#191919]">{openGroup?.label}</h2>
                )}
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
                {userFlyoutOpen ? USER_LINKS.map((link) => {
                  const isActive = currentPath === link.href || currentPath?.startsWith(`${link.href}/`)
                  const isSignOut = link.href === '/logout'
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => {
                        setPinnedGroupId(null)
                        setHoveredGroupId(null)
                      }}
                      className={`flex items-center rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                        isSignOut
                          ? 'text-[#b80f0a] hover:bg-[#fff5f5]'
                          : isActive
                            ? 'bg-[#191919] text-white'
                            : 'text-[#191919] hover:bg-[#f5f5f5]'
                      }`}
                    >
                      {link.label}
                    </Link>
                  )
                }) : openGroup?.links.map((link) => {
                  const isRoot = link.href === '/org'
                  const linkPath = link.href !== '/' ? link.href.replace(/\/+$/, '') : link.href
                  const isActive = isRoot
                    ? currentPath === linkPath
                    : currentPath === linkPath || currentPath.startsWith(`${linkPath}/`)
                  const baseClass = link.allowed
                    ? isActive
                      ? 'bg-[#191919] text-white'
                      : 'text-[#191919] hover:bg-[#f5f5f5]'
                    : 'cursor-not-allowed text-[#9a9a9a] opacity-70'

                  return link.allowed ? (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => {
                        setPinnedGroupId(null)
                        setHoveredGroupId(null)
                      }}
                      className={`flex items-center rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${baseClass}`}
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <div
                      key={link.href}
                      className={`flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-semibold ${baseClass}`}
                      title="Don't have access"
                    >
                      <span>{link.label}</span>
                      <span className="text-[10px] text-[#b80f0a]">No access</span>
                    </div>
                  )
                })}
              </nav>
              {userFlyoutOpen ? (
                <div className="border-t border-[#e8e8e8] p-3">
                  <PortalRoleSwitcher currentPortal="org" />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        ) : null}
      </div>
    </aside>
  )
}
