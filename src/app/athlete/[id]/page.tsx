import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function PublicAthleteProfilePage() {
  // Athlete identities—especially minors—are never published on the open web.
  // Authenticated roster and relationship routes remain the only access path.
  notFound()
}
