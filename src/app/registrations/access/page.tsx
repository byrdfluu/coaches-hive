import type { Metadata } from 'next'
import RegistrationAccessClient from './RegistrationAccessClient'

export const metadata: Metadata = { title: 'Manage registrations', robots: { index: false, follow: false } }

export default async function RegistrationAccessPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams
  return <main className="min-h-[75vh] bg-[#f9f9f9] px-5 py-14"><section className="mx-auto max-w-2xl rounded-3xl border border-[#dcdcdc] bg-white p-7 shadow-sm sm:p-10"><p className="text-xs font-bold uppercase tracking-[0.28em] text-[#b80f0a]">Parent portal</p><h1 className="mt-3 text-4xl font-semibold">Manage registrations</h1><div className="mt-7">{token ? <RegistrationAccessClient token={token} /> : <p className="rounded-2xl bg-red-50 p-4 text-sm text-[#b80f0a]">This secure link is incomplete.</p>}</div></section></main>
}
