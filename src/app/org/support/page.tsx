'use client'

import OrgSidebar from '@/components/OrgSidebar'
import PortalSupportDesk from '@/components/PortalSupportDesk'

export default function OrgSupportPage() {
  return <PortalSupportDesk bannerRole="admin" Sidebar={OrgSidebar} />
}
