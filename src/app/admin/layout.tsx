import type { ReactNode } from 'react'
import PortalAppShell from '@/components/PortalAppShell'

export const dynamic = 'force-dynamic'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PortalAppShell portal="admin">{children}</PortalAppShell>
}
