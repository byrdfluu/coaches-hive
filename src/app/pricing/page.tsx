'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { ORG_MARKETPLACE_FEE, ORG_PLAN_PRICING, ORG_SESSION_FEES } from '@/lib/orgPricing'
import { COACH_MARKETPLACE_FEES, COACH_SESSION_FEES } from '@/lib/coachPricing'
import { launchSurface } from '@/lib/launchSurface'

type Plan = {
  name: string
  price: string
  cadence: string
  highlight: string
  perks: string[]
  badge?: string
  details?: string[]
}

const coachPlans: Plan[] = [
  {
    name: 'Starter',
    price: '$39',
    cadence: 'per month',
    highlight: 'Core tools for new coaches.',
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
    name: 'Pro',
    price: '$125',
    cadence: 'per month',
    highlight: 'Scale with unlimited athletes.',
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
    name: 'Elite',
    price: '$199',
    cadence: 'per month',
    highlight: 'For teams and top performers.',
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

const athletePlans: Plan[] = [
  {
    name: 'Explore',
    price: '$15',
    cadence: 'per month',
    highlight: 'Browse and book pay-as-you-go.',
    perks: [
      'Coach discovery and profiles',
      'One athlete profile',
      'Book sessions',
      'In-app messaging',
      'Standard reminders',
      'Marketplace browsing',
    ],
  },
  {
    name: 'Train',
    price: '$35',
    cadence: 'per month',
    highlight: 'Active athletes working with coaches.',
    perks: [
      'Everything in Explore, plus',
      '2 athlete profiles',
      'Unified inbox',
      'Payment history & receipts',
      'Family dashboard',
    ],
    badge: 'Best value',
  },
  {
    name: 'Family',
    price: '$65',
    cadence: 'per month',
    highlight: 'Parents managing multiple athletes.',
    perks: [
      'Everything in Train, plus',
      'Unlimited athlete profiles',
      'Multi-coach management',
      'Shared family calendar',
      'Export reports',
      'Priority support',
    ],
  },
]

export default function PricingPage() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const publicOrgPricingEnabled = launchSurface.publicOrgEntryPointsEnabled
  const audienceOptions = publicOrgPricingEnabled
    ? (['coaches', 'athletes', 'organizations'] as const)
    : (['coaches', 'athletes'] as const)
  const [audience, setAudience] = useState<'coaches' | 'athletes' | 'organizations'>(
    tabParam === 'athletes'
      ? 'athletes'
      : tabParam === 'organizations' && publicOrgPricingEnabled
        ? 'organizations'
        : 'coaches',
  )
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const orgPlans: Plan[] = [
    {
      name: 'Standard',
      price: ORG_PLAN_PRICING.standard,
      cadence: 'per month',
      highlight: 'Core tools for programs and teams.',
      perks: [
        'Up to 10 coaches + 500 athletes',
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
      highlight: 'Automations and compliance-ready ops.',
      perks: [
        'Up to 25 coaches + 2,000 athletes',
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
      highlight: 'Unlimited scale and advanced controls.',
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
  const plans = audience === 'coaches' ? coachPlans : audience === 'athletes' ? athletePlans : orgPlans
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null)

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

  useEffect(() => {
    setExpandedPlan(null)
  }, [audience])

  const audienceHeadline = audience === 'coaches'
    ? 'Scale your coaching, not your admin.'
    : audience === 'athletes'
      ? 'Support every athlete, from first session to game day.'
      : 'Run your entire program from one platform.'

  const audienceSubcopy = audience === 'organizations'
    ? 'Pick a plan to start your 14-day free trial. You won’t be charged until the trial ends.'
    : 'Pick a plan to start your 7-day free trial. You won’t be charged until the trial ends.'

  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <header className="text-center">
          <p className="public-kicker">Pricing</p>
          <h1 className="public-title mt-2">
            {audienceHeadline}
          </h1>
          <p className="public-copy mx-auto mt-3 max-w-3xl text-sm md:text-base">
            {audienceSubcopy}
          </p>
          {(audience === 'coaches' || audience === 'organizations') && (
            <p className="mt-2 text-xs text-[#4a4a4a]">
              Platform fee applies to all plans (varies by tier and volume).
            </p>
          )}
          <div className="mt-6 inline-flex items-center rounded-full border border-[#191919] bg-white p-1 text-sm font-semibold text-[#191919]">
            {audienceOptions.map((option) => {
              const isActive = audience === option
              const label = option === 'coaches' ? 'Coaches' : option === 'athletes' ? 'Athletes' : 'Organizations'
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

        <section className={`mt-10 grid gap-6 ${audience === 'coaches' ? 'md:grid-cols-3 lg:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-3 max-w-5xl mx-auto'}`}>
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
                {plan.price}
                {plan.cadence && (
                  <span className="text-sm font-normal text-[#4a4a4a]">
                    {' '}
                    / {plan.cadence}
                  </span>
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
                    const tier = plan.name.toLowerCase()
                    if (isAuthenticated) {
                      return audience === 'organizations'
                        ? `/checkout?role=org_admin&tier=${tier}`
                        : audience === 'coaches'
                          ? `/checkout?role=coach&tier=${tier}`
                          : `/checkout?role=athlete&tier=${tier}`
                    }
                    return audience === 'organizations'
                      ? `/signup?role=org&tier=${tier}`
                      : audience === 'coaches'
                        ? `/signup?role=coach&tier=${tier}`
                        : `/signup?role=athlete&tier=${tier}`
                  })()}
                  className="mt-5 block w-full border border-[#191919] bg-white px-4 py-3 text-center text-sm font-semibold text-[#191919] transition hover:bg-[#e8e8e8]"
                >
                  {audience === 'organizations' || audience === 'coaches' ? 'Choose plan' : 'Get started'}
                </Link>
              )}
            </div>
          ))}
        </section>

      </div>
    </main>
  )
}
