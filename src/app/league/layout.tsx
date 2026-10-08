import type { ReactNode } from 'react'
import PortalAppShell from '@/components/PortalAppShell'

export const dynamic = 'force-dynamic'

export default function LeagueLayout({ children }: { children: ReactNode }) {
  return <PortalAppShell portal="league">{children}</PortalAppShell>
}
