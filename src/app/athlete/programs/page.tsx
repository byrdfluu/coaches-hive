'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AthleteSidebar from '@/components/AthleteSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import { createSafeClientComponentClient } from '@/lib/supabaseHelpers'
import { useAthleteProfile } from '@/components/AthleteProfileContext'

type Program = {
  id: string
  title: string
  description: string | null
  duration_label: string | null
  coach_name: string
  exercise_count: number
  thumbnail_path: string | null
}

type AssignedProgram = {
  id: string
  name: string
  type: string
  description?: string | null
  start_date?: string | null
  end_date?: string | null
  location?: string | null
  price_cents: number
  organization_name: string
  registration?: { id: string; status: string; registered_at?: string | null } | null
}

const BUCKET = 'product-media'

export default function AthleteProgramsPage() {
  const supabase = createSafeClientComponentClient()
  const { activeSubProfileId, activeAthleteLabel } = useAthleteProfile()
  const [programs, setPrograms] = useState<Program[]>([])
  const [assignedPrograms, setAssignedPrograms] = useState<AssignedProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [registeringId, setRegisteringId] = useState<string | null>(null)

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  useEffect(() => {
    let active = true
    if (!activeSubProfileId) return () => { active = false }
    Promise.all([
      fetch('/api/athlete/programs', { cache: 'no-store' }).then((res) => res.ok ? res.json() : null),
      fetch(`/api/athlete/org-programs?athlete_profile_id=${encodeURIComponent(activeSubProfileId)}`, { cache: 'no-store' })
        .then((res) => res.ok ? res.json() : null),
    ])
      .then(([trainingData, assignedData]) => {
        if (!active) return
        setPrograms(trainingData?.programs ?? [])
        setAssignedPrograms(assignedData?.programs ?? [])
        setLoading(false)
      })
      .catch(() => { if (active) { setNotice('Unable to load programs. Please try again.'); setLoading(false) } })
    return () => { active = false }
  }, [activeSubProfileId])

  const registerForProgram = async (program: AssignedProgram) => {
    if (!activeSubProfileId) return
    setRegisteringId(program.id)
    setNotice('')
    const response = await fetch('/api/athlete/org-programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ program_id: program.id, athlete_profile_id: activeSubProfileId }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setNotice(payload?.error || 'Unable to register for this program.')
      setRegisteringId(null)
      return
    }
    if (payload.checkout_required) {
      const checkoutResponse = await fetch('/api/mobile/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'program', record_id: payload.registration.id }),
      })
      const checkout = await checkoutResponse.json().catch(() => ({}))
      if (checkoutResponse.ok && checkout.checkout_url) {
        window.location.assign(checkout.checkout_url)
        return
      }
      setNotice(checkout?.error || 'Unable to start secure checkout.')
    } else {
      setAssignedPrograms((current) => current.map((item) => item.id === program.id
        ? { ...item, registration: payload.registration }
        : item))
      setNotice(`${activeAthleteLabel} is registered.`)
    }
    setRegisteringId(null)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="min-w-0 space-y-6">
            <header>
              <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Parent & Athlete Portal</p>
              <h1 className="display text-3xl font-semibold text-[#191919]">My Programs</h1>
              <p className="mt-1 text-sm text-[#6b5f55]">Assigned and purchased programs for {activeAthleteLabel}.</p>
            </header>

            {notice && <div className="rounded-2xl border border-[#d6d1cc] bg-white px-4 py-3 text-sm text-[#4a4a4a]">{notice}</div>}

            {loading ? (
              <LoadingState label="Loading programs…" />
            ) : programs.length === 0 && assignedPrograms.length === 0 ? (
              <EmptyState
                title="No programs yet."
                description="Assigned organization programs and purchased training programs will appear here."
                action={
                  <Link
                    href="/athlete/marketplace"
                    className="inline-flex items-center rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    Browse marketplace
                  </Link>
                }
              />
            ) : null}

            {!loading && assignedPrograms.length > 0 && (
              <section>
                <h2 className="display text-2xl font-semibold text-[#191919]">Organization programs</h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  {assignedPrograms.map((program) => {
                    const registered = program.registration?.status === 'paid' || program.registration?.status === 'active'
                    return (
                      <article key={program.id} className="glass-card border border-[#191919] bg-white p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">{program.type}</p>
                        <h3 className="mt-2 text-lg font-semibold text-[#191919]">{program.name}</h3>
                        <p className="mt-1 text-sm text-[#6b5f55]">{program.organization_name}</p>
                        {program.description && <p className="mt-3 line-clamp-3 text-sm text-[#4a4a4a]">{program.description}</p>}
                        <div className="mt-3 space-y-1 text-xs text-[#6b5f55]">
                          {program.start_date && <p>{new Date(`${program.start_date}T00:00:00`).toLocaleDateString()}</p>}
                          {program.location && <p>{program.location}</p>}
                          <p>{program.price_cents === 0 ? 'Free' : `$${(program.price_cents / 100).toFixed(2)}`}</p>
                        </div>
                        <button
                          type="button"
                          disabled={registered || registeringId === program.id}
                          onClick={() => void registerForProgram(program)}
                          className="mt-4 rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-50"
                        >
                          {registered ? 'Registered' : registeringId === program.id ? 'Starting…' : program.price_cents > 0 ? 'Register & pay' : 'Register'}
                        </button>
                      </article>
                    )
                  })}
                </div>
              </section>
            )}

            {!loading && programs.length > 0 && (
              <section>
                <h2 className="display text-2xl font-semibold text-[#191919]">Training programs</h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
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
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
