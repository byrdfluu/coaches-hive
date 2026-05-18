import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import PracticePlanDetail from '@/components/PracticePlanDetail'

export default async function CoachPracticePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6">
          <CoachSidebar />
          <PracticePlanDetail planId={id} canUpload />
        </div>
      </div>
    </main>
  )
}
