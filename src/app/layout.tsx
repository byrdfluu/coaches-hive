import './globals.css'
import type { Metadata } from 'next'
import PostHogIdentify from '@/components/PostHogIdentify'
import AuthSessionRecovery from '@/components/AuthSessionRecovery'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import SessionGuard from '@/components/SessionGuard'

export const dynamic = 'force-dynamic'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://coacheshive.com'
const ogImage = '/og-home.jpg'

export const metadata: Metadata = {
  title: {
    default: 'Coaches Hive — One Connected Youth Sports Platform',
    template: '%s — Coaches Hive',
  },
  icons: {
    icon: '/CH Favicon.png',
  },
  description: 'Coaches Hive connects organizations, independent coaches, athletes, and families through scheduling, payments, communication, registrations, and digital documents.',
  metadataBase: new URL(siteUrl),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Coaches Hive',
    title: 'Coaches Hive — One Connected Youth Sports Platform',
    description: 'Organizations, independent coaches, athletes, and families manage youth sports together in one connected app.',
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
    title: 'Coaches Hive — One Connected Youth Sports Platform',
    description: 'Organizations, independent coaches, athletes, and families manage youth sports together in one connected app.',
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
      <body className="flex min-h-screen flex-col antialiased">
        <PostHogIdentify />
        <AuthSessionRecovery />
        <SessionGuard />
        <PublicHeader />
        <div className="flex-1">
          {children}
        </div>
        <PublicFooter />
      </body>
    </html>
  )
}
