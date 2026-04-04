'use client'

import { useEffect, useMemo, useState } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type AtRiskAthlete = {
  id: string
  name: string
  riskLevel: 'High' | 'Medium'
  reason: string
  lastSession: string
  missedSessions: number
}

export default function RetentionPage() {
  const supabase = createClientComponentClient()
  const [loading, setLoading] = useState(true)
  const [showAtRiskModal, setShowAtRiskModal] = useState(false)
  const [totalAthletes, setTotalAthletes] = useState(0)
  const [activeAthletes, setActiveAthletes] = useState(0)
  const [atRiskAthletes, setAtRiskAthletes] = useState<AtRiskAthlete[]>([])

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) { setLoading(false); return }

      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString()
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000).toISOString()

      const { data: recentSessions } = await supabase
        .from('sessions')
        .select('athlete_id, start_time, status')
        .eq('coach_id', userId)
        .gte('start_time', ninetyDaysAgo)
        .not('athlete_id', 'is', null)

      if (!active) return

      const sessions = (recentSessions || []) as Array<{ athlete_id: string; start_time: string; status?: string | null }>
      const allAthleteIds = Array.from(new Set(sessions.map((s) => s.athlete_id)))

      const activeIds = new Set(
        sessions
          .filter((s) => s.start_time >= thirtyDaysAgo)
          .map((s) => s.athlete_id)
      )

      const atRiskIds = allAthleteIds.filter((id) => !activeIds.has(id))

      setTotalAthletes(allAthleteIds.length)
      setActiveAthletes(activeIds.size)

      if (atRiskIds.length === 0) {
        setAtRiskAthletes([])
        setLoading(false)
        return
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', atRiskIds)
      if (!active) return

      const athleteProfiles = (profiles || []) as Array<{ id: string; full_name: string | null }>
      const profileMap = new Map(athleteProfiles.map((p) => [p.id, p.full_name || 'Athlete'] as const))

      const risk: AtRiskAthlete[] = atRiskIds.map((id) => {
        const athleteSessions = sessions.filter((s) => s.athlete_id === id)
        const sorted = [...athleteSessions].sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
        const lastDate = sorted[0]?.start_time ? new Date(sorted[0].start_time) : null
        const daysSince = lastDate ? Math.floor((now.getTime() - lastDate.getTime()) / 86400000) : 60
        const missed = athleteSessions.filter(
          (s) => s.start_time >= thirtyDaysAgo && (s.status === 'canceled' || s.status === 'no_show')
        ).length

        const riskLevel: AtRiskAthlete['riskLevel'] = daysSince >= 45 ? 'High' : 'Medium'
        return {
          id,
          name: profileMap.get(id) || 'Athlete',
          riskLevel,
          reason: `No sessions in last ${daysSince} days`,
          lastSession: lastDate
            ? lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—',
          missedSessions: missed,
        }
      }).sort((a, b) => (a.riskLevel === 'High' ? -1 : 1) - (b.riskLevel === 'High' ? -1 : 1))

      setAtRiskAthletes(risk)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [supabase])

  const retentionRate = totalAthletes > 0 ? Math.round((activeAthletes / totalAthletes) * 100) : null
  const churnRate = retentionRate !== null ? 100 - retentionRate : null
  const highRiskCount = useMemo(() => atRiskAthletes.filter((a) => a.riskLevel === 'High').length, [atRiskAthletes])

  const stats = retentionRate !== null
    ? [
        { key: 'current_rate', label: 'Current rate', value: `${retentionRate}%` },
        { key: 'thirty_day_churn', label: '30-day churn', value: `${churnRate}%` },
        { key: 'at_risk_athletes', label: 'At-risk athletes', value: String(atRiskAthletes.length) },
      ]
    : []

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Retention</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Retention overview</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">See who is sticking around and where to intervene.</p>
          </div>
          <a
            href="/coach/dashboard"
            className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
          >
            Back to dashboard
          </a>
        </header>

        {loading ? (
          <div className="mt-8 text-sm text-[#4a4a4a]">Loading retention data…</div>
        ) : totalAthletes === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] px-6 py-10 text-center text-sm text-[#4a4a4a]">
            No athlete session data yet. Retention insights will appear once you have completed sessions.
          </div>
        ) : (
          <>
            <section className="relative z-30 mt-8 grid gap-4 md:grid-cols-3">
              {stats.map((item) => {
                if (item.key === 'at_risk_athletes') {
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => setShowAtRiskModal(true)}
                      className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                    >
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-[#191919]">{item.value}</p>
                      <p className="mt-2 text-xs text-[#4a4a4a]">Click to view athlete risk details</p>
                    </button>
                  )
                }
                if (item.key === 'thirty_day_churn') {
                  return (
                    <div key={item.label} className="group relative glass-card border border-[#191919] bg-white p-5">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-[#191919]">{item.value}</p>
                      <div className="pointer-events-none absolute left-5 top-full z-[1400] mt-2 w-64 rounded-xl border border-[#191919] bg-white p-3 text-xs text-[#4a4a4a] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        Churn is the percentage of athletes who stopped booking sessions in the last 30 days.
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={item.label} className="glass-card border border-[#191919] bg-white p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-[#191919]">{item.value}</p>
                  </div>
                )
              })}
            </section>

            <section className="relative z-10 mt-10 glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-xl font-semibold text-[#191919]">Actions to improve retention</h2>
              <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
                {[
                  'Send follow-ups to athletes who missed 2+ sessions',
                  'Offer a discounted bundle to athletes nearing renewal',
                  'Share progress snapshots to keep active athletes engaged',
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {showAtRiskModal && (
        <div className="fixed inset-0 z-[1200] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 md:py-10">
          <div className="w-full max-w-3xl rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Retention risk</p>
                <h2 className="text-2xl font-semibold text-[#191919]">At-risk athletes</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">
                  Athletes with no recent sessions who may be disengaging.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAtRiskModal(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] text-lg font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close at-risk athletes modal"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-3">
                <p className="text-[11px] uppercase tracking-[0.3em] text-[#4a4a4a]">Total at risk</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{atRiskAthletes.length}</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-3">
                <p className="text-[11px] uppercase tracking-[0.3em] text-[#4a4a4a]">High risk</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{highRiskCount}</p>
              </div>
            </div>

            {atRiskAthletes.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] px-4 py-6 text-center text-sm text-[#4a4a4a]">
                No at-risk athletes detected.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {atRiskAthletes.map((athlete) => (
                  <div key={athlete.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base font-semibold text-[#191919]">{athlete.name}</p>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          athlete.riskLevel === 'High'
                            ? 'border-[#b80f0a] text-[#b80f0a]'
                            : 'border-[#191919] text-[#191919]'
                        }`}
                      >
                        {athlete.riskLevel} risk
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[#4a4a4a]">{athlete.reason}</p>
                    <div className="mt-3 grid gap-2 text-xs text-[#4a4a4a] md:grid-cols-2">
                      <p><span className="font-semibold text-[#191919]">Last session:</span> {athlete.lastSession}</p>
                      <p><span className="font-semibold text-[#191919]">Missed sessions:</span> {athlete.missedSessions}</p>
                    </div>
                    <a
                      href={`/coach/messages?new=${encodeURIComponent(athlete.name)}`}
                      className="mt-3 inline-flex rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Message athlete
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
