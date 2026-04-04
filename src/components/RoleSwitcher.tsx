'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isCoachAthleteLaunch } from '@/lib/launchSurface'

type RolePayload = {
  base_role: string | null
  active_role: string | null
  roles: string[]
}

const roleLabels: Record<string, { label: string; href: string }> = {
  coach: { label: 'Coach view', href: '/coach/dashboard' },
  athlete: { label: 'Athlete view', href: '/athlete/dashboard' },
  admin: { label: 'Admin view', href: '/admin' },
  org_admin: { label: 'Org view', href: '/org' },
  school_admin: { label: 'Org view', href: '/org' },
  club_admin: { label: 'Org view', href: '/org' },
  travel_admin: { label: 'Org view', href: '/org' },
  athletic_director: { label: 'Org view', href: '/org' },
  program_director: { label: 'Org view', href: '/org' },
  team_manager: { label: 'Org view', href: '/org' },
}

const resolveLabel = (role: string) => roleLabels[role] || { label: role, href: '/' }

export default function RoleSwitcher({ hideOrgOptions = false }: { hideOrgOptions?: boolean }) {
  const router = useRouter()
  const [payload, setPayload] = useState<RolePayload | null>(null)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      const response = await fetch('/api/roles/available')
      if (!response.ok) return
      const data = await response.json()
      if (!active) return
      setPayload(data)
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const roleOptions = useMemo(() => {
    if (!payload?.roles?.length) return []
    const grouped = new Map<string, { role: string; label: string; href: string; roles: string[] }>()
    for (const role of payload.roles) {
      if (!role || !roleLabels[role]) continue
      if (hideOrgOptions && roleLabels[role]?.href === '/org') continue
      if (isCoachAthleteLaunch && roleLabels[role]?.href === '/org') continue
      const resolved = resolveLabel(role)
      const groupKey = `${resolved.label}:${resolved.href}`
      const existing = grouped.get(groupKey)
      if (existing) {
        if (!existing.roles.includes(role)) {
          existing.roles.push(role)
        }
        continue
      }
      grouped.set(groupKey, {
        role,
        label: resolved.label,
        href: resolved.href,
        roles: [role],
      })
    }
    return Array.from(grouped.values())
  }, [hideOrgOptions, payload])

  const activeRole = payload?.active_role || payload?.base_role || ''

  if (roleOptions.length <= 1) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full border border-[#dcdcdc] bg-white px-3 py-2 text-xs font-semibold text-[#191919]">
      <span className="text-[11px] uppercase tracking-[0.3em] text-[#6b5f55]">View</span>
      {roleOptions.map((option) => (
        <button
          key={option.role}
          type="button"
          disabled={switching}
          onClick={async () => {
            const nextRole = option.roles.includes(activeRole) ? activeRole : option.role
            if (option.roles.includes(activeRole)) return
            setSwitching(true)
            const response = await fetch('/api/roles/active', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: nextRole }),
            })
            setSwitching(false)
            if (!response.ok) return
            router.push(option.href)
            router.refresh()
          }}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            option.roles.includes(activeRole)
              ? 'bg-[#191919] text-white'
              : 'border border-[#191919] text-[#191919] hover:bg-[#191919] hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
