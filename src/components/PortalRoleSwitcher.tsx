'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { isCoachAthleteLaunch } from '@/lib/launchSurface'

type PortalRoleSwitcherProps = {
  currentPortal: 'coach' | 'org'
}

const ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
]

export default function PortalRoleSwitcher({ currentPortal }: PortalRoleSwitcherProps) {
  const supabase = createClientComponentClient()
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [orgName, setOrgName] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const loadRoles = async () => {
      if (isCoachAthleteLaunch) {
        if (active) setShowSwitcher(false)
        return
      }
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

      const { data: memberships } = await supabase
        .from('organization_memberships')
        .select('org_id, role')
        .eq('user_id', userId)

      if (!active) return
      const isCoach = profile?.role === 'coach'
      const membershipRows = (memberships || []) as Array<{ org_id?: string | null; role?: string | null }>
      const adminMembership = membershipRows.find((membership) =>
        ADMIN_ROLES.includes(String(membership.role || '')),
      )
      const isOrgAdmin = Boolean(adminMembership?.org_id)

      if (!(isCoach && isOrgAdmin)) {
        setShowSwitcher(false)
        return
      }

      setShowSwitcher(true)

      if (adminMembership?.org_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', adminMembership.org_id)
          .maybeSingle()
        const orgRow = (org || null) as { name?: string | null } | null
        if (active) {
          setOrgName(orgRow?.name || null)
        }
      }
    }
    loadRoles()
    return () => {
      active = false
    }
  }, [supabase])

  if (isCoachAthleteLaunch) return null
  if (!showSwitcher) return null

  const target = currentPortal === 'coach'
    ? { href: '/org', label: 'Switch to Org Portal' }
    : { href: '/coach/dashboard', label: 'Switch to Coach Portal' }

  return (
    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-3 py-3 text-xs text-[#191919]">
      <p className="text-[10px] uppercase tracking-[0.3em] text-[#4a4a4a]">Role switch</p>
      <p className="mt-2 text-sm font-semibold text-[#191919]">
        {currentPortal === 'coach' ? 'Org admin access detected' : 'Coach access detected'}
      </p>
      {orgName ? (
        <p className="mt-1 text-xs text-[#4a4a4a]">Org: {orgName}</p>
      ) : (
        <p className="mt-1 text-xs text-[#4a4a4a]">You can switch between portals.</p>
      )}
      <Link
        href={target.href}
        className="mt-3 inline-flex w-full justify-center rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a] sm:w-auto"
      >
        {target.label}
      </Link>
    </div>
  )
}
