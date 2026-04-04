'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatShortDate } from '@/lib/dateUtils'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

type RevenueSource = {
  label: string
  count: number
  total: number
}

export default function CoachRevenuePage() {
  const supabase = createClientComponentClient()
  const [payouts, setPayouts] = useState<Array<{ date: string; amount: string; status: string }>>([])
  const [loading, setLoading] = useState(true)
  const [breakdownLoading, setBreakdownLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [breakdown, setBreakdown] = useState<RevenueSource[]>([])

  useEffect(() => {
    let active = true
    const loadPayouts = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) { setLoading(false); return }
      const { data: rows, error: payoutsError } = await supabase
        .from('coach_payouts')
        .select('id, amount, status, scheduled_for, paid_at, created_at')
        .eq('coach_id', userId)
        .order('created_at', { ascending: false })
        .limit(6)
      if (!active) return
      if (payoutsError) {
        setFetchError('Unable to load payout history. Please try refreshing.')
        setLoading(false)
        return
      }
      const next = (rows || []).map((row: any) => {
        const dateValue = row.paid_at || row.scheduled_for || row.created_at
        return {
          date: dateValue ? formatShortDate(new Date(dateValue)) : '—',
          amount: `$${Number(row.amount || 0).toFixed(2).replace(/\.00$/, '')}`,
          status: row.status || 'Scheduled',
        }
      })
      setPayouts(next)
      setLoading(false)
    }
    loadPayouts()
    return () => { active = false }
  }, [supabase])

  useEffect(() => {
    let active = true
    const loadBreakdown = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) { setBreakdownLoading(false); return }

      const [sessionRes, orderRes] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, session_type, status')
          .eq('coach_id', userId)
          .in('status', ['confirmed', 'completed']),
        supabase
          .from('orders')
          .select('id, amount, total, price')
          .eq('coach_id', userId),
      ])

      if (!active) return

      const sessions = (sessionRes.data || []) as Array<{ id: string; session_type?: string | null; status?: string }>
      const orders = (orderRes.data || []) as Array<{ id: string; amount?: number | null; total?: number | null; price?: number | null }>

      const marketplaceTotal = orders.reduce((sum, o) => sum + Number(o.total || o.amount || o.price || 0), 0)

      const sources: RevenueSource[] = [
        {
          label: 'Sessions',
          count: sessions.length,
          total: 0, // sessions table doesn't store price; shown as count only
        },
        {
          label: 'Marketplace',
          count: orders.length,
          total: marketplaceTotal,
        },
      ]

      setBreakdown(sources)
      setBreakdownLoading(false)
    }
    loadBreakdown()
    return () => { active = false }
  }, [supabase])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Revenue Insights</p>
            <h1 className="display text-3xl font-semibold md:text-4xl">Monthly revenue breakdown</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Snapshot of income streams and upcoming payouts.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/coach/settings#export-center"
              className="self-start rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Go to export center
            </Link>
            <a
              href="/coach/dashboard"
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Back to dashboard
            </a>
          </div>
        </header>

        {fetchError && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {fetchError}
          </div>
        )}

        <section className="mt-10 glass-card p-6">
          <h2 className="text-xl font-semibold">Upcoming payouts</h2>
          <p className="mt-2 text-sm text-[#6b5f55]">Scheduled coach payouts from the platform.</p>
          {loading ? (
            <div className="mt-6 text-sm text-[#6b5f55]">Loading payout history…</div>
          ) : payouts.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] px-4 py-6 text-center text-sm text-[#6b5f55]">
              No payout history yet. Payouts will appear here once processed.
            </div>
          ) : (
            <div className="mt-6 space-y-4 text-sm">
              {payouts.map((payout) => (
                <div
                  key={payout.date}
                  className="flex items-center justify-between rounded-2xl border border-[#ede3d7] bg-white px-4 py-4"
                >
                  <div>
                    <p className="font-semibold">{payout.date}</p>
                    <p className="text-[#6b5f55]">{payout.status}</p>
                  </div>
                  <span className="text-lg font-semibold">{payout.amount}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10 glass-card p-6">
          <h2 className="text-xl font-semibold">Revenue by source</h2>
          <p className="mt-2 text-sm text-[#6b5f55]">Breakdown of your income across all activity types.</p>
          {breakdownLoading ? (
            <div className="mt-6 text-sm text-[#6b5f55]">Loading breakdown…</div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {breakdown.map((source) => (
                <div
                  key={source.label}
                  className="rounded-2xl border border-[#ede3d7] bg-white px-5 py-4"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">{source.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">
                    {source.total > 0
                      ? `$${source.total.toFixed(2).replace(/\.00$/, '')}`
                      : `${source.count} ${source.count === 1 ? 'entry' : 'entries'}`}
                  </p>
                  {source.total > 0 && (
                    <p className="mt-1 text-xs text-[#6b5f55]">{source.count} order{source.count !== 1 ? 's' : ''}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/coach/reports"
              className="inline-flex rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white hover:opacity-80 transition-opacity"
            >
              Full reports
            </Link>
            <Link
              href="/coach/settings#export-center"
              className="inline-flex rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Export center
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
