import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

const association = {
  applinks: {
    apps: [],
    details: [{
      appID: 'YMHDXJZ674.com.coacheshive.mobile',
      components: [
        { '/': '/auth/mobile-callback', comment: 'Supabase PKCE callback' },
        { '/': '/auth/mobile-invite', comment: 'Mobile invitation callback' },
        { '/': '/auth/invite', comment: 'Invitation callback' },
        { '/': '/auth/confirm', comment: 'Email confirmation callback' },
        { '/': '/invite', comment: 'Public invitation callback' },
      ],
    }],
  },
}

export function GET() {
  return NextResponse.json(association, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
