'use client'

import { useParams } from 'next/navigation'
import CoachPublicProfileView from '@/components/CoachPublicProfileView'

export const dynamic = 'force-dynamic'

export default function AthleteCoachProfilePage() {
  const params = useParams()

  return <CoachPublicProfileView slug={String(params.slug || '')} />
}
