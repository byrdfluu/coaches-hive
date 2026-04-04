'use client'

import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import { useParams } from 'next/navigation'
import CoachPublicProfileView from '@/components/CoachPublicProfileView'

export const dynamic = 'force-dynamic'

export default function AthleteCoachProfilePage() {
  const params = useParams()

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="min-w-0">
            <CoachPublicProfileView slug={String(params.slug || '')} />
          </div>
        </div>
      </div>
    </main>
  )
}
