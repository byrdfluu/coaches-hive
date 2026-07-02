'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { COACH_MARKETPLACE_FEES, COACH_SESSION_FEES } from '@/lib/coachPricing'
import { ORG_MARKETPLACE_FEE, ORG_PLAN_PRICING, ORG_SESSION_FEES } from '@/lib/orgPricing'

type Plan = {
  name: string
  price: string
  cadence: string
  highlight: string
  perks: string[]
  badge?: string
  details?: string[]
  trialLabel?: string
}

const coachPlans: Plan[] = [
  {
    name: 'Starter Coach',
    price: '$49',
    cadence: 'per month',
    trialLabel: '$0 / first 7 days',
    highlight: 'Core tools for coaches just starting out.',
    perks: [
      'Coach profile',
      'Accept bookings',
      'Up to 3 active athletes',
      'Basic calendar',
      'In-app messaging',
      'Monthly payouts',
    ],
    details: [
      `Session fee: ${COACH_SESSION_FEES.starter}% per booking`,
    ],
  },
  {
    name: 'Pro Coach',
    price: '$149',
    cadence: 'per month',
    trialLabel: '$0 / first 7 days',
    highlight: 'Scale with more athletes and sell your programs.',
    perks: [
      'Everything in Starter, plus',
      'Up to 50 athletes',
      'Availability rules',
      'Marketplace listings + packages & subscriptions',
      'Basic analytics',
      'Weekly payouts',
    ],
    badge: 'Most popular',
    details: [
      `Session fee: ${COACH_SESSION_FEES.pro}% per booking`,
      `Marketplace fee: ${COACH_MARKETPLACE_FEES.pro}% per product sale`,
    ],
  },
  {
    name: 'Elite Coach',
    price: '$249',
    cadence: 'per month',
    trialLabel: '$0 / first 7 days',
    highlight: 'For coaches running a full private training operation.',
    perks: [
      'Everything in Pro, plus',
      'Unlimited athletes',
      'Custom branding',
      'Featured placement',
      'Team/group coaching tools',
      'Daily payouts',
    ],
    details: [
      `Session fee: ${COACH_SESSION_FEES.elite}% per booking`,
      `Marketplace fee: ${COACH_MARKETPLACE_FEES.elite}% per product sale`,
    ],
  },
]

const orgPlans: Plan[] = [
  {
    name: 'Standard',
    price: ORG_PLAN_PRICING.standard,
    cadence: 'per month',
    trialLabel: '$0 / first 14 days',
    highlight: 'Core tools for programs just getting organized.',
    perks: [
      'Up to 5 coaches + 50 athletes',
      'Org dashboard + team management',
      'Unified calendar + locations',
      'Billing center + fee tracking',
      'Basic reporting',
      'Marketplace access (no org publishing)',
      'Email support',
    ],
    details: [
      `Session fee: ${ORG_SESSION_FEES.standard}% per booking`,
      `Marketplace fee: ${ORG_MARKETPLACE_FEE}% per org sale`,
    ],
  },
  {
    name: 'Growth',
    price: ORG_PLAN_PRICING.growth,
    cadence: 'per month',
    trialLabel: '$0 / first 14 days',
    highlight: 'Automations and compliance for growing programs.',
    perks: [
      'Up to 20 coaches + 250 athletes',
      'Automated fee reminders',
      'Exportable reports',
      'Compliance tools + checklists',
      'Role-based access controls',
      'Publish up to 20 org products',
      'Priority support',
    ],
    badge: 'Most popular',
    details: [
      `Session fee: ${ORG_SESSION_FEES.growth}% per booking`,
      `Marketplace fee: ${ORG_MARKETPLACE_FEE}% per org sale`,
    ],
  },
  {
    name: 'Enterprise',
    price: ORG_PLAN_PRICING.enterprise,
    cadence: 'per month',
    trialLabel: '$0 / first 14 days',
    highlight: 'Unlimited scale for established programs.',
    perks: [
      'Unlimited coaches + athletes',
      'Advanced permissions + approvals',
      'Custom branding + domains',
      'Dedicated onboarding',
      'SLA support + success reviews',
      'Unlimited publishing + discounts/bundles',
      'Custom data exports',
    ],
    badge: 'Custom',
    details: [
      `Session fee: ${ORG_SESSION_FEES.enterprise}% per booking`,
      `Marketplace fee: ${ORG_MARKETPLACE_FEE}% per org sale`,
    ],
  },
]

const audienceOptions = ['organizations', 'coaches'] as const

