import type { Metadata } from 'next'
import LeaguePublicProfileClient from './LeaguePublicProfileClient'

export const metadata: Metadata = { title: 'League profile | Coaches Hive' }
export default async function LeaguePublicPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  return <LeaguePublicProfileClient leagueId={leagueId} />
}
