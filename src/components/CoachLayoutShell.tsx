'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import PortalAppShell from '@/components/PortalAppShell'

const PUBLIC_COACH_ROUTES = new Set(['/coach'])

const isPublicCoachRoute = (pathname: string | null) => {
  if (!pathname) return false
  return PUBLIC_COACH_ROUTES.has(pathname)
}

export default function CoachLayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const publicRoute = isPublicCoachRoute(pathname)

  if (publicRoute) {
    return <>{children}</>
  }

  return <PortalAppShell portal="coach">{children}</PortalAppShell>
}
