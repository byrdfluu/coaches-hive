'use client'

import { usePathname, useRouter } from 'next/navigation'

type TestRole = 'coach' | 'athlete' | 'admin' | 'org'

const roles: Array<{ label: string; href: string; key: TestRole }> = [
  { label: 'Coach Portal', href: '/coach/dashboard', key: 'coach' },
  { label: 'Athlete Portal', href: '/athlete/dashboard', key: 'athlete' },
  { label: 'Admin', href: '/admin', key: 'admin' },
  { label: 'Org Portal', href: '/org', key: 'org' },
]

export default function RoleTestHeader() {
  const pathname = usePathname()
  const router = useRouter()

  const setTestRole = (role: TestRole, href: string) => {
    document.cookie = `ch_test_role=${role}; path=/; max-age=86400`
    document.cookie = `ch_test_mode=1; path=/; max-age=86400`
    router.push(href)
    router.refresh()
  }

  return (
    <div className="relative z-[90] flex flex-wrap items-center justify-between gap-3 border-b border-[#dcdcdc] bg-[#e8e8e8] px-4 py-3 text-xs text-[#191919] sm:px-6">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-[#dcdcdc] bg-white px-2 py-1 font-semibold uppercase tracking-[0.25em] text-[10px]">
          Test Mode
        </span>
        <span className="text-[#4a4a4a]">Switch role views</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {roles.map((role) => {
          const isActive =
            pathname === role.href || pathname.startsWith(`${role.href}/`)

          return (
            <button
              key={role.href}
              type="button"
              onClick={() => setTestRole(role.key, role.href)}
              className={`rounded-full px-3 py-2 font-semibold transition ${
                isActive
                  ? 'bg-[#191919] text-white'
                  : 'border border-[#dcdcdc] bg-white text-[#191919] hover:bg-[#f2f2f2]'
              }`}
            >
              {role.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
