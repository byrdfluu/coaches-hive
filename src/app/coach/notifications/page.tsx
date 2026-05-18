import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import NotificationsPanel from '@/components/NotificationsPanel'

export default function CoachNotificationsPage() {
  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6">
          <CoachSidebar />
          <NotificationsPanel heading="Notifications" />
        </div>
      </div>
    </main>
  )
}
