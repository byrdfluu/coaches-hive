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
    default: 'Coaches Hive — Youth Sports Organization Management Software',
    template: '%s — Coaches Hive',
  },
  icons: {
    icon: '/CH Favicon.png',
  },
  description: 'Built for youth sports organizations. Coaches Hive handles scheduling, payments, rosters, messaging, tryouts, and waivers — in one platform. Less admin. More coaching.',
  metadataBase: new URL(siteUrl),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Coaches Hive',
    title: 'Coaches Hive — Youth Sports Organization Management Software',
    description: 'Built for youth sports organizations. Coaches Hive handles scheduling, payments, rosters, messaging, tryouts, and waivers — in one platform. Less admin. More coaching.',
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
    title: 'Coaches Hive — Youth Sports Organization Management Software',
    description: 'Built for youth sports organizations. Coaches Hive handles scheduling, payments, rosters, messaging, tryouts, and waivers — in one platform. Less admin. More coaching.',
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
