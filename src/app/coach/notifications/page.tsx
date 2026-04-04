import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import NotificationsPanel from '@/components/NotificationsPanel'

export default function CoachNotificationsPage() {
  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <NotificationsPanel heading="Notifications" />
        </div>
      </div>
    </main>
  )
}
