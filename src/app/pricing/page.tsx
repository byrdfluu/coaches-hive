'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ALL_ACCESS_PRICING, formatUsdCents } from '@/lib/allAccessPricing'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

type Audience = 'families' | 'coaches' | 'organizations'
type Interval = 'month' | 'year'

const copy = {
  families: {
    label: 'Athletes & Families',
    title: 'One membership for the whole family.',
    monthly: ALL_ACCESS_PRICING.athlete.month,
    annual: ALL_ACCESS_PRICING.athlete.year,
    href: '/signup?role=athlete&tier=family_all_access',
    perks: [
      'Up to four athlete profiles',
      'Portable progress, training plans, and session notes',
      'Coach discovery, booking, payments, and marketplace access',
      'Parents and guardians are included',
      'Essential team schedules, notices, waivers, payments, and receipts remain accessible',
    ],
  },
  coaches: {
    label: 'Independent Coaches',
    title: 'Every coach feature. No athlete limits.',
    monthly: ALL_ACCESS_PRICING.coach.month,
    annual: ALL_ACCESS_PRICING.coach.year,
    href: '/signup?role=coach&tier=all_access',
    perks: [
      'Unlimited athletes',
      'Bookings, scheduling, messaging, and training plans',
      'Payments, payouts, marketplace, packages, and analytics',
      '10% platform fee on marketplace sales (capped at $75 per transaction)',
      'No Starter, Pro, or Elite feature restrictions',
      'Organization access is covered by the organization; independent businesses subscribe separately',
    ],
  },
  organizations: {
    label: 'Organizations',
    title: 'The complete organization portal.',
    monthly: ALL_ACCESS_PRICING.org.month,
    annual: ALL_ACCESS_PRICING.org.year,
    href: '/signup?role=org&tier=all_access',
    perks: [
      'One active seat included',
      `${formatUsdCents(ALL_ACCESS_PRICING.org.additionalCoach.month)}/month or ${formatUsdCents(ALL_ACCESS_PRICING.org.additionalCoach.year)}/year per additional active seat`,
      'Unlimited athletes, parents, and guardians',
      'Teams, scheduling, billing, compliance, reporting, permissions, and marketplace',
      '10% platform fee on marketplace sales (capped at $75 per transaction)',
      'Applicable organization payments are processed through Coaches Hive Payments',
    ],
  },
} as const

const faqs = [
  {
    q: 'What does All Access mean?',
    a: 'Every feature for your account type is included. Coaches Hive no longer separates core features into Starter, Pro, Elite, Standard, Growth, or Enterprise tiers.',
  },
  {
    q: 'How are organization seats billed?',
    a: 'The organization base includes one active seat. Each additional active member — coaches, assistant coaches, org admins, program directors, athletic directors, club admins, travel admins, school admins, and team managers — is $20/month or $200/year. Pending invitations are not charged. Active seats are billed until the member is removed.',
  },
  {
    q: 'Does an organization member also need an individual subscription?',
    a: 'Not for organization work. A coach needs an individual All Access subscription only when operating a separate independent coaching business.',
  },
  {
    q: 'How do transaction fees work?',
    a: 'Session payments have a 7% platform fee, reduced to 5% for qualifying high-volume sellers. Marketplace sales have a 10% platform fee capped at $75 per transaction. Standard Stripe processing is included.',
  },
  {
    q: 'Can organizations collect payments elsewhere?',
    a: 'Applicable registrations, sessions, dues, products, packages, subscriptions, and organization fees managed through Coaches Hive must use Coaches Hive Payments.',
  },
  {
    q: 'What can families access without All Access?',
    a: 'Essential organization schedules, safety announcements, required messages, waivers, required payments, and receipts remain accessible. All Access adds the portable premium athlete and family experience.',
  },
]

export default function PricingPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [audience, setAudience] = useState<Audience>('organizations')
  const [interval, setInterval] = useState<Interval>('year')
  useEffect(() => {
    const supabase = createClientComponentClient()
    void supabase.auth.getSession().then(({ data }) => setIsAuthenticated(Boolean(data.session)))
  }, [])
  const selected = copy[audience]
  const amount = interval === 'year' ? selected.annual : selected.monthly
  const role = audience === 'organizations' ? 'org_admin' : audience === 'coaches' ? 'coach' : 'athlete'
  const tier = audience === 'families' ? 'family_all_access' : 'all_access'
  const checkoutHref = isAuthenticated
    ? `/checkout?role=${role}&tier=${tier}&billing_interval=${interval}`
    : `${selected.href}&billing_interval=${interval}`

  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <header className="text-center">
          <p className="public-kicker">All Access pricing</p>
          <h1 className="public-title mt-2">Every feature. One clear plan.</h1>
          <p className="public-copy mx-auto mt-3 max-w-2xl">
            Choose monthly or annual billing. All applicable seller payments run through Coaches Hive, so the platform grows when you do.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {(Object.keys(copy) as Audience[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAudience(value)}
                className={`rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold ${
                  audience === value ? 'bg-[#191919] text-[#b80f0a]' : 'bg-white text-[#191919]'
                }`}
              >
                {copy[value].label}
              </button>
            ))}
          </div>
          <div className="mt-4 inline-flex rounded-full border border-[#191919] bg-white p-1">
            {(['month', 'year'] as Interval[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                className={`rounded-full px-5 py-2 text-sm font-semibold ${
                  interval === value ? 'bg-[#b80f0a] text-white' : 'text-[#191919]'
                }`}
              >
                {value === 'month' ? 'Monthly' : 'Annual · save 2 months'}
              </button>
            ))}
          </div>
        </header>

        <section className="mx-auto mt-10 max-w-2xl rounded-3xl border border-[#191919] bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">{selected.label}</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{selected.title}</h2>
          <p className="mt-5 text-4xl font-semibold text-[#191919]">
            {formatUsdCents(amount)}
            <span className="text-base font-normal text-[#4a4a4a]"> / {interval}</span>
          </p>
          {interval === 'year' ? (
            <p className="mt-1 text-sm font-semibold text-[#4a4a4a]">Two months free compared with monthly billing.</p>
          ) : null}
          <ul className="mt-6 space-y-3 text-sm text-[#191919]">
            {selected.perks.map((perk) => (
              <li key={perk} className="flex gap-3">
                <span className="text-[#b80f0a]">●</span><span>{perk}</span>
              </li>
            ))}
          </ul>
          <Link
            href={checkoutHref}
            className="mt-7 block rounded-full bg-[#191919] px-6 py-3 text-center text-sm font-semibold text-white"
          >
            Start All Access
          </Link>
        </section>

        <section className="mt-12">
          <h2 className="text-center text-2xl font-semibold text-[#191919]">Pricing questions</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {faqs.map((item) => (
              <details key={item.q} className="rounded-2xl border border-[#191919] bg-white p-5">
                <summary className="cursor-pointer font-semibold text-[#191919]">{item.q}</summary>
                <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
