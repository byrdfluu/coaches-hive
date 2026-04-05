'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { COACH_MARKETPLACE_FEES, COACH_SESSION_FEES } from '@/lib/coachPricing'
import { ORG_PLAN_PRICING } from '@/lib/orgPricing'

type ManageRole = 'coach' | 'athlete' | 'org_admin'

type PlanCard = {
  id: string
  name: string
  price: string
  cadence: string
  badge?: string
  perks: string[]
  details?: string[]
  contactSales?: boolean
}

type ManagePlanModalProps = {
  open: boolean
  onClose: () => void
  role: ManageRole
  currentTier?: string | null
  /** Pass true when the user already has an active subscription — triggers in-place update instead of new checkout. */
  isSubscribed?: boolean
  /** Called after a successful plan change so the parent can refresh state. */
  onPlanChanged?: (newTier: string) => void
}

const byRole: Record<ManageRole, { heading: string; subheading: string; plans: PlanCard[] }> = {
  coach: {
    heading: 'Manage coach plans',
    subheading: 'Choose a tier based on athlete volume and payout/marketplace tools.',
    plans: [
      {
        id: 'starter',
        name: 'Starter',
        price: '$39',
        cadence: 'per month',
        perks: ['Up to 3 active athletes', 'Basic calendar + messaging', 'Monthly payouts'],
        details: [
          `Session fee: ${COACH_SESSION_FEES.starter}%`,
        ],
      },
      {
        id: 'pro',
        name: 'Pro',
        price: '$125',
        cadence: 'per month',
        badge: 'Most popular',
        perks: ['Up to 50 athletes', 'Availability rules', 'Marketplace listings + subscriptions', 'Weekly payouts'],
        details: [
          `Session fee: ${COACH_SESSION_FEES.pro}%`,
          `Marketplace fee: ${COACH_MARKETPLACE_FEES.pro}%`,
        ],
      },
      {
        id: 'elite',
        name: 'Elite',
        price: '$199',
        cadence: 'per month',
        perks: ['Unlimited athletes', 'Team/group coaching tools', 'Custom branding', 'Daily payouts'],
        details: [
          `Session fee: ${COACH_SESSION_FEES.elite}%`,
          `Marketplace fee: ${COACH_MARKETPLACE_FEES.elite}%`,
        ],
      },
    ],
  },
  athlete: {
    heading: 'Manage athlete plans',
    subheading: 'Upgrade for more profiles, family controls, and expanded account tools.',
    plans: [
      {
        id: 'explore',
        name: 'Explore',
        price: '$15',
        cadence: 'per month',
        perks: ['One athlete profile', 'Book sessions', 'In-app messaging', 'Marketplace browsing'],
      },
      {
        id: 'train',
        name: 'Train',
        price: '$35',
        cadence: 'per month',
        badge: 'Best value',
        perks: ['2 athlete profiles', 'Unified inbox', 'Payment history + receipts', 'Family dashboard'],
      },
      {
        id: 'family',
        name: 'Family',
        price: '$65',
        cadence: 'per month',
        perks: ['Unlimited athlete profiles', 'Multi-coach management', 'Shared family calendar', 'Priority support'],
      },
    ],
  },
  org_admin: {
    heading: 'Manage organization plans',
    subheading: 'Pick the plan that fits your coach/athlete volume and operations complexity.',
    plans: [
      {
        id: 'standard',
        name: 'Standard',
        price: ORG_PLAN_PRICING.standard,
        cadence: 'per month',
        perks: ['Up to 10 coaches + 500 athletes', 'Billing center + fee tracking', 'Org dashboard + team management', 'Marketplace access (no org publishing)'],
      },
      {
        id: 'growth',
        name: 'Growth',
        price: ORG_PLAN_PRICING.growth,
        cadence: 'per month',
        badge: 'Most popular',
        perks: ['Up to 25 coaches + 2,000 athletes', 'Automated fee reminders', 'Compliance tools + report exports', 'Publish up to 20 org products'],
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: ORG_PLAN_PRICING.enterprise,
        cadence: 'per month',
        badge: 'Custom',
        contactSales: true,
        perks: ['Unlimited coaches + athletes', 'Advanced permissions + approvals', 'Unlimited publishing + discounts/bundles', 'SLA support + custom exports'],
      },
    ],
  },
}

const normalizeTier = (value?: string | null) => String(value || '').trim().toLowerCase()

const getSettingsReturnPath = (role: ManageRole) => {
  if (role === 'coach') return '/coach/settings'
  if (role === 'athlete') return '/athlete/settings'
  return '/org/settings'
}

