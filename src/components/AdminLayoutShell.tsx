'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import PortalAppShell from '@/components/PortalAppShell'

export default function AdminLayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/admin/login') return <>{children}</>

  return <PortalAppShell portal="admin">{children}</PortalAppShell>
}
