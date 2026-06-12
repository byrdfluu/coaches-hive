import type { Metadata } from 'next'
import type React from 'react'
import AthleteProviders from './AthleteProviders'
import AthleteLayoutShell from './AthleteLayoutShell'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    default: 'Athlete Portal — Coaches Hive',
    template: '%s — Athlete Portal | Coaches Hive',
  },
  description: 'Book sessions, track your progress, and connect with top coaches.',
}

export default function AthleteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AthleteProviders>
      <AthleteLayoutShell>{children}</AthleteLayoutShell>
    </AthleteProviders>
  )
}
