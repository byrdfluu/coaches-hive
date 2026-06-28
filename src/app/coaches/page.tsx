import type { Metadata } from 'next'
import CoachPage from '@/app/coach/page'

export const metadata: Metadata = {
  title: 'Coaching Software for Youth Sports Coaches',
  description: 'Manage scheduling, athletes, payments, messaging, and training from one coaching platform.',
  alternates: { canonical: '/coaches' },
}

export default function CoachesPage() {
  return <CoachPage />
}
