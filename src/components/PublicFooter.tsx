'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'

export default function PublicFooter() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hideFooter = useMemo(
    () =>
      pathname.startsWith('/coach/')
      || pathname.startsWith('/athlete/')
      || pathname.startsWith('/admin')
      || (
        (pathname === '/select-plan' || pathname === '/checkout')
        && searchParams.get('portal') === 'coach'
      ),
    [pathname, searchParams]
  )

  if (hideFooter) {
    return null
  }

  return (
    <footer className="mx-4 mt-16 rounded-3xl border border-[#191919] bg-[#0e0e0e] px-5 py-10 text-sm text-[#e8e8e8] sm:mx-6 sm:px-8 sm:py-12 lg:mx-8">
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr_1fr]">
        <div className="space-y-6">
          <p className="text-2xl font-semibold text-white">Coaches Hive</p>
          <p className="max-w-sm text-sm text-[#cfcfcf]">
            Helping coaches, athletes, and organizations train better with one platform for
            coaching, communication, and operations.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-[#cfcfcf]">
            {[
              {
                label: 'Facebook',
                href: 'https://www.facebook.com/p/Coaches-Hive-61580610531535/',
                icon: (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                    <path
                      fill="currentColor"
                      d="M13.5 9.5H16V7h-2.5c-2 0-3.5 1.4-3.5 3.6V12H8v2.6h2v6h2.8v-6H15l.5-2.6h-2.7v-1.2c0-.8.4-1.3 1.4-1.3z"
                    />
                  </svg>
                ),
              },
              {
                label: 'X',
                href: 'https://x.com/coaches_hive?s=21',
                icon: (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                    <path
                      fill="currentColor"
                      d="M17.6 3h3l-6.6 7.5L21 21h-5.3l-4.2-5.4L6.7 21H3.6l7-8L3 3h5.4l3.8 5 5.4-5z"
                    />
                  </svg>
                ),
              },
              {
                label: 'Instagram',
                href: 'https://www.instagram.com/coacheshive?igsh=bjVrajF3ajBrMjZx&utm_source=qr',
                icon: (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                    <path
                      fill="currentColor"
                      d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm10 2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm5.2-2.6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"
                    />
                  </svg>
                ),
              },
              {
                label: 'LinkedIn',
                href: 'https://www.linkedin.com/company/coaches-hive/',
                icon: (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
                    <path
                      fill="currentColor"
                      d="M6.5 9H3.8v11h2.7V9zm-1.4-5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM20.2 20h-2.7v-5.6c0-1.4-.5-2.4-1.8-2.4-1 0-1.6.7-1.9 1.3-.1.2-.1.5-.1.8V20h-2.7V9h2.7v1.5c.4-.7 1.2-1.7 3-1.7 2.2 0 3.5 1.4 3.5 4.2V20z"
                    />
                  </svg>
                ),
              },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                aria-label={item.label}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#3a3a3a] text-white hover:border-white"
              >
                {item.icon}
              </a>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-semibold text-white">Platform</p>
          <div className="flex flex-col gap-2 text-sm text-[#cfcfcf]">
            <Link href="/pricing">Pricing</Link>
            <span className="relative inline-flex w-max cursor-default text-[#cfcfcf] group">
              Mobile App
              <span className="pointer-events-none absolute left-0 top-full mt-2 w-max rounded-full border border-[#3a3a3a] bg-[#0e0e0e] px-3 py-1 text-[10px] font-semibold text-[#cfcfcf] opacity-0 transition-opacity group-hover:opacity-100">
                Coming Soon
              </span>
            </span>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-semibold text-white">Support</p>
          <div className="flex flex-col gap-2 text-sm text-[#cfcfcf]">
            <Link href="/about">Contact Us</Link>
            <Link href="/safety">Safety Guidelines & Community Standards</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/refund">Refund Policy</Link>
          </div>
        </div>
      </div>
      <div className="mt-10 border-t border-[#2a2a2a] pt-6 text-xs text-[#9a9a9a]">
        © 2025 Coaches Hive. All rights reserved.
      </div>
    </footer>
  )
}
