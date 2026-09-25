import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import GetTheAppButton from '@/components/GetTheAppButton'

export const metadata: Metadata = {
  title: 'Continue securely in Coaches Hive',
  description: 'Complete your secure account action in the Coaches Hive app.',
  robots: { index: false, follow: false },
}

const safeAppStoreUrl = (value?: string) => {
  if (!value) return null
  try {
    const url = new URL(value)
    const allowedHost = url.hostname === 'apps.apple.com' || url.hostname === 'testflight.apple.com'
    return url.protocol === 'https:' && allowedHost ? url.toString() : null
  } catch {
    return null
  }
}

export default function MobileAuthCallbackPage() {
  const appStoreUrl = safeAppStoreUrl(process.env.NEXT_PUBLIC_APP_STORE_URL?.trim())
  if (appStoreUrl) redirect(appStoreUrl)

  return (
    <main className="flex min-h-[72vh] items-center justify-center bg-[#e8e8e8] px-5 py-16">
      <section className="w-full max-w-2xl rounded-[32px] border border-black/10 bg-white px-6 py-12 text-center shadow-[0_24px_70px_rgba(25,25,25,0.12)] sm:px-12">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#b80f0a]">Secure account action</p>
        <h1 className="mt-4 text-4xl leading-tight text-[#191919] sm:text-5xl">Continue in Coaches Hive.</h1>
        <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-[#4a4a4a] sm:text-lg">
          If Coaches Hive is installed, reopen this email and tap its button to complete the action in the app. Otherwise, download the app first and then return to the original email.
        </p>
        <div className="mt-8 flex justify-center">
          <GetTheAppButton className="min-h-12 border-[#191919] px-8 py-3 text-base font-bold shadow-none" />
        </div>
      </section>
    </main>
  )
}
