'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import PortalRoleSwitcher from '@/components/PortalRoleSwitcher'
import { isCoachAthleteLaunch } from '@/lib/launchSurface'

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconOverview() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" fill="currentColor" />
    </svg>
  )
}

function IconAthletes() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <circle cx="7.5" cy="6" r="2.5" />
      <path d="M2 16c0-3.314 2.462-5.5 5.5-5.5S13 12.686 13 16H2Z" />
      <circle cx="14" cy="6" r="2" opacity=".6" />
      <path d="M13.5 10.6c.16-.065.327-.1.5-.1 2.485 0 4.5 1.9 4.5 4.5H13c0-1.663.576-3.14 1.5-4.4Z" opacity=".6" />
    </svg>
  )
}

function IconSchedule() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <line x1="7" y1="2" x2="7" y2="6" />
      <line x1="13" y1="2" x2="13" y2="6" />
      <line x1="3" y1="9" x2="17" y2="9" />
      <line x1="7" y1="12.5" x2="7" y2="12.5" strokeWidth="2.2" />
      <line x1="10" y1="12.5" x2="10" y2="12.5" strokeWidth="2.2" />
      <line x1="13" y1="12.5" x2="13" y2="12.5" strokeWidth="2.2" />
    </svg>
  )
}

function IconBusiness() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8V6a4 4 0 0 1 8 0v2" />
      <rect x="3" y="8" width="14" height="10" rx="2" />
    </svg>
  )
}

function IconComms() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6l-4 3V4Z" />
    </svg>
  )
}

function IconCompliance() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2L4 5v5c0 3.5 2.6 6.7 6 7.5 3.4-.8 6-4 6-7.5V5L10 2Z" />
      <polyline points="7,10 9,12 13,8" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" />
    </svg>
  )
}

// ─── Nav definition ───────────────────────────────────────────────────────────

type NavLink = { href: string; label: string }
type Category = { id: string; label: string; icon: React.ReactNode; links: NavLink[] }

