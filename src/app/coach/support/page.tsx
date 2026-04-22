'use client'

import CoachSidebar from '@/components/CoachSidebar'
import PortalSupportDesk from '@/components/PortalSupportDesk'

export default function CoachSupportPage() {
  return <PortalSupportDesk bannerRole="coach" Sidebar={CoachSidebar} />
}
