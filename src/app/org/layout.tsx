import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import OrgSidebar from '@/components/OrgSidebar'
import PublicFooter from '@/components/PublicFooter'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    default: 'Organization Portal — Coaches Hive',
    template: '%s — Org Portal | Coaches Hive',
  },
  description: 'Manage your sports organization, teams, athletes, coaches, and compliance all in one place.',
}

export default function OrgLayout({ children }: { children: ReactNode }) {
  return (
    <div className="portal-page portal-org">
      <OrgSidebar desktop />
      <div className="flex min-h-screen flex-col lg:pl-[72px]">
        <div className="flex-1">
          {children}
        </div>
        <PublicFooter />
      </div>
    </div>
  )
}
