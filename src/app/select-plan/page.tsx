'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgTier } from '@/lib/planRules'
import { ORG_PLAN_PRICING } from '@/lib/orgPricing'
import { roleToPath } from '@/lib/roleRedirect'
import CoachSidebar from '@/components/CoachSidebar'

type PlanOption = {
  id: string
  name: string
  price: string
  cadence: string
  highlight: string
  perks: string[]
  badge?: string
}

const coachPlans: PlanOption[] = [
  {
    id: 'starter',
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
  },
  {
    id: 'pro',
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
  },
  {
    id: 'elite',
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
    badge: 'Best value',
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
    badge: 'Most popular',
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
    badge: 'Custom',
  },
]

const ORG_SUBROLE_SET = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

export default function SelectPlanPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()
  const [role, setRole] = useState<'coach' | 'athlete' | 'org_admin' | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pendingOrgInvite, setPendingOrgInvite] = useState<{ id: string; org_name: string; role: string } | null>(null)
  const [acceptingInvite, setAcceptingInvite] = useState(false)
  const plans = useMemo(
    () => (role === 'coach' ? coachPlans : role === 'athlete' ? athletePlans : role === 'org_admin' ? orgPlans : []),
    [role],
  )
  const isCoachPortalPlanFlow =
    searchParams.get('portal') === 'coach'
    && searchParams.get('force_plan_selection') === '1'
    && ORG_SUBROLE_SET.has(searchParams.get('role') || '')

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        router.replace('/login')
        return
      }

      let rawMetadataRole = (session.user.user_metadata?.active_role || session.user.user_metadata?.role || '') as string
      const requestedRoleRaw = searchParams.get('role') || ''
      const requestedRole = ORG_SUBROLE_SET.has(requestedRoleRaw) ? 'org_admin' : requestedRoleRaw
      const forcePlanSelection = searchParams.get('force_plan_selection') === '1'

      // After Google OAuth the JWT may not yet contain the updated role — the /auth/callback
      // route writes it via updateUser but the refreshed token sometimes doesn't reach the
      // browser before the redirect fires. Force a session refresh so downstream API calls
      // (lifecycle, checkout) all see the correct metadata.
      if (!rawMetadataRole && requestedRole) {
        const { data: refreshed } = await supabase.auth.refreshSession()
        if (refreshed?.session) {
          rawMetadataRole = (refreshed.session.user.user_metadata?.active_role || refreshed.session.user.user_metadata?.role || '') as string
        }
      }

      // Normalize org sub-roles to 'org_admin' so the plan picker shows org plans correctly.
      const metadataRole = ORG_SUBROLE_SET.has(rawMetadataRole) && rawMetadataRole !== 'coach' && rawMetadataRole !== 'athlete' ? 'org_admin' : rawMetadataRole
      let resolvedRole: 'coach' | 'athlete' | 'org_admin' | null =
        requestedRole === 'coach' || requestedRole === 'athlete' || requestedRole === 'org_admin'
          ? requestedRole
          : metadataRole === 'coach' || metadataRole === 'athlete' || metadataRole === 'org_admin'
            ? metadataRole
            : null

      if (!resolvedRole) {
        router.replace(roleToPath(rawMetadataRole))
        return
      }

      const lifecycleResponse = await fetch('/api/lifecycle')
      if (lifecycleResponse.ok) {
        const lifecyclePayload = await lifecycleResponse.json().catch(() => null)
        const snapshot = lifecyclePayload?.snapshot
        if (
          !forcePlanSelection
          && (
          snapshot?.nextPath
          && !String(snapshot.nextPath).startsWith('/select-plan')
          && !String(snapshot.nextPath).startsWith('/checkout')
          )
        ) {
          router.replace(snapshot.nextPath)
          return
        }
        // Only use the lifecycle snapshot role if the URL didn't already provide a valid
        // role — after Google OAuth the JWT may not yet reflect the updated role so the
        // lifecycle API can return the 'athlete' fallback even for a coach sign-up.
        const urlRoleIsValid =
          requestedRole === 'coach' || requestedRole === 'athlete' || requestedRole === 'org_admin'
        if (
          !urlRoleIsValid
          && (snapshot?.role === 'coach' || snapshot?.role === 'athlete' || snapshot?.role === 'org_admin')
        ) {
          resolvedRole = snapshot.role as 'coach' | 'athlete' | 'org_admin'
        }
      }

      // Check for a pending org invite — org-covered users can skip plan selection.
      const invitesRes = await fetch('/api/org/invites')
      if (invitesRes.ok) {
        const { invites } = await invitesRes.json().catch(() => ({ invites: [] }))
        const pending = (invites || []).find((inv: { status: string }) => inv.status === 'pending')
        if (pending && !cancelled) {
          setPendingOrgInvite({ id: pending.id, org_name: pending.org_name || 'the organization', role: pending.role || '' })
        }
      }

      const tierParam = searchParams.get('tier')
      const tierFromMetadata = session.user.user_metadata?.selected_tier as string | undefined
      const normalizedTier = resolvedRole === 'coach'
        ? normalizeCoachTier(tierParam || tierFromMetadata)
        : resolvedRole === 'athlete'
          ? normalizeAthleteTier(tierParam || tierFromMetadata)
          : normalizeOrgTier(tierParam || tierFromMetadata)
      let currentTier: string | null = null

      if (resolvedRole === 'coach') {
        const { data: planRow } = await supabase
          .from('coach_plans')
          .select('tier')
          .eq('coach_id', session.user.id)
          .maybeSingle()
        currentTier = (planRow?.tier as string | undefined) || null
      } else if (resolvedRole === 'athlete') {
        const { data: planRow } = await supabase
          .from('athlete_plans')
          .select('tier')
          .eq('athlete_id', session.user.id)
          .maybeSingle()
        currentTier = (planRow?.tier as string | undefined) || null
      } else {
        const { data: membership } = await supabase
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (membership?.org_id) {
          const { data: orgSettings } = await supabase
            .from('org_settings')
            .select('plan')
            .eq('org_id', membership.org_id)
            .maybeSingle()
          currentTier = (orgSettings?.plan as string | undefined) || null
        }
      }

      if (cancelled) return
      setRole(resolvedRole)
      const lifecycleTier = (session.user.user_metadata?.selected_tier || '').trim()
      setSelectedPlan(currentTier || lifecycleTier || normalizedTier)
      setLoading(false)
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [router, searchParams, supabase])

  const handleContinue = async () => {
    if (!role || !selectedPlan) {
      setError('Please select a plan to continue.')
      return
    }
    await fetch('/api/lifecycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'plan_selected',
        tier: selectedPlan,
      }),
    }).catch(() => null)
    // Refresh session so middleware sees the updated lifecycle_state = 'plan_selected'
    // before the client-side navigation reaches the server.
    await supabase.auth.refreshSession().catch(() => null)
    setSaving(true)
    setError(null)
    const portalParam = isCoachPortalPlanFlow ? '&portal=coach' : ''
    router.push(`/checkout?role=${role}&tier=${selectedPlan}&from=select-plan${portalParam}`)
  }

  const handleAcceptOrgInvite = async () => {
    if (!pendingOrgInvite) return
    setAcceptingInvite(true)
    const res = await fetch('/api/org/invites/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_id: pendingOrgInvite.id, action: 'accept' }),
    })
    if (res.ok) {
      // Refresh session so middleware sees the updated lifecycle_state = 'active'
      await supabase.auth.refreshSession()
      const { data: { session: fresh } } = await supabase.auth.getSession()
      const r = fresh?.user?.user_metadata?.active_role || fresh?.user?.user_metadata?.role || 'coach'
      router.replace(roleToPath(r))
    } else {
      setAcceptingInvite(false)
    }
  }

  if (loading) {
    return (
      <main className="page-shell">
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
          <div className="rounded-2xl border border-[#191919] bg-white p-6 text-sm text-[#4a4a4a]">
            Loading plan options...
          </div>
        </div>
      </main>
    )
  }

  const planPickerContent = (
    <>
      <div className={isCoachPortalPlanFlow ? 'flex h-12 w-12 items-center justify-center' : 'flex h-16 w-16 items-center justify-center'}>
        <Image
          src="/CHLogoTransparent.PNG"
          alt="Coaches Hive logo"
          width={48}
          height={48}
          className="h-12 w-12 object-contain"
          priority
        />
      </div>
      <h1 className={`font-semibold text-[#191919] ${isCoachPortalPlanFlow ? 'mt-3 text-xl sm:text-2xl' : 'mt-4 text-2xl'}`}>
        Select your plan
      </h1>
      <p className="mt-1 text-sm text-[#4a4a4a]">
        {isCoachPortalPlanFlow ? 'Choose the organization plan before continuing to payment.' : 'Choose a plan to finish account setup.'}
      </p>

      {pendingOrgInvite && (
        <div className="mt-6 w-full max-w-5xl rounded-2xl border border-[#191919] bg-[#f7f6f4] p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Org invite</p>
          <p className="mt-2 text-sm font-semibold text-[#191919]">
            You were invited to join {pendingOrgInvite.org_name}
          </p>
          <p className="mt-1 text-xs text-[#4a4a4a]">
            As an org member your access is covered by the organization — you can accept and go straight to your dashboard without a personal plan.
          </p>
          <button
            type="button"
            onClick={handleAcceptOrgInvite}
            disabled={acceptingInvite}
            className="mt-3 rounded-full bg-[#191919] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {acceptingInvite ? 'Accepting...' : `Accept invite and go to dashboard`}
          </button>
        </div>
      )}

      <div className="mt-7 grid w-full grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlan(plan.id)}
              className={`rounded-2xl border px-5 py-5 text-left transition ${
                isSelected ? 'border-[#b80f0a] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{plan.name}</p>
                {plan.badge ? (
                  <span className="rounded-full border border-[#191919] px-2 py-0.5 text-[10px] font-semibold text-[#191919]">
                    {plan.badge}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-2xl font-semibold text-[#191919]">
                {plan.price}
                <span className="text-xs font-normal text-[#4a4a4a]"> / {plan.cadence}</span>
              </p>
              <p className="mt-1 text-sm text-[#4a4a4a]">{plan.highlight}</p>
              <ul className="mt-4 space-y-2 text-sm text-[#191919]">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#b80f0a]" />
                    <span className="leading-snug">{perk}</span>
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex w-full max-w-5xl flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={handleContinue}
          disabled={saving}
          className="w-full rounded-full bg-[#b80f0a] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 sm:w-auto sm:py-2"
        >
          {saving ? 'Saving...' : 'Continue'}
        </button>
        <Link href="/pricing" className="text-center text-xs text-[#b80f0a] underline sm:text-left">
          View full pricing details
        </Link>
      </div>

      {error ? (
        <p className="mt-3 w-full max-w-5xl rounded-lg border border-[#b80f0a] bg-[#fff5f5] px-3 py-2 text-xs text-[#b80f0a]">
          {error}
        </p>
      ) : null}
    </>
  )

  if (isCoachPortalPlanFlow) {
    return (
      <main className="page-shell">
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10 lg:flex-row">
          <CoachSidebar />
          <section className="min-w-0 flex-1">
            <div className="glass-card border border-[#191919] bg-white px-5 py-8 sm:px-8">
              <div className="mx-auto flex max-w-5xl flex-col items-center">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coach Portal</p>
                <div className="mt-2 w-full">
                  {planPickerContent}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 py-12">
        {planPickerContent}
      </div>
    </main>
  )
}
