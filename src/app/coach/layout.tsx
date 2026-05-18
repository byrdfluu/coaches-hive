import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import CoachIconRail from '@/components/CoachIconRail'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    default: 'Coach Portal — Coaches Hive',
    template: '%s — Coach Portal | Coaches Hive',
  },
  description: 'Manage your athletes, schedule sessions, track revenue, and grow your coaching business.',
}

export default function CoachLayout({ children }: { children: ReactNode }) {
  return (
    <div className="portal-page portal-coach">
      {/* Fixed 72px icon rail — desktop only, sits outside the scroll flow */}
      <CoachIconRail />
      {/* Offset page content past the fixed rail on desktop */}
      <div className="lg:pl-[72px]">
        {children}
      </div>
    </div>
  )
}