const pricingFaqs = [
  {
    question: 'Is there a free trial?',
    answer: 'Yes. Organizations can start with a free trial before choosing a paid plan. During the trial, you can set up your program, invite staff, and test core workflows.',
  },
  {
    question: 'Which plan is right for my organization?',
    answer: 'Choose based on team count, coach count, roster size, reporting needs, and expected payment volume. Larger or higher-volume programs may benefit from plans with lower transaction rates and more admin controls.',
  },
  {
    question: 'Are coaches included in an organization plan?',
    answer: 'Yes. Coaches invited under an organization account are included as part of that organization’s plan and do not need to purchase a separate individual coach plan. Individual coach pricing applies to coaches who run their own coaching business outside of an organization account.',
  },
  {
    question: 'How do transaction fees work?',
    answer: 'Coaches Hive charges a platform fee on paid transactions processed through the platform. Coaching session fees are based on rolling transaction volume, while marketplace purchases have a 10% platform fee capped at $75 per transaction.',
  },
  {
    question: 'What is the marketplace fee?',
    answer: 'Marketplace sales have a 10% platform fee, with a maximum fee of $75 per transaction. For example, a $100 sale has a $10 platform fee. A $1,000 sale is capped at a $75 platform fee.',
  },
  {
    question: 'How are coaching session fees calculated?',
    answer: 'Session platform fees are based on rolling transaction volume. Higher-volume organizations may qualify for lower session fee rates. The current session fee range is 5% to 10%.',
  },
  {
    question: 'Are Stripe processing fees charged separately?',
    answer: 'No. Coaches Hive absorbs standard Stripe processing fees. Athletes and families do not see a separate Stripe processing fee added at checkout.',
  },
  {
    question: 'Can I upgrade or downgrade later?',
    answer: 'Yes. You can change plans as your program grows or your needs change. Upgrades can unlock higher limits, more reporting, and lower transaction rates where applicable.',
  },
  {
    question: 'Can I cancel my plan?',
    answer: 'Yes. You can cancel your plan before the next billing cycle. After cancellation, your access may continue through the end of the paid period, depending on your billing terms.',
  },
  {
    question: 'Can fees or plan details change over time?',
    answer: 'Yes. Coaches Hive may update platform fees, caps, plan limits, or volume tiers as the platform grows. Any changes will be reflected on the pricing page before they apply to new transactions.',
  },
]

