import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    default: 'Organization Portal — Coaches Hive',
    template: '%s — Org Portal | Coaches Hive',
  },
  description: 'Manage your sports organization, teams, athletes, coaches, and compliance all in one place.',
}

export default function OrgLayout({ children }: { children: ReactNode }) {
  return <div className="portal-page portal-org">{children}</div>
}
