'use client'

import { useParams } from 'next/navigation'
import CoachPublicProfileView from '@/components/CoachPublicProfileView'

export const dynamic = 'force-dynamic'

export default function CoachPublicProfilePage() {
  const params = useParams()
  return <CoachPublicProfileView slug={String(params.slug || '')} />
}
