import type { Metadata } from 'next'
import AthletePage from '@/app/athlete/page'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Youth Sports Software for Athletes and Parents',
  description: 'Find coaches, manage schedules, make payments, sign waivers, and track training in one place.',
  alternates: { canonical: '/athletes' },
}

export default function AthletesPage() {
  return <AthletePage />
}
