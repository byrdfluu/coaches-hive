import './globals.css'
import type { Metadata } from 'next'
import PostHogIdentify from '@/components/PostHogIdentify'
import AuthSessionRecovery from '@/components/AuthSessionRecovery'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import SessionGuard from '@/components/SessionGuard'
import { launchSurface } from '@/lib/launchSurface'

export const dynamic = 'force-dynamic'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://coacheshive.com'
const ogImage = '/og-home.jpg'

export const metadata: Metadata = {
  title: {
    default: 'Coaches Hive',
    template: '%s — Coaches Hive',
  },
  description: launchSurface.publicOrgEntryPointsEnabled
    ? 'The all-in-one platform for coaches, athletes, and sports organizations. Book sessions, manage athletes, and grow your coaching business.'
    : 'The all-in-one platform for coaches and athletes. Book sessions, manage training, and grow your coaching business.',
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: 'website',
    siteName: 'Coaches Hive',
    title: 'Coaches Hive',
    description: launchSurface.publicOrgEntryPointsEnabled
      ? 'The all-in-one platform for coaches, athletes, and sports organizations.'
      : 'The all-in-one platform for coaches and athletes.',
    url: siteUrl,
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: 'Coaches Hive',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Coaches Hive',
    description: launchSurface.publicOrgEntryPointsEnabled
      ? 'The all-in-one platform for coaches, athletes, and sports organizations.'
      : 'The all-in-one platform for coaches and athletes.',
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="antialiased">
        <PostHogIdentify />
        <AuthSessionRecovery />
        <SessionGuard />
        <PublicHeader />
        {children}
        <PublicFooter />
      </body>
    </html>
  )
}
