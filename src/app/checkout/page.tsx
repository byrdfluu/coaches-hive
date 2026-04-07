'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { roleToPath } from '@/lib/roleRedirect'
import { ORG_PLAN_PRICING } from '@/lib/orgPricing'
import CoachSidebar from '@/components/CoachSidebar'

type PlanOption = {
  id: string
  name: string
  price: string
  cadence: string
  highlight: string
  perks: string[]
}

const coachPlans: PlanOption[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$29',
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
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$89',
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
  },
  {
    id: 'elite',
    name: 'Elite',
    price: '$159',
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
  },
]

const athletePlans: PlanOption[] = [
  {
    id: 'explore',
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
    id: 'train',
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
  },
  {
    id: 'family',
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

const orgPlans: PlanOption[] = [
  {
    id: 'standard',
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
  },
  {
    id: 'growth',
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
  },
  {
    id: 'enterprise',
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
  },
]

export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabaseRef = useRef(createClientComponentClient())
  const [processing, setProcessing] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [notice, setNotice] = useState('')
  const confirmedSessionRef = useRef<string | null>(null)
  // null = checking, true = org already exists, false = needs to be created
  const [orgExists, setOrgExists] = useState<boolean | null>(null)
  const [metaOrgName, setMetaOrgName] = useState('')
  const [metaOrgType, setMetaOrgType] = useState('')

  const role = searchParams.get('role') || ''
  const tier = searchParams.get('tier') || ''
  const sessionId = searchParams.get('session_id') || ''
  const success = searchParams.get('success') === '1'
  const canceled = searchParams.get('canceled') === '1'
  const portal = searchParams.get('portal') || ''
  const returnTo = searchParams.get('return_to') || ''
  const from = searchParams.get('from') || ''

  const isOrgRole =
    role === 'org_admin'
    || role === 'club_admin'
    || role === 'travel_admin'
    || role === 'school_admin'
    || role === 'athletic_director'
    || role === 'program_director'
    || role === 'team_manager'

  const billingRole = role === 'coach' || role === 'athlete' ? role : isOrgRole ? 'org' : ''
  const trialDays = billingRole === 'org' ? 14 : 7
  const selectPlanRole = billingRole === 'coach' || billingRole === 'athlete'
    ? billingRole
    : billingRole === 'org'
      ? 'org_admin'
      : null
  const isCoachPortalCheckoutFlow = billingRole === 'org' && portal === 'coach'
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : ''

  // Show the trial UI whenever the user is at the pre-checkout step.
  // The backend determines whether the trial actually applies; most new users will qualify.
  const isTrialFlow = !success && !canceled && Boolean(tier)

  const plan = useMemo(() => {
    const list =
      billingRole === 'coach'
        ? coachPlans
        : billingRole === 'athlete'
          ? athletePlans
          : billingRole === 'org'
            ? orgPlans
            : []
    return list.find((item) => item.id === tier) || null
  }, [billingRole, tier])

  const resolveOrgCheckoutContext = async () => {
    const supabase = supabaseRef.current
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setOrgExists(false)
      setMetaOrgName('')
      setMetaOrgType('')
      return { exists: false, name: '', type: '' }
    }

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (membership?.org_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name, org_type')
        .eq('id', membership.org_id)
        .maybeSingle()

      const name = String(org?.name || '').trim()
      const type = String(org?.org_type || '').trim()
      setOrgExists(true)
      if (name) setMetaOrgName(name)
      if (type) setMetaOrgType(type)
      return { exists: true, name, type }
    }

    const name = String(user.user_metadata?.org_name || '').trim()
    const type = String(user.user_metadata?.org_type || '').trim()
    setOrgExists(false)
    setMetaOrgName(name)
    setMetaOrgType(type)
    return { exists: false, name, type }
  }

  useEffect(() => {
    // Skip lifecycle validation when the user is here intentionally:
    // - after completing Stripe checkout (success=1 + session_id)
    // - after canceling Stripe checkout (they should stay to retry)
    // - when they came from plan selection to change/downgrade their plan
    if (success && sessionId) return
    if (canceled) return
    if (from === 'select-plan') return
    let active = true
    const validateLifecycle = async () => {
      const response = await fetch('/api/lifecycle')
      if (!response.ok || !active) return
      const payload = await response.json().catch(() => null)
      const nextPath = String(payload?.snapshot?.nextPath || '')
      if (!nextPath || !active) return
      if (nextPath && !nextPath.startsWith('/checkout')) {
        await supabaseRef.current.auth.refreshSession().catch(() => null)
        router.replace(nextPath)
      }
    }
    void validateLifecycle()
    return () => {
      active = false
    }
  }, [router, sessionId, success, canceled, from])

  useEffect(() => {
    if (!success || !sessionId || confirmedSessionRef.current === sessionId) return
    confirmedSessionRef.current = sessionId
    let active = true

    const confirmSubscription = async () => {
      setFinalizing(true)
      setNotice('Finalizing your subscription...')
      const response = await fetch('/api/stripe/subscription/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        if (!active) return
        confirmedSessionRef.current = null
        setNotice(payload?.error || 'Unable to confirm your subscription.')
        setFinalizing(false)
        return
      }

      // The confirm route is the authoritative lifecycle completion write.
      // Re-posting checkout_completed from the browser can replay stale session
      // metadata and clobber the org role/tier that the server just repaired.
      await supabaseRef.current.auth.refreshSession().catch(() => null)

      const snapshotResponse = await fetch('/api/lifecycle', { cache: 'no-store' }).catch(() => null)
      const snapshotPayload = snapshotResponse?.ok
        ? await snapshotResponse.json().catch(() => null)
        : null

      const nextPath = String(snapshotPayload?.snapshot?.nextPath || '')
      if (safeReturnTo) {
        window.location.replace(safeReturnTo)
        return
      }
      if (nextPath && !nextPath.startsWith('/checkout')) {
        window.location.replace(billingRole === 'org' ? '/org' : nextPath)
        return
      }

      const fallbackRole = role || (billingRole === 'org' ? 'org_admin' : billingRole)
      window.location.replace(billingRole === 'org' ? '/org' : (roleToPath(fallbackRole) ?? '/'))
    }

    void confirmSubscription()
    return () => {
      active = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingRole, role, router, safeReturnTo, sessionId, success, tier])

  useEffect(() => {
    if (canceled) {
      setNotice('Checkout canceled. You can try again anytime.')
    }
  }, [canceled])

  useEffect(() => {
    if (billingRole !== 'org' || success || canceled) return
    let active = true
    const checkOrg = async () => {
      const context = await resolveOrgCheckoutContext()
      if (!active) return
      setOrgExists(context.exists)
      setMetaOrgName(context.name)
      setMetaOrgType(context.type)
    }
    void checkOrg()
    return () => { active = false }
  }, [billingRole, success, canceled])

  const handleCheckout = async () => {
    setProcessing(true)
    setNotice('')

    if (billingRole === 'org') {
      const orgContext = orgExists === true
        ? { exists: true, name: metaOrgName, type: metaOrgType }
        : await resolveOrgCheckoutContext()

      if (!orgContext.exists) {
        if (!orgContext.name) {
          setNotice('Organization name is missing. Please contact support or sign up again.')
          setProcessing(false)
          return
        }
        const orgRes = await fetch('/api/org/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_name: orgContext.name, org_type: orgContext.type || 'organization', tier }),
        })
        if (!orgRes.ok) {
          const orgPayload = await orgRes.json().catch(() => null)
          // 409 means the user already has an org — safe to continue.
          const alreadyHasOrg = orgRes.status === 409 && orgPayload?.org
          if (!alreadyHasOrg) {
            setNotice(orgPayload?.error || 'Unable to create organization.')
            setProcessing(false)
            return
          }
        }
        setOrgExists(true)
        setMetaOrgName(orgContext.name)
        setMetaOrgType(orgContext.type || 'organization')
      }
    }

    await fetch('/api/lifecycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'checkout_started', tier }),
    }).catch(() => null)
    const response = await fetch('/api/stripe/subscription/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, tier, portal, returnTo: safeReturnTo || undefined }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.url) {
      setNotice(payload?.error || 'Unable to start checkout.')
      setProcessing(false)
      return
    }
    window.location.href = payload.url
  }

  const handleBackToSelectPlan = () => {
    if (safeReturnTo) {
      router.push(safeReturnTo)
      return
    }
    const tierParam = tier ? `&tier=${encodeURIComponent(tier)}` : ''
    const portalParam = isCoachPortalCheckoutFlow ? '&portal=coach' : ''
    if (selectPlanRole) {
      router.push(`/select-plan?role=${selectPlanRole}${tierParam}${portalParam}`)
      return
    }
    router.push(`/select-plan${tier ? `?tier=${encodeURIComponent(tier)}${portalParam}` : (portalParam ? `?${portalParam.slice(1)}` : '')}`)
  }

  if (!plan || !billingRole) {
    return (
      <main className="page-shell">
        <div className="relative z-10 mx-auto max-w-2xl px-6 py-12">
          <div className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#4a4a4a]">
            Checkout details are missing. Please return to pricing and choose a plan.
          </div>
        </div>
      </main>
    )
  }

  const checkoutCard = (
    <div className="glass-card border border-[#191919] bg-white p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Checkout</p>
          {isTrialFlow ? (
            <>
              <h1 className="mt-2 text-2xl font-semibold text-[#191919]">
                {trialDays}-day free {plan.name} trial
              </h1>
              <p className="mt-2 text-sm text-[#4a4a4a]">
                Start with full {plan.name} access for {trialDays} days — no charge until your trial ends.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Confirm your {plan.name} plan</h1>
              <p className="mt-2 text-sm text-[#4a4a4a]">
                You&apos;ll start with the plan below once payment is complete.
              </p>
            </>
          )}

          <div className="mt-6 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
            {isTrialFlow && (
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#b80f0a] px-3 py-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white">{trialDays} days free</span>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{plan.name}</p>
                <p className="mt-2 text-3xl font-semibold text-[#191919]">
                  {isTrialFlow ? (
                    <>
                      <span className="text-sm font-normal text-[#4a4a4a] line-through">{plan.price}</span>
                      <span className="ml-2">$0</span>
                      <span className="text-sm font-normal text-[#4a4a4a]"> / first {trialDays} days</span>
                    </>
                  ) : (
                    <>
                      {plan.price}
                      <span className="text-sm font-normal text-[#4a4a4a]"> / {plan.cadence}</span>
                    </>
                  )}
                </p>
                <p className="mt-2 text-sm text-[#4a4a4a]">{plan.highlight}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-[#191919]">
              {plan.perks.map((perk) => (
                <li key={perk} className="flex items-start gap-2">
                  <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-[#b80f0a]" />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
          </div>

          {isTrialFlow && (
            <div className="mt-3 rounded-xl border border-[#dcdcdc] bg-[#fafafa] px-4 py-3">
              <p className="text-xs text-[#4a4a4a]">
                After your {trialDays}-day trial, you&apos;ll be charged{' '}
                <span className="font-semibold text-[#191919]">{plan.price}/month</span>.
                Cancel anytime before the trial ends and you won&apos;t be charged.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={handleCheckout}
              disabled={processing || finalizing || (billingRole === 'org' && orgExists === null && !success && !canceled)}
              className="w-full rounded-full bg-[#b80f0a] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            >
              {finalizing ? 'Finalizing...' : processing ? 'Processing...' : (billingRole === 'org' && orgExists === null && !success && !canceled) ? 'Loading...' : 'Continue to payment'}
            </button>
            <button
              type="button"
              onClick={handleBackToSelectPlan}
              className="w-full rounded-full border border-[#191919] px-5 py-2 text-sm font-semibold text-[#191919] sm:w-auto"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => router.push('/pricing')}
              className="w-full rounded-full px-5 py-2 text-sm font-semibold text-[#4a4a4a] underline sm:w-auto"
            >
              See full pricing page
            </button>
          </div>
          {notice ? <p className="mt-3 text-xs text-[#b80f0a]">{notice}</p> : null}
        </div>
  )

  if (isCoachPortalCheckoutFlow) {
    return (
      <main className="page-shell">
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10 lg:flex-row">
          <CoachSidebar />
          <section className="min-w-0 flex-1">
            <div className="mx-auto max-w-3xl">
              {checkoutCard}
            </div>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-12">
        {checkoutCard}
      </div>
    </main>
  )
}
