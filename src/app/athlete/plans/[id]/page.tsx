export const dynamic = 'force-dynamic'

import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import PracticePlanDetail from '@/components/PracticePlanDetail'

export default function AthletePracticePlanPage({ params }: { params: { id: string } }) {
  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <PracticePlanDetail planId={params.id} canUpload={false} />
        </div>
      </div>
    </main>
  )
}
