'use client'

import { useEffect, useState } from 'react'
import GetTheAppButton from '@/components/GetTheAppButton'
import { ALL_ACCESS_PRICING, formatUsdCents } from '@/lib/allAccessPricing'

type Audience = 'families' | 'coaches' | 'organizations'
type Interval = 'month' | 'year'
const audienceOrder: Audience[] = ['organizations', 'coaches', 'families']

const organizationPlans = {
  org_starter: {
    title: 'Organization Starter',
    perks: [
      'Up to 5 coaches and 50 athletes',
      'All coaches included—no per-coach subscription charges',
      'Teams, rosters, schedules, and messaging',
      'Program registrations and payments',
      'Organization dues and fee collection',
      'Digital waivers and required forms',
      'Electronic signatures',
      'Basic document assignment and completion tracking',
      'Basic reporting and payment records',
      'Stripe Connect payouts',
      '14-day free trial for eligible new organizations',
    ],
  },
  org_growth: {
    title: 'Organization Growth',
    perks: [
      'Everything in Organization Starter',
      'Up to 20 coaches and 250 athletes',
      'Advanced workspace roles and permissions',
      'Custom document templates and reusable form libraries',
      'Automated document and payment reminders',
      'Document expiration and renewal tracking',
      'Advanced compliance dashboards and filters',
      'Advanced reports, trends, and CSV exports',
      'Organization marketplace publishing',
      'Up to 20 active marketplace products',
      'Expanded athlete, attendance, revenue, and coach insights',
      '14-day free trial for eligible new organizations',
    ],
  },
} as const

const organizationPaymentLanguage = [
  'Program registrations: 7% platform fee',
  'Marketplace sales: 10% platform fee, capped at $75 per transaction',
  'Organization dues: estimated Stripe processing cost only—currently 2.9% + 30¢',
] as const

const organizationCoachCoverage = 'Organization coaches are covered while working inside the organization workspace. A separate Coach All Access subscription is only required for an independently operated coaching business.'

const copy = {
  families: {
    label: 'Athletes & Parents',
    title: 'One membership for the whole family.',
    monthly: ALL_ACCESS_PRICING.athlete.month,
    annual: ALL_ACCESS_PRICING.athlete.year,
    trialDays: 7,
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
    trialDays: 7,
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
    title: 'Organization Starter',
    monthly: ALL_ACCESS_PRICING.org.plans.org_starter.month,
    annual: ALL_ACCESS_PRICING.org.plans.org_starter.year,
    trialDays: 14,
    perks: organizationPlans.org_starter.perks,
  },
} as const

const faqs = [
  {
    q: 'How does the free trial work?',
    a: 'New athlete and coach subscribers receive a 7-day free trial. New organization subscribers receive a 14-day free trial. A payment method is required, but you will not be charged until the trial ends. Cancel before the trial ends to avoid a charge. Trials are limited to one per eligible subscriber.',
  },
  {
    q: 'What does Coach All Access mean?',
    a: 'Independent coaches receive every coach feature without Starter, Pro, or Elite restrictions. Organizations choose Starter or Growth based on their operating needs.',
  },
  {
    q: 'How are organization coaches billed?',
    a: 'Organization coaches are included with both Organization Starter and Organization Growth. Inviting, activating, changing, or removing a coach does not create a separate subscription charge.',
  },
  {
    q: 'Does an organization member also need an individual subscription?',
    a: 'Not for organization work. A coach needs an individual All Access subscription only when operating a separate independent coaching business.',
  },
  {
    q: 'How do transaction fees work?',
    a: 'Program registrations have a 7% platform fee. Organization dues pass through the estimated Stripe processing cost, currently 2.9% + 30¢. Marketplace sales have a 10% platform fee capped at $75 per transaction. Stripe processing is included in each displayed transaction breakdown.',
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
  const [audience, setAudience] = useState<Audience>('organizations')
  const [interval, setInterval] = useState<Interval>('year')
  const [organizationPlan, setOrganizationPlan] = useState<'org_starter' | 'org_growth'>('org_starter')
  useEffect(() => {
    const requestedAudience = new URLSearchParams(window.location.search).get('audience')
    if (requestedAudience === 'coaches' || requestedAudience === 'families' || requestedAudience === 'organizations') {
      setAudience(requestedAudience)
    }
  }, [])
  const selected = audience === 'organizations'
    ? {
        ...copy.organizations,
        title: organizationPlans[organizationPlan].title,
        monthly: ALL_ACCESS_PRICING.org.plans[organizationPlan].month,
        annual: ALL_ACCESS_PRICING.org.plans[organizationPlan].year,
        perks: organizationPlans[organizationPlan].perks,
      }
    : copy[audience]
  const amount = interval === 'year' ? selected.annual : selected.monthly

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
            {audienceOrder.map((value) => (
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
          {audience === 'organizations' ? (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {(['org_starter', 'org_growth'] as const).map((plan) => (
                <button key={plan} type="button" onClick={() => setOrganizationPlan(plan)} className={`rounded-full border bg-white px-4 py-2 text-sm font-semibold ${organizationPlan === plan ? 'border-[#b80f0a] text-[#b80f0a]' : 'border-[#dcdcdc] text-[#191919]'}`}>
                  {plan === 'org_starter' ? 'Starter' : 'Growth'}
                </button>
              ))}
            </div>
          ) : null}
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
          <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[#191919]">
            <span className="text-2xl font-semibold text-[#6b5f55] line-through decoration-[#b80f0a]">
              {formatUsdCents(amount)}
            </span>
            <span className="text-4xl font-semibold">$0</span>
            <span className="text-base font-normal text-[#4a4a4a]">
              for the first {selected.trialDays} days
            </span>
          </p>
          <p className="mt-2 text-sm text-[#4a4a4a]">
            Then {formatUsdCents(amount)} / {interval}. A payment method is required. Cancel before the trial ends and you won&apos;t be charged.
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
          {audience === 'organizations' ? (
            <div className="mt-6 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">Payment terms</p>
              <ul className="mt-3 space-y-2 text-sm text-[#191919]">
                {organizationPaymentLanguage.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="text-[#b80f0a]">●</span><span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {audience === 'organizations' ? (
            <p className="mt-5 text-sm leading-6 text-[#4a4a4a]">{organizationCoachCoverage}</p>
          ) : null}
          <GetTheAppButton
            label={`Start ${selected.trialDays}-day free trial`}
            className="mt-7 w-full justify-center border-[#191919] !bg-[#191919] px-6 py-3 !text-white"
          />
          <p className="mt-3 text-center text-xs leading-5 text-[#6b5f55]">
            Free trial available to eligible new subscribers who have not previously used a Coaches Hive trial.
          </p>
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