export default function PricingPage() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [audience, setAudience] = useState<'coaches' | 'organizations'>(
    tabParam === 'coaches' ? 'coaches' : 'organizations',
  )
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null)

  useEffect(() => {
    setExpandedPlan(null)
  }, [audience])

  useEffect(() => {
    let active = true
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setIsAuthenticated(Boolean(data.session))
    }
    checkSession()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session))
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase])

  const plans = audience === 'coaches' ? coachPlans : orgPlans

  const audienceHeadline = audience === 'coaches'
    ? 'Scale your coaching, not your admin.'
    : 'Run your entire program from one platform.'

  const audienceSubcopy = audience === 'organizations'
    ? 'Pick a plan to start your 14-day free trial. You won\'t be charged until the trial ends.'
    : 'Pick a plan to start your 7-day free trial. You won\'t be charged until the trial ends.'

  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <header className="text-center">
          <p className="public-kicker">Pricing</p>
          <h1 className="public-title mt-2">{audienceHeadline}</h1>
          <p className="public-copy mx-auto mt-3 max-w-3xl text-sm md:text-base">
            {audienceSubcopy}
          </p>
          <p className="mt-2 text-xs text-[#4a4a4a]">
            Platform fee applies to all plans (varies by tier and volume).
          </p>
          <div className="mt-6 inline-flex items-center rounded-full border border-[#191919] bg-white p-1 text-sm font-semibold text-[#191919]">
            {audienceOptions.map((option) => {
              const isActive = audience === option
              const label = option === 'coaches' ? 'Individual Coaches' : 'Organizations'
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setAudience(option)}
                  className={`rounded-full px-4 py-2 transition ${
                    isActive ? 'bg-[#191919] text-white' : 'text-[#191919]'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </header>

        <section className="mx-auto mt-10 max-w-5xl">
          <div className="flex flex-col items-center justify-between gap-6 rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-8 py-8 sm:flex-row">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">Athletes & Parents</p>
              <p className="mt-2 text-xl font-semibold text-[#191919]">Signing up as an athlete is free.</p>
              <p className="mt-1 text-sm text-[#4a4a4a]">
                Find a coach, book sessions, track progress, and manage payments — no subscription required.
              </p>
            </div>
            <Link
              href="/signup?role=athlete"
              className="shrink-0 rounded-full bg-[#191919] px-7 py-3 text-sm font-semibold text-white transition hover:opacity-80"
            >
              Find a coach →
            </Link>
          </div>
        </section>

        {audience === 'coaches' ? (
          <section className="mx-auto mt-8 max-w-5xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">Individual Coaches</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Plans for independent coaches</h2>
          </section>
        ) : null}

        <section className="mt-6 grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="glass-card relative border border-[#191919] bg-[#f5f5f5] p-6"
            >
              {plan.badge && (
                <span className="absolute right-4 top-4 rounded-full border border-[#191919] bg-white px-3 py-1 text-xs font-semibold text-[#191919]">
                  {plan.badge}
                </span>
              )}
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">
                {plan.name}
              </p>
              <p className="mt-3 text-3xl font-semibold text-[#191919]">
                {plan.trialLabel ? (
                  <>
                    <span className="mr-2 text-xl font-normal text-[#4a4a4a] line-through">{plan.price}</span>
                    $0
                    <span className="text-sm font-normal text-[#4a4a4a]">
                      {plan.trialLabel.replace('$0', '')}
                    </span>
                  </>
                ) : (
                  <>
                    {plan.price}
                    {plan.cadence && (
                      <span className="text-sm font-normal text-[#4a4a4a]">
                        {' '}
                        / {plan.cadence}
                      </span>
                    )}
                  </>
                )}
              </p>
              <p className="mt-1 text-sm text-[#4a4a4a]">{plan.highlight}</p>
              <ul className="mt-4 space-y-2 text-sm text-[#191919]">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-[#b80f0a]" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              {plan.details?.length ? (
                <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-white px-3 py-3 text-sm text-[#191919]">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]"
                    onClick={() => {
                      const key = `${audience}-${plan.name}`
                      setExpandedPlan((prev) => (prev === key ? null : key))
                    }}
                    aria-expanded={expandedPlan === `${audience}-${plan.name}`}
                  >
                    Pricing details
                    <span>{expandedPlan === `${audience}-${plan.name}` ? '−' : '+'}</span>
                  </button>
                  {expandedPlan === `${audience}-${plan.name}` ? (
                    <ul className="mt-3 space-y-2 text-xs text-[#4a4a4a]">
                      {plan.details.map((detail) => (
                        <li key={detail} className="flex items-start gap-2">
                          <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-[#b80f0a]" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {audience === 'organizations' && plan.name === 'Enterprise' ? (
                <a
                  href="/contact?intent=enterprise&role=org_admin&tier=enterprise#org-demo"
                  className="mt-5 block w-full border border-[#191919] bg-white px-4 py-3 text-center text-sm font-semibold text-[#191919] transition hover:bg-[#e8e8e8]"
                >
                  Contact sales
                </a>
              ) : (
                <Link
                  href={(() => {
                    const tier = plan.name.toLowerCase().replace(' ', '_')
                    if (isAuthenticated) {
                      return audience === 'organizations'
                        ? `/checkout?role=org_admin&tier=${tier}`
                        : `/checkout?role=coach&tier=${tier}`
                    }
                    return audience === 'organizations'
                      ? `/signup?role=org&tier=${tier}`
                      : `/signup?role=coach&tier=${tier}`
                  })()}
                  className="mt-5 block w-full border border-[#191919] bg-white px-4 py-3 text-center text-sm font-semibold text-[#191919] transition hover:bg-[#e8e8e8]"
                >
                  Choose plan
                </Link>
              )}
            </div>
          ))}
        </section>

        <div className="mx-auto mt-6 max-w-5xl rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-5 py-4 text-sm text-[#191919]">
          <p>
            <span className="font-semibold">Coaches invited by your organization do not need a separate individual coach plan.</span> They are covered by your organization’s plan.
          </p>
        </div>

        <section className="mx-auto mt-12 max-w-5xl">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">Pricing FAQs</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Common pricing questions</h2>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {pricingFaqs.map((item) => (
              <details key={item.question} className="group glass-card border border-[#191919] bg-white p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-[#191919] [&::-webkit-details-marker]:hidden">
                  <span>{item.question}</span>
                  <span
                    aria-hidden="true"
                    className="mt-1 h-0 w-0 shrink-0 border-x-[4px] border-t-[7px] border-x-transparent border-t-[#b80f0a] transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

      </div>
    </main>
  )
}
