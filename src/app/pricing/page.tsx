'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ALL_ACCESS_PRICING, formatUsdCents, type BillingInterval } from '@/lib/allAccessPricing'

const plans = [
  { key: 'organization', name: 'Organization Plan', trialDays: 14, pricing: ALL_ACCESS_PRICING.org, features: ['Everything in the Individual Coach Plan', 'Unlimited active coach seats', 'Aggregated rosters across teams', 'Organization-wide payment reporting', 'Schedule overview across all teams and coaches', 'Tryout management'] },
  { key: 'individual_coach', name: 'Individual Coach Plan', trialDays: 7, pricing: ALL_ACCESS_PRICING.coach, features: ['Scheduling and calendar management', 'Roster and athlete management', 'Team and parent messaging', 'Digital waivers and signatures', 'Payment collection and reporting'] },
] as const

const athleteFeatures = [
  'Manage athlete profiles from one family dashboard',
  'View schedules, messages, and team updates',
  'Complete waivers and register for programs and tryouts',
  'Follow training plans, progress, and attendance',
  'Pay dues and event fees with payment history and receipts',
] as const

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>('month')
  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        <header className="text-center">
          <p className="public-kicker">Coaches Hive pricing</p>
          <h1 className="public-title mt-2">Simple access for every part of your program.</h1>
          <p className="public-copy mx-auto mt-3 max-w-2xl">Free for athletes and families, with full-access plans for coaches and organizations. All prices are in USD.</p>
          <div className="mt-6 inline-flex rounded-full border border-[#191919] bg-white p-1">
            {(['month', 'year'] as const).map((value) => <button key={value} type="button" onClick={() => setInterval(value)} className={`rounded-full px-5 py-2 text-sm font-semibold ${interval === value ? 'bg-[#b80f0a] text-white' : 'text-[#191919]'}`}>{value === 'month' ? 'Monthly' : 'Annual'}</button>)}
          </div>
        </header>
        <section className="mt-10 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const amount = plan.pricing[interval]
            return <article key={plan.key} className="flex flex-col rounded-3xl border border-[#191919] bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">{plan.name}</p>
              <p className="mt-5 text-4xl font-semibold text-[#191919]">{formatUsdCents(amount)}</p>
              <p className="mt-1 text-sm text-[#4a4a4a]">per {interval} after a {plan.trialDays}-day free trial</p>
              <ul className="mt-6 space-y-3 text-sm text-[#191919]">{plan.features.map((feature) => <li key={feature} className="flex gap-3"><span className="text-[#b80f0a]">●</span><span>{feature}</span></li>)}</ul>
              <div className="mb-2 mt-6 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-5 text-sm leading-6 text-[#191919]"><p className="font-semibold">Platform fees: 4% on payments processed</p></div>
              <Link href={`/signup?role=${plan.key === 'organization' ? 'org' : 'coach'}&tier=${plan.key}&billing_interval=${interval}`} className="mt-auto inline-flex w-full justify-center rounded-full border border-[#191919] bg-[#191919] px-6 py-3 text-sm font-semibold text-white">Start {plan.trialDays}-day free trial</Link>
            </article>
          })}
          <article className="flex flex-col rounded-3xl border border-[#191919] bg-white p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">Athlete &amp; Family Access</p>
            <p className="mt-5 text-4xl font-semibold text-[#191919]">Free Platform Access</p>
            <p className="mt-1 text-sm text-[#4a4a4a]">No monthly or annual subscription</p>
            <ul className="mt-6 space-y-3 text-sm text-[#191919]">{athleteFeatures.map((feature) => <li key={feature} className="flex gap-3"><span className="text-[#b80f0a]">●</span><span>{feature}</span></li>)}</ul>
            <Link href="/signup?role=athlete" className="mt-auto inline-flex w-full justify-center rounded-full border border-[#191919] bg-[#191919] px-6 py-3 text-sm font-semibold text-white">Create free account</Link>
          </article>
        </section>
      </div>
    </main>
  )
}
