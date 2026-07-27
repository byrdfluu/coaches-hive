import type { Metadata } from 'next'
import GetTheAppButton from '@/components/GetTheAppButton'
import AppStoreQrCode from './AppStoreQrCode'
import OpenAppButton from './OpenAppButton'

export const metadata: Metadata = {
  title: 'Open Coaches Hive',
  description: 'Continue in your Coaches Hive portal or download the mobile app.',
  robots: {
    index: false,
    follow: false,
  },
}

const safeDestination = (value?: string) => {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  return value.slice(0, 300)
}

const safeAppStoreUrl = (value?: string) => {
  if (!value) return null
  try {
    const url = new URL(value)
    const isAppleDownloadHost = url.hostname === 'apps.apple.com' || url.hostname === 'testflight.apple.com'
    if (url.protocol !== 'https:' || !isAppleDownloadHost) return null
    return url.toString()
  } catch {
    return null
  }
}

export default async function OpenAppPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; reason?: string }>
}) {
  const params = await searchParams
  const destination = safeDestination(params.from)
  const appStoreUrl = safeAppStoreUrl(process.env.NEXT_PUBLIC_APP_STORE_URL?.trim())

  return (
    <main className="flex min-h-[72vh] items-center justify-center bg-[#e8e8e8] px-5 py-16">
      <section className="w-full max-w-2xl rounded-[32px] border border-black/10 bg-white px-6 py-12 text-center shadow-[0_24px_70px_rgba(25,25,25,0.12)] sm:px-12">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#b80f0a]">Coaches Hive Mobile</p>
        <h1 className="mt-4 text-5xl leading-none text-[#191919] sm:text-6xl">Continue in the app.</h1>
        <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-[#4a4a4a] sm:text-lg">
          Coaching, team management, schedules, messages, and account settings live in the Coaches Hive iPhone app.
        </p>
        {appStoreUrl ? <AppStoreQrCode appStoreUrl={appStoreUrl} /> : null}

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <OpenAppButton destination={destination} appStoreUrl={appStoreUrl} />
          <GetTheAppButton className="min-h-12 border-[#191919] px-8 py-3 text-base font-bold shadow-none" />
        </div>
      </section>
    </main>
  )
}
