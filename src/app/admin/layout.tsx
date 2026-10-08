import type { ReactNode } from 'react'
import AdminLayoutShell from '@/components/AdminLayoutShell'

export const dynamic = 'force-dynamic'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminLayoutShell>{children}</AdminLayoutShell>
}
