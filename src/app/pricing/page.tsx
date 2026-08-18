'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ALL_ACCESS_PRICING, formatUsdCents, type BillingInterval } from '@/lib/allAccessPricing'

const plans = [
  { key: 'individual_coach', name: 'Individual Coach Plan', trialDays: 7, pricing: ALL_ACCESS_PRICING.coach, features: ['Scheduling and calendar management', 'Roster and athlete management', 'Team and parent messaging', 'Digital waivers and signatures', 'Payment collection and reporting'] },
  { key: 'organization', name: 'Organization Plan', trialDays: 14, pricing: ALL_ACCESS_PRICING.org, features: ['Everything in the Individual Coach Plan', 'Invite and manage multiple coaches', 'Aggregated rosters across teams', 'Organization-wide payment reporting', 'Schedule overview across all teams and coaches', 'Tryout management'] },
] as const

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>('month')
  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        <header className="text-center">
          <p className="public-kicker">Coaches Hive pricing</p>
          <h1 className="public-title mt-2">Two plans. Full access. Clear fees.</h1>
          <p className="public-copy mx-auto mt-3 max-w-2xl">Choose the plan for your coaching business. All prices are in USD.</p>
          <div className="mt-6 inline-flex rounded-full border border-[#191919] bg-white p-1">
            {(['month', 'year'] as const).map((value) => <button key={value} type="button" onClick={() => setInterval(value)} className={`rounded-full px-5 py-2 text-sm font-semibold ${interval === value ? 'bg-[#b80f0a] text-white' : 'text-[#191919]'}`}>{value === 'month' ? 'Monthly' : 'Annual'}</button>)}
          </div>
        </header>
        <section className="mt-10 grid gap-6 md:grid-cols-2">
          {plans.map((plan) => {
            const amount = plan.pricing[interval]
            return <article key={plan.key} className="rounded-3xl border border-[#191919] bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">{plan.name}</p>
              <p className="mt-5 text-4xl font-semibold text-[#191919]">{formatUsdCents(amount)}</p>
              <p className="mt-1 text-sm text-[#4a4a4a]">per {interval} after a {plan.trialDays}-day free trial</p>
              <ul className="mt-6 space-y-3 text-sm text-[#191919]">{plan.features.map((feature) => <li key={feature} className="flex gap-3"><span className="text-[#b80f0a]">●</span><span>{feature}</span></li>)}</ul>
              <div className="mt-6 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-5 text-sm leading-6 text-[#191919]"><p className="font-semibold">Platform fees: 4% on payments processed</p></div>
              <Link href={`/signup?role=${plan.key === 'organization' ? 'org' : 'coach'}&tier=${plan.key}&billing_interval=${interval}`} className="mt-7 inline-flex w-full justify-center rounded-full border border-[#191919] bg-[#191919] px-6 py-3 text-sm font-semibold text-white">Start {plan.trialDays}-day free trial</Link>
            </article>
          })}
        </section>
      </div>
    </main>
  )
}
