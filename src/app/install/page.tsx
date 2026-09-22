import type { Metadata } from 'next'
import Link from 'next/link'
import PwaInstallButton from './PwaInstallButton'

export const metadata: Metadata = { title: 'Install Coaches Hive', description: 'Install the Coaches Hive web app on this device.' }

const safeOrgSlug = (value: string | string[] | undefined) => {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate && /^[a-z0-9][a-z0-9-]{0,127}$/i.test(candidate) ? candidate : ''
}

export default async function InstallPage({ searchParams }: { searchParams?: Promise<{ org?: string | string[] }> }) {
  const params = await searchParams
  const orgSlug = safeOrgSlug(params?.org)
  const browseHref = orgSlug ? `/organizations/${encodeURIComponent(orgSlug)}` : '/organizations'

  return (
    <main className="min-h-[75vh] bg-[#f9f9f9] px-5 py-14">
      <section className="mx-auto max-w-xl rounded-3xl border border-[#dcdcdc] bg-white p-7 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#b80f0a]">Android and web access</p>
        <h1 className="mt-3 text-4xl font-semibold text-[#191919]">Install Coaches Hive</h1>
        <p className="mt-4 leading-7 text-[#4a4a4a]">Add Coaches Hive to your home screen for quick access to organization profiles, registrations, waivers, and payments.</p>
        <div className="mt-7"><PwaInstallButton /></div>
        <Link href={browseHref} className="mt-5 inline-flex text-sm font-semibold text-[#b80f0a] underline">
          {orgSlug ? 'Continue to this organization without installing' : 'Browse organizations without installing'}
        </Link>
      </section>
    </main>
  )
}
