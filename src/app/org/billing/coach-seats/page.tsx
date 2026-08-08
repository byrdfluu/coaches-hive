'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import OrgSidebar from '@/components/OrgSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type SeatSummary = {
  activeCoachCount: number
  includedCoachCount: number
  additionalCoachCount: number
  monthlyCoachSeatAmount: number
  annualCoachSeatAmount: number
  billingInterval: 'month' | 'year'
  subscriptionStatus?: string | null
}

export default function OrgCoachSeatsPage() {
  const [summary, setSummary] = useState<SeatSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/org/billing/coach-seats')
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || 'Unable to load coach seats.')
        if (active) setSummary(payload)
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load coach seats.')
      })
    return () => { active = false }
  }, [])

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization billing</p>
          <h1 className="display mt-1 text-3xl font-semibold text-[#191919]">Organization coaches</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">
            Review coach access covered by your organization subscription.
          </p>
        </header>

        <div className="mt-6 lg:hidden"><OrgSidebar /></div>
        {error ? (
          <div className="mt-6 rounded-2xl border border-[#b80f0a] bg-white p-4 text-sm text-[#b80f0a]">{error}</div>
        ) : (
          <div className="mt-6 space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              <div className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-[#4a4a4a]">Active coaches</p>
                <p className="mt-2 text-3xl font-semibold text-[#191919]">{summary?.activeCoachCount ?? '…'}</p>
              </div>
              <div className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-[#4a4a4a]">Included coaches</p>
                <p className="mt-2 text-3xl font-semibold text-[#191919]">{summary?.includedCoachCount ?? '…'}</p>
              </div>
              <div className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-[#4a4a4a]">Additional charge</p>
                <p className="mt-2 text-3xl font-semibold text-[#191919]">$0</p>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-xl font-semibold text-[#191919]">Coach coverage</h2>
              <p className="mt-3 text-sm text-[#4a4a4a]">
                All organization coaches are included with Organization Starter and Organization Growth. Invitations, approvals, role changes, and removals do not change your subscription price.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/org/permissions" className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white">
                  Review coach approvals
                </Link>
                <Link href="/org/billing" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]">
                  Back to billing
                </Link>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">How access works</h2>
              <p className="mt-2 text-sm leading-6 text-[#4a4a4a]">
                Organization administrators can approve and manage coaches without a seat-charge confirmation. Coaches covered by the organization do not need an Independent Coach All Access subscription for organization work.
              </p>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
