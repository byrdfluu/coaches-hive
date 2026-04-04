import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    default: 'Coach Portal — Coaches Hive',
    template: '%s — Coach Portal | Coaches Hive',
  },
  description: 'Manage your athletes, schedule sessions, track revenue, and grow your coaching business.',
}

export default function CoachLayout({ children }: { children: ReactNode }) {
  return <div className="portal-page portal-coach">{children}</div>
}
