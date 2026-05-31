'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AthleteSidebar from '@/components/AthleteSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import { createSafeClientComponentClient } from '@/lib/supabaseHelpers'

type Program = {
  id: string
  title: string
  description: string | null
  duration_label: string | null
  coach_name: string
  exercise_count: number
  thumbnail_path: string | null
}

const BUCKET = 'product-media'

export default function AthleteProgramsPage() {
  const supabase = createSafeClientComponentClient()
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  useEffect(() => {
    let active = true
    fetch('/api/athlete/programs')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (active) { setPrograms(data?.programs ?? []); setLoading(false) } })
      .catch(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="min-w-0 space-y-6">
            <header>
              <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Athlete Portal</p>
              <h1 className="display text-3xl font-semibold text-[#191919]">My Programs</h1>
              <p className="mt-1 text-sm text-[#6b5f55]">Training programs you&apos;ve purchased.</p>
            </header>

            {loading ? (
              <LoadingState label="Loading programs…" />
            ) : programs.length === 0 ? (
              <EmptyState
                title="No programs yet."
                description="Purchase a training program from the marketplace to get started."
                action={
                  <Link
                    href="/athlete/marketplace"
                    className="inline-flex items-center rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    Browse marketplace
                  </Link>
                }
              />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {programs.map((program) => (
                  <div
                    key={program.id}
                    className="glass-card flex flex-col overflow-hidden border border-[#191919] bg-white"
                  >
                    {program.thumbnail_path ? (
                      <img
                        src={getPublicUrl(program.thumbnail_path)}
                        alt={program.title}
                        className="h-40 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-40 w-full items-center justify-center bg-[#f5f5f5] text-4xl">
                        🏋️
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-5">
                      <p className="font-semibold text-[#191919]">{program.title}</p>
                      <p className="mt-0.5 text-xs text-[#6b6b6b]">by {program.coach_name}</p>
                      {program.duration_label && (
                        <p className="mt-1 text-xs text-[#6b6b6b]">{program.duration_label}</p>
                      )}
                      <p className="mt-1 text-xs text-[#6b6b6b]">
                        {program.exercise_count} exercise{program.exercise_count !== 1 ? 's' : ''}
                      </p>
                      {program.description && (
                        <p className="mt-2 line-clamp-2 text-sm text-[#4a4a4a]">{program.description}</p>
                      )}
                      <div className="mt-4">
                        <Link
                          href={`/athlete/programs/${program.id}`}
                          className="rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-80"
                        >
                          Start training →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
