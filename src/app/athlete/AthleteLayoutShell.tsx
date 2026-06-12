'use client'

import type React from 'react'
import { usePathname } from 'next/navigation'

const isSharedCoachProfileRoute = (pathname: string | null) => {
  return Boolean(pathname?.startsWith('/athlete/coaches/'))
}

export default function AthleteLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (isSharedCoachProfileRoute(pathname)) {
    return <>{children}</>
  }

  return <div className="portal-page portal-athlete">{children}</div>
}
