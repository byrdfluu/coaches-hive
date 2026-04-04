'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'

export default function ActiveAthletesPage() {
  const supabase = createClientComponentClient()
  const [loading, setLoading] = useState(true)
  const [activeCount, setActiveCount] = useState(0)
  const [newCount, setNewCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) { setLoading(false); return }

      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString()
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000).toISOString()

      const { data: sessions } = await supabase
        .from('sessions')
        .select('athlete_id, start_time')
        .eq('coach_id', userId)
        .gte('start_time', ninetyDaysAgo)
        .not('athlete_id', 'is', null)

      if (!active) return

      const rows = (sessions || []) as Array<{ athlete_id: string; start_time: string }>
      const allIds = new Set(rows.map((r) => r.athlete_id))
      const activeIds = new Set(rows.filter((r) => r.start_time >= thirtyDaysAgo).map((r) => r.athlete_id))

      // "New" = athletes whose earliest session with this coach is within the last 7 days
      const firstSessionByAthlete = new Map<string, string>()
      for (const r of rows) {
        const existing = firstSessionByAthlete.get(r.athlete_id)
        if (!existing || r.start_time < existing) firstSessionByAthlete.set(r.athlete_id, r.start_time)
      }
      const newIds = Array.from(allIds).filter((id) => {
        const first = firstSessionByAthlete.get(id)
        return first && first >= sevenDaysAgo
      })

      setTotalCount(allIds.size)
      setActiveCount(activeIds.size)
      setNewCount(newIds.length)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [supabase])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Roster insights</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Active athletes</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Breakdown of your current roster and engagement.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/coach/dashboard" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
              Back to dashboard
            </Link>
            <Link href="/coach/athletes" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]">
              Go to athletes
            </Link>
          </div>
        </header>

        {loading ? (
          <div className="mt-8 text-sm text-[#4a4a4a]">Loading roster data…</div>
        ) : totalCount === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] px-6 py-10 text-center text-sm text-[#4a4a4a]">
            No session data yet. Roster insights will appear once you have athletes booking sessions.
          </div>
        ) : (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { label: 'Active roster (last 30 days)', value: activeCount.toString() },
                { label: 'New this week', value: newCount.toString() },
                { label: 'Total (last 90 days)', value: totalCount.toString() },
              ].map((segment) => (
                <div key={segment.label} className="glass-card border border-[#191919] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{segment.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{segment.value}</p>
                </div>
              ))}
            </section>

            <section className="mt-10 glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-xl font-semibold text-[#191919]">Engagement highlights</h2>
              <p className="mt-2 text-sm text-[#4a4a4a]">
                {activeCount} of {totalCount} athletes booked a session in the last 30 days.
                {newCount > 0 && ` ${newCount} new athlete${newCount !== 1 ? 's' : ''} started this week.`}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/coach/retention"
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  View retention insights
                </Link>
                <Link
                  href="/coach/athletes"
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  View full roster
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