export default function ManagePlanModal({
  open,
  onClose,
  role,
  currentTier,
  isSubscribed,
  onPlanChanged,
}: ManagePlanModalProps) {
  const config = byRole[role]
  const normalizedCurrentTier = normalizeTier(currentTier)

  const [changingTo, setChangingTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setChangingTo(null)
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, open])

  const pricingHref = useMemo(() => '/pricing', [])

  const handleChangePlan = async (planId: string) => {
    setChangingTo(planId)
    setError(null)
    const returnTo = getSettingsReturnPath(role)
    if (isSubscribed) {
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow: 'subscription_update_confirm',
          tier: planId,
          returnTo,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (response.ok && payload?.url) {
        window.location.href = payload.url
        return
      }
      if (response.status !== 404) {
        setError(payload?.error || 'Unable to open Stripe plan checkout. Please try again.')
        setChangingTo(null)
        return
      }
    }

    const checkoutParams = new URLSearchParams({
      role,
      tier: planId,
      return_to: returnTo,
    })
    window.location.href = `/checkout?${checkoutParams.toString()}`
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 px-3 py-3 sm:items-center sm:px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[calc(100vh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-[#191919] bg-white p-4 shadow-xl sm:max-h-[85vh] sm:rounded-3xl sm:p-5 md:p-6"
        role="dialog"
        aria-modal="true"
        aria-label={config.heading}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Plan management</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{config.heading}</h2>
            <p className="mt-1 text-sm text-[#4a4a4a]">{config.subheading}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {config.plans.map((plan) => {
            const isCurrent = normalizedCurrentTier === plan.id
            const isChanging = changingTo === plan.id
            const anyChanging = changingTo !== null
            const checkoutHref = `/checkout?role=${role}&tier=${plan.id}`
            const salesHref = '/contact?intent=enterprise&role=org_admin&tier=enterprise#org-demo'
            return (
              <div key={plan.id} className="rounded-2xl border border-[#191919] bg-[#f5f5f5] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-[#191919]">{plan.name}</p>
                    <p className="text-xs text-[#4a4a4a]">{plan.price} {plan.cadence}</p>
                  </div>
                  {plan.badge ? (
                    <span className="rounded-full border border-[#191919] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#191919]">
                      {plan.badge}
                    </span>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1 text-xs text-[#4a4a4a]">
                  {plan.perks.map((perk) => (
                    <li key={perk}>• {perk}</li>
                  ))}
                </ul>
                {plan.details?.length ? (
                  <ul className="mt-3 space-y-1 border-t border-[#dcdcdc] pt-2 text-xs text-[#4a4a4a]">
                    {plan.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-4">
                  {isCurrent ? (
                    <span className="inline-flex w-full justify-center rounded-full border border-[#191919] bg-[#191919] px-3 py-1.5 text-xs font-semibold text-white sm:w-auto">
                      Current plan
                    </span>
                  ) : plan.contactSales ? (
                    <Link
                      href={salesHref}
                      className="inline-flex w-full justify-center rounded-full border border-[#191919] bg-white px-3 py-1.5 text-xs font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a] sm:w-auto"
                    >
                      Contact sales
                    </Link>
                  ) : isSubscribed ? (
                    <button
                      type="button"
                      disabled={anyChanging}
                      onClick={() => handleChangePlan(plan.id)}
                      className="inline-flex w-full justify-center rounded-full bg-[#b80f0a] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
                    >
                      {isChanging ? 'Updating...' : `Switch to ${plan.name}`}
                    </button>
                  ) : (
                    <Link
                      href={checkoutHref}
                      className="inline-flex w-full justify-center rounded-full bg-[#b80f0a] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
                    >
                      Choose {plan.name}
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-[#b80f0a] bg-[#fff5f5] px-4 py-2 text-xs text-[#b80f0a]">
            {error}
          </p>
        ) : null}

        {isSubscribed && (
          <p className="mt-3 text-xs text-[#4a4a4a]">
            Plan changes apply immediately with prorated billing for the remainder of your current cycle.
          </p>
        )}

        <div className="mt-5 flex flex-col items-stretch gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#4a4a4a] sm:flex-row sm:items-center sm:justify-between">
          <p>Checkout is secure through Stripe. Changes apply to your current account role.</p>
          <Link href={pricingHref} className="font-semibold text-[#b80f0a] underline sm:text-right">
            View full pricing
          </Link>
        </div>
      </div>
    </div>
  )
}
