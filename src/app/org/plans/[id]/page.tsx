import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import PracticePlanDetail from '@/components/PracticePlanDetail'

export default async function OrgPracticePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-1">
          <OrgSidebar />
          <PracticePlanDetail planId={id} canUpload={false} />
        </div>
      </div>
    </main>
  )
}
