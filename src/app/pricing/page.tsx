'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { COACH_MARKETPLACE_FEES, COACH_SESSION_FEES } from '@/lib/coachPricing'

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
    name: 'Starter',
    price: '$49',
    cadence: 'per month',
    trialLabel: '$0 / first 7 days',
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
    price: '$149',
    cadence: 'per month',
    trialLabel: '$0 / first 7 days',
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
    price: '$249',
    cadence: 'per month',
    trialLabel: '$0 / first 7 days',
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

export default function PricingPage() {
  const supabase = createClientComponentClient()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
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

  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <header className="text-center">
          <p className="public-kicker">Pricing</p>
          <h1 className="public-title mt-2">Scale your coaching, not your admin.</h1>
          <p className="public-copy mx-auto mt-3 max-w-3xl text-sm md:text-base">
            Pick a plan to start your 7-day free trial. You won&apos;t be charged until the trial ends.
          </p>
          <p className="mt-2 text-xs text-[#4a4a4a]">
            Platform fee applies to all plans (varies by tier and volume).
          </p>
        </header>

        <section className="mt-10 grid gap-6 md:grid-cols-3">
          {coachPlans.map((plan) => (
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
                      setExpandedPlan((prev) => (prev === plan.name ? null : plan.name))
                    }}
                    aria-expanded={expandedPlan === plan.name}
                  >
                    Pricing details
                    <span>{expandedPlan === plan.name ? '−' : '+'}</span>
                  </button>
                  {expandedPlan === plan.name ? (
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
              <Link
                href={isAuthenticated ? `/checkout?role=coach&tier=${plan.name.toLowerCase()}` : `/signup?role=coach&tier=${plan.name.toLowerCase()}`}
                className="mt-5 block w-full border border-[#191919] bg-white px-4 py-3 text-center text-sm font-semibold text-[#191919] transition hover:bg-[#e8e8e8]"
              >
                Choose plan
              </Link>
            </div>
          ))}
        </section>

      </div>
    </main>
  )
}
