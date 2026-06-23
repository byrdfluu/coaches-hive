'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

type ProgramRow = {
  id: string
  title: string
  description: string | null
  price_cents: number
  category: string
  sport: string | null
  seller: string
}

const formatCurrency = (cents: number) =>
  cents === 0 ? 'Free' : `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`

const categoryLabel = (cat: string) =>
  cat.charAt(0).toUpperCase() + cat.slice(1)

export default function ProgramsPage() {
  const searchParams = useSearchParams()
  const redirectToApp = searchParams?.get('redirect') === 'app'

  const [programs, setPrograms] = useState<ProgramRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const response = await fetch('/api/programs', { cache: 'no-store' })
      if (!active) return
      if (!response.ok) {
        setNotice('Unable to load programs.')
        setLoading(false)
        return
      }
      const payload = await response.json().catch(() => ({}))
      setPrograms((payload.programs || []) as ProgramRow[])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [])

  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {redirectToApp && (
          <div className="mb-4 rounded-2xl border border-[#191919] bg-[#191919] px-4 py-3 text-sm font-semibold text-white">
            Select a program to register — you'll return to the Coaches Hive app after payment.
          </div>
        )}

        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Coaches Hive</p>
          <h1 className="display mt-2 text-3xl font-semibold text-[#191919] sm:text-4xl">Programs & Events</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">Camps, clinics, leagues, and training programs from coaches and organizations.</p>
        </header>

        {notice && <p className="mb-4 text-sm text-[#b80f0a]">{notice}</p>}

        {loading ? (
          <LoadingState label="Loading programs..." />
        ) : programs.length === 0 ? (
          <EmptyState title="No programs available." description="Check back later for upcoming camps, clinics, and leagues." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((program) => (
              <Link
                key={program.id}
                href={`/programs/${program.id}/register${redirectToApp ? '?redirect=app' : ''}`}
                className="glass-card group flex flex-col border border-[#191919] bg-white p-5 transition hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full border border-[#e0e0e0] bg-[#f7f7f7] px-3 py-1 text-xs font-semibold text-[#4a4a4a]">
                    {categoryLabel(program.category)}
                  </span>
                  {program.sport && (
                    <span className="text-xs text-[#9a9a9a]">{program.sport}</span>
                  )}
                </div>
                <h2 className="mt-3 text-lg font-semibold text-[#191919] leading-tight">{program.title}</h2>
                {program.description && (
                  <p className="mt-2 flex-1 text-sm text-[#4a4a4a] line-clamp-3">{program.description}</p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-[#4a4a4a]">{program.seller}</p>
                  <span className="text-sm font-semibold text-[#191919]">{formatCurrency(program.price_cents)}</span>
                </div>
                <div className="mt-3">
                  <span className="inline-flex items-center rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white transition group-hover:opacity-90">
                    {program.price_cents === 0 ? 'Register free →' : 'Register →'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
