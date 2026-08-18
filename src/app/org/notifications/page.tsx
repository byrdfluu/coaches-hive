import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import NotificationsPanel from '@/components/NotificationsPanel'
import NotificationPreferences from '@/components/NotificationPreferences'

export default function OrgNotificationsPage() {
  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-1">
          <div className="lg:hidden"><OrgSidebar /></div>
          <NotificationsPanel heading="Notifications" />
          <NotificationPreferences />
        </div>
      </div>
    </main>
  )
}
