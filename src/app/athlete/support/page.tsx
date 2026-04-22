'use client'

import AthleteSidebar from '@/components/AthleteSidebar'
import PortalSupportDesk from '@/components/PortalSupportDesk'

export default function AthleteSupportPage() {
  return <PortalSupportDesk bannerRole="athlete" Sidebar={AthleteSidebar} />
}
