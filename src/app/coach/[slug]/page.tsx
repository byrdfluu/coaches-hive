import CoachPublicProfileView from '@/components/CoachPublicProfileView'

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
  return <CoachPublicProfileView slug={String(slug || '')} refCode={ref} />
}
