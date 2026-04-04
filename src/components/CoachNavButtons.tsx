'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/coach/dashboard', label: 'Dashboard' },
  { href: '/coach/athletes', label: 'Athletes' },
  { href: '/coach/messages', label: 'Messaging' },
  { href: '/coach/marketplace', label: 'Marketplace' },
  { href: '/coach/settings', label: 'Settings' },
]

export default function CoachNavButtons() {
  const pathname = usePathname()

  return (
    <div className="flex flex-wrap justify-end gap-2 text-sm">
      {links.map((link) => {
        const isActive =
          pathname === link.href || pathname.startsWith(`${link.href}/`)

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full border px-4 py-2 font-semibold transition ${
              isActive
                ? 'border-[#191919] bg-[#191919] text-white'
                : 'border-[#191919] text-[#191919] hover:bg-[#e8e8e8]'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </div>
  )
}
