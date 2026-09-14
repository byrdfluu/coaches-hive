import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  // These are the checked-in signing identifiers for the production iOS app.
  // Environment variables may override them for a separately signed deployment,
  // but a missing Vercel variable must never silently disable Universal Links.
  const teamId = String(process.env.APPLE_TEAM_ID || 'YMHDXJZ674').trim()
  const bundleId = String(process.env.APNS_BUNDLE_ID || 'com.coacheshive.mobile').trim()
  const appIds = [`${teamId}.${bundleId}`]
  return NextResponse.json({ applinks: { apps: [], details: appIds.map((appID) => ({ appID, components: [
    { '/': '/coaches/*', comment: 'Public coach profiles' },
    { '/': '/organizations/*', comment: 'Public organization profiles' },
    { '/': '/open-app*', comment: 'Authenticated app handoff' },
    { '/': '/payment/complete*', comment: 'Server-authoritative payment return' },
  ] })) } }, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } })
}