const CATEGORIES: Category[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: <IconOverview />,
    links: [{ href: '/coach/dashboard', label: 'Dashboard' }],
  },
  {
    id: 'athletes',
    label: 'Athletes',
    icon: <IconAthletes />,
    links: [
      { href: '/coach/athletes', label: 'Athletes' },
      { href: '/coach/plans', label: 'Training Plans' },
      { href: '/coach/retention', label: 'Retention' },
    ],
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: <IconSchedule />,
    links: [
      { href: '/coach/calendar', label: 'Calendar' },
      { href: '/coach/attendance', label: 'Attendance' },
      { href: '/coach/availability', label: 'Availability' },
      { href: '/coach/bookings', label: 'Bookings' },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    icon: <IconBusiness />,
    links: [
      { href: '/coach/marketplace', label: 'Marketplace' },
      { href: '/coach/revenue', label: 'Revenue' },
      { href: '/coach/memberships', label: 'Memberships' },
    ],
  },
  {
    id: 'comms',
    label: 'Comms',
    icon: <IconComms />,
    links: [
      { href: '/coach/messages', label: 'Messages' },
      { href: '/coach/notifications', label: 'Notifications' },
      { href: '/coach/notes', label: 'Notes' },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: <IconCompliance />,
    links: [
      { href: '/coach/waivers', label: 'Waivers' },
      { href: '/coach/reviews', label: 'Reviews' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <IconSettings />,
    links: [
      { href: '/coach/profile', label: 'Profile' },
      { href: '/coach/settings', label: 'Settings' },
      { href: '/coach/reports', label: 'Reports' },
      { href: '/coach/orgs-teams', label: 'Orgs / Teams' },
      { href: '/coach/stripe-setup', label: 'Stripe Setup' },
      { href: '/coach/support', label: 'Support' },
    ],
  },
]

const USER_LINKS: NavLink[] = [
  { href: '/coach/profile', label: 'View profile' },
  { href: '/coach/settings', label: 'Settings' },
  { href: '/coach/support', label: 'Support' },
  { href: '/logout', label: 'Sign out' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function CoachIconRail() {
  const pathname = usePathname()
  const router = useRouter()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileExpandedId, setMobileExpandedId] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('Coach')
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch unread notification count
  useEffect(() => {
    fetch('/api/notifications')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        const notifs = data.notifications || []
        setUnreadCount(notifs.filter((n: { read_at?: string | null }) => !n.read_at).length)
      })
      .catch(() => {})
  }, [])

  // Load user avatar and name from localStorage (set by PublicHeader on auth)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const av = window.localStorage.getItem('ch_avatar_url')
    const name = window.localStorage.getItem('ch_full_name')
    if (av && !av.includes('placeholder')) setAvatarUrl(av)
    if (name) setDisplayName(name.split(' ')[0] || name)

    const onAvatarUpdate = (e: Event) => {
      const url = (e as CustomEvent<{ url?: string }>).detail?.url
      if (url) setAvatarUrl(url)
    }
    const onNameUpdate = (e: Event) => {
      const name = (e as CustomEvent<{ name?: string }>).detail?.name
      if (name) setDisplayName(name.split(' ')[0] || name)
    }
    window.addEventListener('ch:avatar-updated', onAvatarUpdate)
    window.addEventListener('ch:name-updated', onNameUpdate)
    return () => {
      window.removeEventListener('ch:avatar-updated', onAvatarUpdate)
      window.removeEventListener('ch:name-updated', onNameUpdate)
    }
  }, [])

  const categories = isCoachAthleteLaunch
    ? CATEGORIES.map((c) =>
        c.id === 'settings'
          ? { ...c, links: c.links.filter((l) => l.href !== '/coach/orgs-teams') }
          : c,
      )
    : CATEGORIES

  const activeCategoryId =
    categories.find((c) =>
      c.links.some((l) => pathname === l.href || pathname.startsWith(`${l.href}/`)),
    )?.id ?? null

  const openId = pinnedId ?? hoveredId
  const openCategory = openId !== 'user' ? (categories.find((c) => c.id === openId) ?? null) : null
  const userFlyoutOpen = openId === 'user'

  // Close flyout when clicking outside the entire container
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPinnedId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleIconClick(id: string) {
    setPinnedId((prev) => (prev === id ? null : id))
  }

  function handleLinkClick(href: string) {
    setPinnedId(null)
    setHoveredId(null)
    router.push(href)
  }

  function handleMobileLinkClick(href: string) {
    setMobileOpen(false)
    setMobileExpandedId(null)
    router.push(href)
  }

  // Avatar display
  const initials = displayName.charAt(0).toUpperCase()

  return (
    <>
      {/* ── Mobile hamburger button (bottom-right, below lg) ── */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        className="fixed bottom-4 right-4 z-[200] flex h-13 w-13 items-center justify-center rounded-full bg-[#191919] text-white shadow-xl lg:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="19" y2="6" />
          <line x1="3" y1="11" x2="19" y2="11" />
          <line x1="3" y1="16" x2="19" y2="16" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-[#b80f0a]" />
        )}
      </button>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[300] lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white pb-8">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-[#dcdcdc]" />
            </div>

            {/* User row */}
            <div className="flex items-center gap-3 border-b border-[#f0f0f0] px-5 pb-4 pt-3">
              {avatarUrl ? (
                <span
                  className="h-9 w-9 flex-shrink-0 rounded-full border border-[#dcdcdc] bg-cover bg-center"
                  style={{ backgroundImage: `url(${avatarUrl})` }}
                />
              ) : (
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#f5f5f5] text-sm font-bold text-[#191919]">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
              <p className="text-sm font-semibold text-[#191919]">{displayName}</p>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-[#9a9a9a] hover:bg-[#f5f5f5]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="2" y1="2" x2="14" y2="14" />
                  <line x1="14" y1="2" x2="2" y2="14" />
                </svg>
              </button>
            </div>

            {/* Categories */}
            <div className="px-3 py-2">
              {categories.map((cat) => {
                const isExpanded = mobileExpandedId === cat.id
                const isActiveCategory = activeCategoryId === cat.id
                return (
                  <div key={cat.id}>
                    <button
                      type="button"
                      onClick={() => setMobileExpandedId(isExpanded ? null : cat.id)}
                      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
                        isActiveCategory ? 'bg-[#191919] text-white' : 'text-[#191919] hover:bg-[#f5f5f5]'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        {cat.icon}
                        {cat.label}
                      </span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      >
                        <polyline points="2,4 7,10 12,4" />
                      </svg>
                    </button>
                    {isExpanded && (
                      <div className="mb-1 ml-4 mt-1 space-y-0.5">
                        {cat.links.map((link) => {
                          const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
                          return (
                            <button
                              key={link.href}
                              type="button"
                              onClick={() => handleMobileLinkClick(link.href)}
                              className={`flex w-full items-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                                isActive ? 'bg-[#191919] text-white' : 'text-[#4a4a4a] hover:bg-[#f5f5f5]'
                              }`}
                            >
                              {link.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Sign out */}
              <div className="mt-2 border-t border-[#f0f0f0] pt-2">
                <button
                  type="button"
                  onClick={() => handleMobileLinkClick('/logout')}
                  className="flex w-full items-center rounded-2xl px-4 py-3 text-sm font-semibold text-[#b80f0a] hover:bg-[#fff5f5]"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/*
       * Single fixed container — covers both rail and flyout.
       * onMouseLeave fires only when cursor exits the whole container,
       * so hovering from icon → flyout keeps the flyout alive.
       */}
      <div
        ref={containerRef}
        className="fixed left-0 top-0 z-[200] hidden h-screen lg:flex"
        onMouseLeave={() => setHoveredId(null)}
      >
      {/* ── Rail (72px) ── */}
      <div className="flex h-full w-[72px] flex-shrink-0 flex-col items-center gap-1 border-r border-[#e8e8e8] bg-white py-3">

        {/* Category icons */}
        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.id
          const isOpen = openId === cat.id
          const hasUnread = cat.id === 'comms' && unreadCount > 0

          return (
            <div
              key={cat.id}
              className="group relative"
              onMouseEnter={() => setHoveredId(cat.id)}
            >
              <button
                type="button"
                onClick={() => handleIconClick(cat.id)}
                className={`relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${
                  isActive ? 'bg-[#191919] text-white' : 'text-[#4a4a4a] hover:bg-[#f5f5f5]'
                }`}
                aria-label={cat.label}
              >
                {cat.icon}
                {hasUnread && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#b80f0a]" />
                )}
              </button>

              {/* Tooltip — only when flyout is not open for this category */}
              {!isOpen && (
                <span className="pointer-events-none absolute left-[52px] top-1/2 z-[60] -translate-y-1/2 whitespace-nowrap rounded-xl bg-[#191919] px-2.5 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {cat.label}
                </span>
              )}
            </div>
          )
        })}

        {/* ── User avatar (pinned to bottom) ── */}
        <div className="mt-auto">
          <div
            className="group relative"
            onMouseEnter={() => setHoveredId('user')}
          >
            <button
              type="button"
              onClick={() => handleIconClick('user')}
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
                  {initials}
                </span>
              )}
            </button>

            {/* Tooltip — only when user flyout is closed */}
            {!userFlyoutOpen && (
              <span className="pointer-events-none absolute left-[52px] top-1/2 z-[60] -translate-y-1/2 whitespace-nowrap rounded-xl bg-[#191919] px-2.5 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                {displayName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Flyout panel — nav category OR user account ── */}
      {(openCategory || userFlyoutOpen) && (
        <div className="flex h-full w-52 flex-col border-r border-[#e8e8e8] bg-white shadow-[4px_0_24px_rgba(0,0,0,0.08)]">
          {userFlyoutOpen ? (
            /* User account flyout */
            <>
              <div className="px-4 pb-3 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9a9a9a]">
                  Account
                </p>
                <div className="mt-2 flex items-center gap-2.5">
                  {avatarUrl ? (
                    <span
                      className="h-8 w-8 flex-shrink-0 rounded-full border border-[#dcdcdc] bg-[#f7f6f4] bg-cover bg-center"
                      style={{ backgroundImage: `url(${avatarUrl})` }}
                    />
                  ) : (
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#f5f5f5] text-xs font-bold text-[#191919]">
                      {initials}
                    </span>
                  )}
                  <p className="truncate text-sm font-semibold text-[#191919]">{displayName}</p>
                </div>
                <div className="mt-3 border-t border-[#e8e8e8]" />
              </div>

              <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
                {USER_LINKS.map((link) => {
                  const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
                  const isSignOut = link.href === '/logout'
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => { setPinnedId(null); setHoveredId(null) }}
                      className={`flex w-full items-center rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
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
                })}
              </nav>

              {!isCoachAthleteLaunch && (
                <div className="border-t border-[#e8e8e8] p-3">
                  <PortalRoleSwitcher currentPortal="coach" />
                </div>
              )}
            </>
          ) : openCategory ? (
            /* Nav category flyout */
            <>
              <div className="px-4 pb-3 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9a9a9a]">
                  Navigation
                </p>
                <p className="mt-1 text-base font-semibold text-[#191919]">{openCategory.label}</p>
                <div className="mt-3 border-t border-[#e8e8e8]" />
              </div>

              <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
                {openCategory.links.map((link) => {
                  const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
                  return (
                    <button
                      key={link.href}
                      type="button"
                      onClick={() => handleLinkClick(link.href)}
                      className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                        isActive ? 'bg-[#191919] text-white' : 'text-[#191919] hover:bg-[#f5f5f5]'
                      }`}
                    >
                      {link.label}
                    </button>
                  )
                })}
              </nav>
            </>
          ) : null}
        </div>
      )}
    </div>
    </>
  )
}
