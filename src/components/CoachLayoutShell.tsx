'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import CoachIconRail from '@/components/CoachIconRail'

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

  return (
    <div className="portal-page portal-coach">
      {/* Fixed 72px icon rail — desktop only, sits outside the scroll flow */}
      <CoachIconRail />
      {/* Offset page content past the fixed rail on desktop */}
      <div className="lg:pl-[72px]">
        {children}
      </div>
    </div>
  )
}
