'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'

type WaiverAthlete = {
  id: string
  name: string
  email?: string | null
}

type WaiverAssignment = {
  id: string
  athlete_id: string
  athlete_name: string
  athlete_email?: string | null
  status: string
  sent_at?: string | null
  signed_at?: string | null
  full_name?: string | null
}

type CoachWaiver = {
  id: string
  title: string
  body: string
  is_active: boolean
  created_at: string
  sent_count: number
  signed_count: number
  pending_count: number
  assignments: WaiverAssignment[]
}

const formatDate = (value?: string | null) => {
  if (!value) return 'Not signed'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function CoachWaiversPage() {
  const searchParams = useSearchParams()
  const preselectedAthleteId = searchParams.get('athlete_id') || ''
  const [athletes, setAthletes] = useState<WaiverAthlete[]>([])
  const [waivers, setWaivers] = useState<CoachWaiver[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [setupRequired, setSetupRequired] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([])
  const [expandedWaiverId, setExpandedWaiverId] = useState<string | null>(null)

  const loadWaivers = useCallback(async () => {
    setLoading(true)
    const response = await fetch('/api/coach/waivers')
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setNotice(payload.error || 'Unable to load waivers.')
      setLoading(false)
      return
    }
    setSetupRequired(Boolean(payload.setup_required))
    setAthletes(payload.athletes || [])
    setWaivers(payload.waivers || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadWaivers()
  }, [loadWaivers])

  useEffect(() => {
    if (preselectedAthleteId) setSelectedAthleteIds([preselectedAthleteId])
  }, [preselectedAthleteId])

  const totals = useMemo(() => {
    return waivers.reduce(
      (acc, waiver) => ({
        sent: acc.sent + waiver.sent_count,
        signed: acc.signed + waiver.signed_count,
        pending: acc.pending + waiver.pending_count,
      }),
      { sent: 0, signed: 0, pending: 0 },
    )
  }, [waivers])

  const toggleAthlete = (athleteId: string) => {
    setSelectedAthleteIds((prev) =>
      prev.includes(athleteId) ? prev.filter((id) => id !== athleteId) : [...prev, athleteId],
    )
  }

  const handleSendWaiver = async () => {
    setSaving(true)
    setNotice('')
    const response = await fetch('/api/coach/waivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body,
        athlete_ids: selectedAthleteIds,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setSetupRequired(Boolean(payload.setup_required))
      setNotice(payload.error || 'Unable to send waiver.')
      setSaving(false)
      return
    }
    setTitle('')
    setBody('')
    setSelectedAthleteIds(preselectedAthleteId ? [preselectedAthleteId] : [])
    setNotice(`Waiver sent to ${selectedAthleteIds.length} athlete${selectedAthleteIds.length === 1 ? '' : 's'}.`)
    setSaving(false)
    await loadWaivers()
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Waivers</p>
            <h1 className="display text-2xl font-semibold leading-[1.06] text-[#191919] sm:text-3xl">
              Send and track athlete waivers.
            </h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Create coach-specific waiver requests, send them to linked athletes, and monitor signatures.
            </p>
          </div>
          <Link
            href="/coach/athletes"
            className="rounded-full border border-[#191919] px-4 py-2 text-center text-sm font-semibold text-[#191919]"
          >
            View athletes
          </Link>
        </header>

        <div className="mt-6">
          <CoachSidebar />
          <div className="min-w-0 space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              {[
                { label: 'Sent', value: totals.sent },
                { label: 'Signed', value: totals.signed },
                { label: 'Pending', value: totals.pending },
              ].map((stat) => (
                <div key={stat.label} className="glass-card border border-[#191919] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
              ))}
            </section>

            {setupRequired && (
              <section className="glass-card border border-[#b80f0a] bg-white p-5 text-sm text-[#4a4a4a]">
                <p className="font-semibold text-[#191919]">Coach waiver tables are not installed yet.</p>
                <p className="mt-1">Run <span className="font-semibold text-[#191919]">supabase/coach_waivers.sql</span> in Supabase to enable coach-sent waivers.</p>
              </section>
            )}

            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-[#191919]">Create and send waiver</h2>
                <p className="text-sm text-[#4a4a4a]">The waiver appears in each selected athlete&apos;s waiver inbox.</p>
              </div>
              <div className="mt-4 grid gap-4">
                <div>
                  <label className="text-xs font-semibold text-[#4a4a4a]">Waiver title</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Private training participation waiver"
                    className="mt-1 w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#4a4a4a]">Waiver text</label>
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    rows={6}
                    placeholder="Enter the full waiver text athletes will review and sign."
                    className="mt-1 w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  />
                </div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[#4a4a4a]">Recipients</p>
                    <button
                      type="button"
                      onClick={() => setSelectedAthleteIds(athletes.map((athlete) => athlete.id))}
                      className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#191919]"
                    >
                      Select all
                    </button>
                  </div>
                  {athletes.length === 0 ? (
                    <p className="mt-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#4a4a4a]">
                      No linked athletes yet.
                    </p>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {athletes.map((athlete) => (
                        <label key={athlete.id} className="flex items-start gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedAthleteIds.includes(athlete.id)}
                            onChange={() => toggleAthlete(athlete.id)}
                            className="mt-1 h-4 w-4 accent-[#b80f0a]"
                          />
                          <span>
                            <span className="block font-semibold text-[#191919]">{athlete.name}</span>
                            {athlete.email ? <span className="block text-xs text-[#4a4a4a]">{athlete.email}</span> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {notice ? <p className="text-sm text-[#b80f0a]">{notice}</p> : null}
                <button
                  type="button"
                  onClick={handleSendWaiver}
                  disabled={saving || setupRequired}
                  className="w-full rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto sm:self-start"
                >
                  {saving ? 'Sending...' : 'Send waiver'}
                </button>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Sent waivers</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Track signatures and open signed records.</p>
                </div>
                <button
                  type="button"
                  onClick={loadWaivers}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  Refresh
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {loading ? (
                  <LoadingState label="Loading waivers..." />
                ) : waivers.length === 0 ? (
                  <EmptyState title="No coach waivers yet." description="Create and send your first waiver above." />
                ) : (
                  waivers.map((waiver) => {
                    const expanded = expandedWaiverId === waiver.id
                    return (
                      <div key={waiver.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[#191919]">{waiver.title}</p>
                            <p className="mt-1 text-xs text-[#4a4a4a]">
                              {waiver.signed_count}/{waiver.sent_count} signed · {waiver.pending_count} pending
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedWaiverId(expanded ? null : waiver.id)}
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                          >
                            {expanded ? 'Hide details' : 'View details'}
                          </button>
                        </div>
                        {expanded && (
                          <div className="mt-3 space-y-2">
                            {waiver.assignments.length === 0 ? (
                              <p className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#4a4a4a]">No recipients.</p>
                            ) : waiver.assignments.map((assignment) => (
                              <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dcdcdc] bg-white px-3 py-2">
                                <div>
                                  <p className="font-semibold text-[#191919]">{assignment.athlete_name}</p>
                                  <p className="text-xs text-[#4a4a4a]">
                                    {assignment.signed_at ? `Signed ${formatDate(assignment.signed_at)}` : `Sent ${formatDate(assignment.sent_at)}`}
                                  </p>
                                </div>
                                {assignment.signed_at ? (
                                  <a
                                    href={`/api/coach/waivers/assignments/${assignment.id}/signed-record`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                                  >
                                    Signed record
                                  </a>
                                ) : (
                                  <span className="rounded-full border border-[#b80f0a] px-3 py-1 text-xs font-semibold text-[#b80f0a]">
                                    Pending
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
