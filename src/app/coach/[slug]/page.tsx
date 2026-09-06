import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function CoachPublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ ref?: string }>
}) {
  const { slug } = await params
  const { ref } = await searchParams
  const destination = `/coaches/${encodeURIComponent(String(slug || ''))}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`
  redirect(destination)
}
