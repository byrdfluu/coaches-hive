'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { BillingInterval } from '@/lib/allAccessPricing'

const plans = [
  { key: 'team_starter', name: 'Single Team', monthly: 49, teams: '1 team', audience: 'For independent teams and coaches ready to replace scattered apps and spreadsheets.', features: ['1 active team','Up to 3 coaches and staff','Unlimited athletes and guardians','Complete team management tools','Payments, reporting, and development'] },
  { key: 'growing_organization', name: 'Growing Organization', monthly: 129, teams: '2–6 teams', popular: true, audience: 'For growing clubs, academies, and programs managing multiple teams.', inheritance: 'Everything in Single Team, plus:', features: ['2–6 active teams','Up to 15 coaches and staff','Organization-wide dashboard','Cross-team management and bulk imports','Staff permissions and organization reporting'] },
  { key: 'established_organization', name: 'Established Organization', monthly: 249, teams: '7–15 teams', audience: 'For established programs that need visibility, accountability, and control across departments.', inheritance: 'Everything in Growing Organization, plus:', features: ['7–15 active teams','Up to 35 coaches and staff','Advanced permissions and reporting','Compliance, audit history, and exports','Guided onboarding and priority support'] },
  { key: 'league_enterprise', name: 'League & Enterprise', monthly: 499, teams: '16+ teams', custom: true, audience: 'For leagues, schools, districts, and organizations operating at greater scale.', features: ['16+ teams with flexible staff limits','Multiple programs or divisions','Custom permissions and reporting','Data migration and dedicated onboarding','Custom payment-volume pricing'] },
] as const

