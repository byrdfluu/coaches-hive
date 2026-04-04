'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const links = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/support', label: 'Support' },
  { href: '/admin/operations', label: 'Operations' },
  { href: '/admin/uptime', label: 'Uptime' },
  { href: '/admin/payouts', label: 'Payouts' },
  { href: '/admin/disputes', label: 'Disputes' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/revenue', label: 'Revenue + Churn' },
  { href: '/admin/verifications', label: 'Verifications' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/guardian-approvals', label: 'Guardian approvals' },
  { href: '/admin/waivers', label: 'Waivers' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/orgs', label: 'Orgs' },
  { href: '/admin/coaches', label: 'Coaches' },
  { href: '/admin/athletes', label: 'Athletes' },
  { href: '/admin/guardian-links', label: 'Guardian links' },
  { href: '/admin/automations', label: 'Automations' },
  { href: '/admin/playbook', label: 'Playbook' },
  { href: '/admin/audit', label: 'Audit log' },
  { href: '/admin/org-audit', label: 'Org activity' },
  { href: '/admin/retention', label: 'Data retention' },
  { href: '/admin/debug', label: 'Debug' },
  { href: '/admin/settings', label: 'Settings' },
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

export default function AdminSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const activeLink = links.find((link) =>
    link.href === '/admin'
      ? pathname === link.href
      : pathname === link.href || pathname.startsWith(`${link.href}/`)
  )

  return (
    <aside className="glass-card w-full self-start overflow-hidden border border-[#191919] bg-white px-3 py-3 lg:max-w-[200px]">
      <div className="space-y-3">
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center justify-between rounded-xl px-2 py-1.5"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <span className="text-sm font-semibold text-[#191919]">{activeLink?.label ?? 'Menu'}</span>
            {open ? <CloseIcon /> : <HamburgerIcon />}
          </button>
          {open && (
            <nav className="mt-2 max-h-[60vh] space-y-1 overflow-y-auto pb-1 pr-1">
              {links.map((link) => {
                const isDashboard = link.href === '/admin'
                const isActive = isDashboard
                  ? pathname === link.href
                  : pathname === link.href || pathname.startsWith(`${link.href}/`)

                return (
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
                )
              })}
            </nav>
          )}
        </div>

        <nav className="hidden lg:block space-y-2 text-sm font-semibold text-[#191919]">
          {links.map((link) => {
            const isDashboard = link.href === '/admin'
            const isActive = isDashboard
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(`${link.href}/`)

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center rounded-2xl px-3 py-3 transition ${
                  isActive ? 'bg-[#191919] text-white' : 'hover:bg-[#e8e8e8] text-[#191919]'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
