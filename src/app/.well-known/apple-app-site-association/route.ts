import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  const teamId = String(process.env.APPLE_TEAM_ID || '').trim()
  const bundleId = String(process.env.APNS_BUNDLE_ID || '').trim()
  const appIds = teamId && bundleId ? [`${teamId}.${bundleId}`] : []
  return NextResponse.json({ applinks: { apps: [], details: appIds.map((appID) => ({ appID, components: [
    { '/': '/coaches/*', comment: 'Public coach profiles' },
    { '/': '/organizations/*', comment: 'Public organization profiles' },
  ] })) } }, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } })
}
