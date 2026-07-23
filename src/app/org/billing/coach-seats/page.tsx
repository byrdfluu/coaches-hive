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

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)

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

  const recurringTotal = summary
    ? summary.additionalCoachCount * (
        summary.billingInterval === 'year'
          ? summary.annualCoachSeatAmount
          : summary.monthlyCoachSeatAmount
      )
    : 0

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization billing</p>
          <h1 className="display mt-1 text-3xl font-semibold text-[#191919]">Coach seats</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">
            Review included and paid coach access. New paid seats are charged when an administrator approves a coach.
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
                <p className="text-xs uppercase tracking-[0.25em] text-[#4a4a4a]">Included seats</p>
                <p className="mt-2 text-3xl font-semibold text-[#191919]">{summary?.includedCoachCount ?? '…'}</p>
              </div>
              <div className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.25em] text-[#4a4a4a]">Paid additional seats</p>
                <p className="mt-2 text-3xl font-semibold text-[#191919]">{summary?.additionalCoachCount ?? '…'}</p>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-xl font-semibold text-[#191919]">Current coach-seat billing</h2>
              <p className="mt-3 text-sm text-[#4a4a4a]">
                One active coach is included. Each additional active coach costs $19/month or $190/year and follows your organization&apos;s billing interval.
              </p>
              {summary && (
                <div className="mt-5 rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-[#4a4a4a]">
                      {summary.additionalCoachCount} × {money(summary.billingInterval === 'year' ? summary.annualCoachSeatAmount : summary.monthlyCoachSeatAmount)}
                      /{summary.billingInterval === 'year' ? 'year' : 'month'}
                    </span>
                    <span className="text-xl font-semibold text-[#191919]">
                      {money(recurringTotal)}/{summary.billingInterval === 'year' ? 'year' : 'month'}
                    </span>
                  </div>
                </div>
              )}
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
              <h2 className="text-lg font-semibold text-[#191919]">How payment works</h2>
              <p className="mt-2 text-sm leading-6 text-[#4a4a4a]">
                Approving a coach shows the exact prorated Stripe charge before payment. After confirmation, Coaches Hive charges the organization&apos;s saved payment method and activates the coach only after the billing update succeeds. There is no outside-payment option.
              </p>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
