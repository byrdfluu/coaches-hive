'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const links = [
  { href: '/guardian/dashboard', label: 'Dashboard' },
  { href: '/guardian/approvals', label: 'Approvals' },
  { href: '/guardian/settings', label: 'Settings' },
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

export default function GuardianSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const activeLink = links.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))

  return (
    <aside className="glass-card w-full self-start overflow-hidden border border-[#191919] bg-white px-3 py-3 lg:max-w-[200px]">
      {/* Mobile: hamburger toggle */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl px-2 py-1.5"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          <span className="text-sm font-semibold text-[#191919]">{activeLink?.label ?? 'Menu'}</span>
          {open ? <CloseIcon /> : <HamburgerIcon />}
        </button>
        {open && (
          <nav className="mt-2 space-y-1 pb-1">
            {links.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
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

      {/* Desktop: full vertical sidebar */}
      <nav className="hidden lg:block space-y-2 text-sm font-semibold text-[#191919]">
        {links.map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
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
    </aside>
  )
}
