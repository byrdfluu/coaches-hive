'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import PortalRoleSwitcher from '@/components/PortalRoleSwitcher'
import { isCoachAthleteLaunch } from '@/lib/launchSurface'

const links = [
  { href: '/coach/dashboard', label: 'Dashboard' },
  { href: '/coach/notifications', label: 'Notifications' },
  { href: '/coach/messages', label: 'Messaging' },
  { href: '/coach/notes', label: 'Notes' },
  { href: '/coach/marketplace', label: 'Marketplace' },
  { href: '/coach/programs', label: 'Programs' },
  { href: '/coach/memberships', label: 'Memberships' },
  { href: '/coach/calendar', label: 'Calendar' },
  { href: '/coach/athletes', label: 'Athletes' },
  { href: '/coach/waivers', label: 'Waivers' },
  { href: '/coach/reviews', label: 'Reviews' },
  { href: '/coach/orgs-teams', label: 'Orgs/Teams' },
  { href: '/coach/reports', label: 'Reports' },
  { href: '/coach/support', label: 'Support' },
  { href: '/coach/settings', label: 'Settings' },
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

// Mobile-only hamburger nav — desktop uses the fixed icon rail in coach/layout.tsx
export default function CoachSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const visibleLinks = isCoachAthleteLaunch
    ? links.filter((link) => link.href !== '/coach/orgs-teams')
    : links

  useEffect(() => {
    fetch('/api/notifications')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        const notifications = data.notifications || []
        setUnreadCount(notifications.filter((n: { read_at?: string | null }) => !n.read_at).length)
      })
      .catch(() => {})
  }, [])

  const activeLink = visibleLinks.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))

  return (
    <aside className="glass-card mb-4 min-w-0 w-full self-start overflow-hidden border border-[#191919] bg-white px-2.5 py-2.5 sm:px-3 sm:py-3 lg:hidden">
      <div className="space-y-3">
        <PortalRoleSwitcher currentPortal="coach" />

        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl px-3 py-3.5"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <span className="text-sm font-semibold text-[#191919]">{activeLink?.label ?? 'Menu'}</span>
            {open ? <CloseIcon /> : <HamburgerIcon />}
          </button>
          {open && (
            <nav className="mt-2 max-h-[70vh] space-y-1 overflow-y-auto pb-1 pr-1">
              {visibleLinks.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
                const showBadge = link.href === '/coach/notifications' && unreadCount > 0
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                      isActive ? 'bg-[#191919] text-white' : 'hover:bg-[#e8e8e8] text-[#191919]'
                    }`}
                  >
                    {link.label}
                    {showBadge && (
                      <span className="ml-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#b80f0a] px-1 text-[10px] font-bold text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
          )}
        </div>
      </div>
    </aside>
  )
}
