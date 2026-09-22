import Link from 'next/link'

export default function OfflinePage() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-[#f9f9f9] px-5 py-16">
      <section className="w-full max-w-lg rounded-3xl border border-[#dcdcdc] bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#b80f0a]">You are offline</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#191919]">Reconnect to continue</h1>
        <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">Registration, waiver signing, and payments require an internet connection so your information is saved securely.</p>
        <Link href="/organizations" className="mt-6 inline-flex rounded-full bg-[#191919] px-6 py-3 text-sm font-semibold text-white">Try again</Link>
      </section>
    </main>
  )
}