const foundation = ['Athlete, coach, guardian, and organization portals','Secure messaging and announcements','Scheduling and attendance','Registrations and documents','Payments and balance tracking','Athlete evaluations and development','Mobile and web access','Secure role-based access']
const faqs = [
  ['Can I start with one team and upgrade later?','Yes. Your athletes, staff, messages, payments, and records remain in place when you upgrade.'],
  ['Do athletes and guardians pay for access?','No. Athlete and guardian access is included with the organization’s plan.'],
  ['What counts as an active team?','A team with an active roster, schedule, registration, or payment activity during the current season.'],
  ['Can schools or leagues use Coaches Hive?','Yes. Schools, leagues, districts, and larger organizations can receive customized team limits, onboarding, permissions, and reporting.'],
] as const

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>('month')
  return <main className="page-shell public-page"><div className="relative z-10 mx-auto max-w-7xl px-5 py-12 sm:px-6 sm:py-16">
    <header className="mx-auto max-w-4xl text-center">
      <p className="public-kicker">Organization pricing</p>
      <h1 className="public-title mt-3">Run every team from one place</h1>
      <p className="public-copy mx-auto mt-4 max-w-3xl">Rosters, scheduling, messaging, registrations, payments, documents, attendance, and athlete development, all connected in Coaches Hive.</p>
      <div className="mt-7 inline-flex rounded-full border border-[#191919] bg-white p-1" aria-label="Billing interval">
        <button type="button" onClick={() => setInterval('month')} className={`rounded-full px-5 py-2.5 text-sm font-semibold ${interval === 'month' ? 'bg-[#191919] text-white' : 'text-[#191919]'}`}>Monthly</button>
        <button type="button" onClick={() => setInterval('year')} className={`rounded-full px-5 py-2.5 text-sm font-semibold ${interval === 'year' ? 'bg-[#191919] text-white' : 'text-[#191919]'}`}>Annual <span className={interval === 'year' ? 'text-white/75' : 'text-[#b80f0a]'}>— Save 2 months</span></button>
      </div>
    </header>

    <section className="mt-12 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">{plans.map(plan => {
      const price = interval === 'month' ? plan.monthly : plan.monthly * 10
      return <article key={plan.key} className={`relative flex flex-col rounded-3xl bg-white p-6 shadow-sm ${'popular' in plan && plan.popular ? 'border-2 border-[#b80f0a]' : 'border border-[#191919]'}`}>
        {'popular' in plan && plan.popular ? <span className="absolute right-5 top-0 -translate-y-1/2 rounded-full bg-[#b80f0a] px-3 py-1 text-xs font-semibold text-white">Most Popular</span> : null}
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#b80f0a]">{plan.teams}</p><h2 className="mt-2 text-2xl font-semibold text-[#191919]">{plan.name}</h2>
        <p className="mt-5 text-3xl font-semibold text-[#191919]">{'custom' in plan && plan.custom ? 'Starting at ' : ''}${price.toLocaleString()}</p><p className="mt-1 text-sm text-[#4a4a4a]">{'custom' in plan && plan.custom ? 'or custom pricing' : `per ${interval === 'month' ? 'month' : 'year'}`}</p>
        <p className="mt-5 min-h-[72px] text-sm leading-6 text-[#4a4a4a]">{plan.audience}</p><p className="mt-5 text-sm font-semibold text-[#191919]">{'inheritance' in plan ? plan.inheritance : 'Includes:'}</p>
        <ul className="mt-4 space-y-3 text-sm text-[#191919]">{plan.features.map(feature => <li key={feature} className="flex gap-3"><span className="mt-0.5 text-[#b80f0a]">●</span><span>{feature}</span></li>)}</ul>
        <div className="mt-auto pt-7"><Link href={'custom' in plan && plan.custom ? '/contact?topic=enterprise' : `/signup?role=${plan.key === 'team_starter' ? 'coach' : 'org'}&tier=${plan.key}&billing_interval=${interval}`} className={`inline-flex w-full justify-center rounded-full px-5 py-3 text-sm font-semibold text-white ${'popular' in plan && plan.popular ? 'bg-[#b80f0a]' : 'bg-[#191919]'}`}>{'custom' in plan && plan.custom ? 'Contact Sales' : 'Start Free Trial'}</Link></div>
      </article>
    })}</section>

    <section className="mt-12 rounded-3xl border border-[#191919] bg-[#191919] px-6 py-9 text-white sm:px-10"><div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">Payments</p><h2 className="mt-2 text-3xl font-semibold">Simple, transparent payment pricing</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">Collect registration fees, team dues, payment plans, camps, and other charges directly through Coaches Hive.</p></div><div className="rounded-2xl border border-white/25 bg-white/10 px-6 py-5 lg:text-right"><p className="text-3xl font-semibold">4%</p><p className="mt-1 text-sm text-white/75">platform fee<br />for payments processed</p></div></div><p className="mt-5 text-sm text-white/75">High-volume organization? <Link href="/contact?topic=payment-volume" className="font-semibold text-white underline">Contact us for custom transaction pricing.</Link></p></section>

    <section className="mt-10 rounded-3xl border border-[#dcdcdc] bg-white p-7 sm:p-10"><div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]"><div><p className="public-kicker">Included in every plan</p><h2 className="mt-2 text-3xl font-semibold text-[#191919]">The complete Coaches Hive foundation</h2><p className="mt-4 text-sm leading-6 text-[#4a4a4a]">Higher plans unlock greater organizational scale, reporting, permissions, onboarding, and support—not basic functionality.</p></div><ul className="grid gap-3 sm:grid-cols-2">{foundation.map(feature => <li key={feature} className="flex gap-3 rounded-2xl border border-[#e2e2e2] bg-[#f7f6f4] p-4 text-sm font-semibold text-[#191919]"><span className="text-[#b80f0a]">●</span><span>{feature}</span></li>)}</ul></div></section>

    <section className="mx-auto mt-12 max-w-4xl"><div className="text-center"><p className="public-kicker">FAQ</p><h2 className="mt-2 text-3xl font-semibold text-[#191919]">Pricing questions, answered</h2></div><div className="mt-7 space-y-3">{faqs.map(([question,answer]) => <details key={question} className="group rounded-2xl border border-[#dcdcdc] bg-white p-5"><summary className="cursor-pointer list-none font-semibold text-[#191919]">{question}<span className="float-right text-[#b80f0a] group-open:rotate-45">+</span></summary><p className="mt-3 pr-8 text-sm leading-6 text-[#4a4a4a]">{answer}</p></details>)}</div></section>
  </div></main>
}
