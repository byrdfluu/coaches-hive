'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import OnboardingModal from '@/components/OnboardingModal'
import RoleSwitcher from '@/components/RoleSwitcher'
import { getOrgTypeConfig, normalizeOrgType } from '@/lib/orgTypeConfig'
import { formatShortDate } from '@/lib/dateUtils'

type ProfileRow = {
  id: string
  full_name: string | null
  role?: string | null
}

type SessionRow = {
  id: string
  start_time?: string | null
  coach_id?: string | null
}

type OrderRow = {
  id: string
  amount?: number | string | null
  total?: number | string | null
  price?: number | string | null
  created_at?: string | null
}

const parseAmount = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const cleaned = value.replace(/[^0-9.]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isNaN(parsed) ? 0 : parsed
}

export default function OrgPortalPage() {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingSeen, setOnboardingSeen] = useState(false)
  const supabase = createClientComponentClient()
  const [coaches, setCoaches] = useState<ProfileRow[]>([])
  const [athleteCount, setAthleteCount] = useState(0)
  const [sessionsThisMonth, setSessionsThisMonth] = useState(0)
  const [revenueThisMonth, setRevenueThisMonth] = useState(0)
  const [teamCount, setTeamCount] = useState(0)
  const [feeCount, setFeeCount] = useState(0)
  const [orgStripeConnected, setOrgStripeConnected] = useState(false)
  const [unpaidFeeCount, setUnpaidFeeCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [orgType, setOrgType] = useState<'school' | 'club' | 'travel' | 'academy' | 'organization'>('organization')
  const [orgName, setOrgName] = useState('Organization')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [hiddenSections, setHiddenSections] = useState<string[]>([])
  const [layoutSaving, setLayoutSaving] = useState(false)
  const searchParams = useSearchParams()
  const [billingBannerDismissed, setBillingBannerDismissed] = useState(false)
  const [billingInfo, setBillingInfo] = useState<{
    status: string | null
    tier: string | null
    current_period_end: string | null
    trial_end: string | null
    cancel_at_period_end: boolean
  } | null>(null)
  const [toast, setToast] = useState('')
  const [toastAction, setToastAction] = useState<{ label: string; onAction: () => void } | null>(null)

  const orgSlug = orgName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const pushToast = (message: string, action?: { label: string; onAction: () => void }) => {
    setToast(message)
    setToastAction(action ?? null)
  }
  const billingLabel = billingInfo?.tier
    ? billingInfo.tier.charAt(0).toUpperCase() + billingInfo.tier.slice(1)
    : billingInfo?.status
      ? billingInfo.status.replace(/_/g, ' ')
      : 'Subscription'

  const handleOpenCustomerPortal = async () => {
    const response = await fetch('/api/stripe/customer-portal', { method: 'POST' })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.url) {
      setToast(data?.error || 'Unable to open billing portal.')
      return
    }
    window.open(data.url, '_blank', 'noopener,noreferrer')
  }


  useEffect(() => {
    let active = true
    const loadBilling = async () => {
      const response = await fetch('/api/stripe/billing-info')
      if (!response.ok || !active) return
      const data = await response.json()
      if (!active) return
      setBillingInfo({
        status: data.status ?? null,
        tier: data.tier ?? null,
        current_period_end: data.current_period_end ?? null,
        trial_end: data.trial_end ?? null,
        cancel_at_period_end: Boolean(data.cancel_at_period_end),
      })
    }
    loadBilling()
    return () => {
      active = false
    }
  }, [])

  const handleCloseOnboarding = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ch_onboarding_org_v1', '1')
    }
    setOnboardingSeen(true)
    setShowOnboarding(false)
  }

  useEffect(() => {
    let active = true
    const loadOrg = async () => {
      setLoading(true)
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData.user?.id
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId || '')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const membershipRow = (membership || null) as { org_id?: string | null } | null
      const nextOrgId = membershipRow?.org_id || null
      setOrgId(nextOrgId)
      const { data: coachRows } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('role', 'coach')
        .order('full_name')

      const { data: athleteRows } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('role', 'athlete')

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, start_time, coach_id')
        .gte('start_time', monthStart)
        .lte('start_time', monthEnd)

      const { data: orders } = await supabase
        .from('orders')
        .select('id, amount, total, price, created_at')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd)

      let nextTeamCount = 0
      let nextStripeConnected = false
      if (nextOrgId) {
        const { data: org } = await supabase
          .from('organizations')
          .select('name, org_type')
          .eq('id', nextOrgId)
          .maybeSingle()
        const orgRow = (org || null) as { name?: string | null; org_type?: string | null } | null
        if (orgRow?.org_type) {
          setOrgType(normalizeOrgType(orgRow.org_type))
        }
        if (orgRow?.name) setOrgName(orgRow.name)

        const { data: teamRows } = await supabase
          .from('org_teams')
          .select('id')
          .eq('org_id', nextOrgId)

        const { data: orgSettings } = await supabase
          .from('org_settings')
          .select('stripe_account_id')
          .eq('org_id', nextOrgId)
          .maybeSingle()
        const settingsRow = (orgSettings || null) as { stripe_account_id?: string | null } | null

        nextTeamCount = (teamRows || []).length
        nextStripeConnected = Boolean(settingsRow?.stripe_account_id)
      }

      if (!active) return
      setCoaches((coachRows || []) as ProfileRow[])
      setAthleteCount((athleteRows || []).length)
      setTeamCount(nextTeamCount)
      setOrgStripeConnected(nextStripeConnected)
      const sessionRows = (sessions || []) as SessionRow[]
      setSessionsThisMonth(sessionRows.length)
      const orderRows = (orders || []) as OrderRow[]
      const revenue = orderRows.reduce((sum, order) => {
        return sum + parseAmount(order.amount ?? order.total ?? order.price)
      }, 0)
      setRevenueThisMonth(revenue)
      setLoading(false)
    }
    loadOrg()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    if (!orgId) return
    let active = true
    const loadOnboarding = async () => {
      const localSeen = typeof window !== 'undefined'
        && window.localStorage.getItem('ch_onboarding_org_v1') === '1'
      const response = await fetch(`/api/org/onboarding?org_id=${encodeURIComponent(orgId)}`)
      const payload = response.ok ? await response.json().catch(() => null) : null
      if (!active) return
      const completedSteps = Array.isArray(payload?.onboarding?.completed_steps)
        ? payload.onboarding.completed_steps
        : []
      const seen = payload?.onboarding
        ? completedSteps.includes('modal_seen')
        : localSeen
      setOnboardingSeen(seen)
      setShowOnboarding(!seen)
    }
    void loadOnboarding()
    return () => {
      active = false
    }
  }, [orgId])

  useEffect(() => {
    let active = true
    const loadLayout = async () => {
      const response = await fetch('/api/dashboard-layout?page=org_overview')
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      setHiddenSections(payload.hidden_sections || [])
    }
    loadLayout()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadFees = async () => {
      const response = await fetch('/api/org/charges')
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      const assignments = payload.assignments || []
      const unpaid = assignments.filter((row: { status?: string }) => row.status === 'unpaid').length
      setFeeCount((payload.fees || []).length)
      setUnpaidFeeCount(unpaid)
    }
    loadFees()
    return () => {
      active = false
    }
  }, [])

  const labels = getOrgTypeConfig(orgType).portal

  const stats = useMemo(
    () => [
      { label: 'Total teams', value: teamCount.toString(), href: '/org/teams' },
      { label: 'Active coaches', value: coaches.length.toString() || '0', href: '/org/coaches' },
      { label: 'Active athletes', value: athleteCount.toString(), href: '/org/teams' },
      {
        label: 'Monthly revenue',
        value: revenueThisMonth ? `$${revenueThisMonth.toFixed(0)}` : '$0',
        href: '/org/reports',
      },
    ],
    [coaches.length, athleteCount, revenueThisMonth, teamCount],
  )

  const activationTasks = useMemo(
    () => [
      {
        id: 'stripe',
        title: 'Connect billing',
        done: orgStripeConnected,
        action: { label: 'Connect Stripe', href: '/org/settings' },
      },
      {
        id: 'team',
        title: 'Create your first team',
        done: teamCount > 0,
        action: { label: 'Create team', href: '/org/teams' },
      },
      {
        id: 'coach',
        title: 'Invite your first coach',
        done: coaches.length > 0,
        action: { label: 'Invite coach', href: '/org/coaches' },
      },
      {
        id: 'fee',
        title: 'Create your first fee',
        done: feeCount > 0,
        action: { label: 'Create fee', href: '/org/payments' },
      },
    ],
    [coaches.length, feeCount, orgStripeConnected, teamCount],
  )
  const activationComplete = activationTasks.filter((task) => task.done).length
  const needsBillingNudge = unpaidFeeCount > 0

  const recentCoaches = coaches.slice(0, 3)

  useEffect(() => {
    if (!orgId) return
    const sync = async () => {
      const doneIds = activationTasks.filter((task) => task.done).map((task) => task.id)
      const completedSteps = onboardingSeen ? [...doneIds, 'modal_seen'] : doneIds
      await fetch('/api/org/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          completed_steps: completedSteps,
          total_steps: activationTasks.length,
        }),
      })
    }
    sync()
  }, [activationComplete, activationTasks, coaches.length, feeCount, onboardingSeen, orgId, orgStripeConnected, teamCount])

  return (
    <main className="page-shell">
      <OnboardingModal role="org" open={showOnboarding} onClose={handleCloseOnboarding} />
      {searchParams?.get('billing') === 'cancel_scheduled' && !billingBannerDismissed && (
        <div className="flex items-center justify-between gap-4 border-b border-[#f5c2c2] bg-[#fff5f5] px-6 py-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#b80f0a]" />
            <p className="text-[#191919]">
              {billingInfo?.current_period_end
                ? `Your subscription will stay active through ${formatShortDate(new Date(billingInfo.current_period_end))}. Access will end after that unless you reactivate.`
                : 'Your subscription will stay active until the end of the current billing period. Access will end after that unless you reactivate.'}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <Link
              href="/select-plan?role=org_admin"
              className="rounded-full bg-[#b80f0a] px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              Reactivate
            </Link>
            <button
              type="button"
              onClick={() => setBillingBannerDismissed(true)}
              aria-label="Dismiss"
              className="text-[#9a9a9a] transition-colors hover:text-[#191919]"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {searchParams?.get('billing') === 'past_due' && !billingBannerDismissed && (
        <div className="flex items-center justify-between gap-4 border-b border-[#f5e2a0] bg-[#fffbeb] px-6 py-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#b45309]" />
            <p className="text-[#191919]">Your last payment failed. Update your payment method to avoid losing access.</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={handleOpenCustomerPortal}
              className="rounded-full bg-[#b45309] px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              Update payment method
            </button>
            <button
              type="button"
              onClick={() => setBillingBannerDismissed(true)}
              aria-label="Dismiss"
              className="text-[#9a9a9a] transition-colors hover:text-[#191919]"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {orgId && orgName && orgName !== 'Organization' && (
              <p className="text-sm font-semibold text-[#191919] mb-0.5">{orgName}</p>
            )}
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{labels.header}</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">{labels.title}</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">{labels.description}</p>
          </div>
          <div className="flex flex-col items-start gap-3 text-sm sm:items-end">
            <RoleSwitcher />
            {billingInfo?.status && (
              <Link
                href="/org/settings#billing"
                className="flex items-center gap-1.5 rounded-full border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-1 text-xs text-[#4a4a4a] transition-colors hover:border-[#191919]"
              >
                <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${billingInfo.status === 'active' ? 'bg-green-500' : billingInfo.status === 'trialing' ? 'bg-blue-500' : 'bg-[#b80f0a]'}`} />
                <span className="font-semibold capitalize">{billingLabel}</span>
                {billingInfo.status === 'trialing' && billingInfo.trial_end
                  ? <span>· Trial ends {formatShortDate(new Date(billingInfo.trial_end))}</span>
                  : billingInfo.cancel_at_period_end && billingInfo.current_period_end
                    ? <span>· Cancels {formatShortDate(new Date(billingInfo.current_period_end))}</span>
                    : billingInfo.status === 'active' && billingInfo.current_period_end
                    ? <span>· Renews {formatShortDate(new Date(billingInfo.current_period_end))}</span>
                    : billingInfo.status !== 'active' && billingInfo.status !== 'trialing'
                      ? <span>· {billingInfo.status.replace(/_/g, ' ')}</span>
                      : null}
              </Link>
            )}
            <div className="flex flex-wrap gap-2">
              {orgSlug ? (
                <Link
                  href={`/organizations/${orgSlug}`}
                  className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Go to profile
                </Link>
              ) : null}
              <button
                type="button"
                className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                onClick={() => setCustomizeOpen(true)}
              >
                Customize
              </button>
              <Link
                href="/org/permissions"
                className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
              >
                Invite coach
              </Link>
              <Link
                href="/org/teams"
                className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white hover:opacity-90 transition-opacity"
              >
                Create team
              </Link>
            </div>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="space-y-10">
            {!hiddenSections.includes('stripe_banner') && !orgStripeConnected && (
              <section className="rounded-2xl border border-[#b80f0a] bg-white p-4 text-sm text-[#191919]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#191919]">Connect Stripe to start receiving payments</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Set up Stripe Connect for organization payouts and billing.</p>
                </div>
                <Link
                  href="/org/stripe-setup"
                  className="rounded-full border border-[#b80f0a] px-4 py-2 text-xs font-semibold text-[#b80f0a]"
                >
                  Set up Stripe
                </Link>
              </div>
              </section>
            )}
            {!hiddenSections.includes('activation') && activationComplete < activationTasks.length && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Activation checklist</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Stand up your program</h2>
                    <p className="mt-1 text-sm text-[#4a4a4a]">Complete the steps below to unlock billing and reports.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                      {activationComplete}/{activationTasks.length} complete
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const next = Array.from(new Set([...hiddenSections, 'activation']))
                        const previous = hiddenSections.filter((section) => section !== 'activation')
                        setHiddenSections(next)
                        await fetch('/api/dashboard-layout', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ page: 'org_overview', hidden_sections: next }),
                        })
                        pushToast('Activation checklist hidden', {
                          label: 'Undo',
                          onAction: async () => {
                            setHiddenSections(previous)
                            await fetch('/api/dashboard-layout', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ page: 'org_overview', hidden_sections: previous }),
                            })
                            pushToast('Activation checklist restored')
                          },
                        })
                      }}
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Hide
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm">
                  {activationTasks.map((task) => (
                    <div key={task.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-[#191919]">{task.title}</p>
                        <span className="rounded-full border border-[#191919] px-2 py-0.5 text-[11px] font-semibold text-[#191919]">
                          {task.done ? 'Done' : 'Open'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {task.id === 'stripe' ? (
                          <Link
                            href="/org/stripe-setup"
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] transition-colors hover:text-[#b80f0a]"
                          >
                            {task.action.label}
                          </Link>
                        ) : (
                          <Link
                            href={task.action.href}
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                          >
                            {task.action.label}
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!hiddenSections.includes('billing_followup') && needsBillingNudge && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Billing follow-up</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Outstanding fees need attention</h2>
                    <p className="mt-1 text-sm text-[#4a4a4a]">{unpaidFeeCount} unpaid fees are awaiting payment.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Link href="/org/payments" className="rounded-full bg-[#b80f0a] px-3 py-1 font-semibold text-white">
                      Review fees
                    </Link>
                    <Link href="/org/messages" className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                      Message members
                    </Link>
                  </div>
                </div>
              </section>
            )}
            {!hiddenSections.includes('stats') && (
              <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Link
                  key={stat.label}
                  href={stat.href}
                  className="glass-card border border-[#191919] bg-white p-5 no-underline transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                >
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </Link>
              ))}
              </section>
            )}

            {!hiddenSections.includes('teams') && (
              <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[#191919]">{labels.teamsLabel}</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">{labels.teamsBody}</p>
                </div>
                <Link href="/org/teams" className="text-sm font-semibold text-[#191919] underline">
                  Manage {labels.teamsLabel.toLowerCase()}
                </Link>
              </div>
              <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                {loading ? 'Loading team data...' : 'View teams, roster size, and coach assignments.'}
              </div>
              </section>
            )}

            {!hiddenSections.includes('coaches') && (
              <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[#191919]">{labels.coachesLabel}</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">{labels.coachesBody}</p>
                </div>
                <Link href="/org/coaches" className="text-sm font-semibold text-[#191919] underline">
                  View coaches
                </Link>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {recentCoaches.length === 0 ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                    {loading ? 'Loading coaches...' : 'No coaches found yet.'}
                  </div>
                ) : (
                  recentCoaches.map((coach) => (
                    <div key={coach.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                      <p className="font-semibold text-[#191919]">{coach.full_name || 'Coach'}</p>
                      <p className="text-xs text-[#4a4a4a]">Active</p>
                    </div>
                  ))
                )}
              </div>
              </section>
            )}

            {!hiddenSections.includes('calendar') && (
              <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[#191919]">{labels.calendarLabel}</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">{sessionsThisMonth} sessions scheduled this month.</p>
                </div>
                <Link href="/org/calendar" className="text-sm font-semibold text-[#191919] underline">
                  Open calendar
                </Link>
              </div>
              </section>
            )}

            {!hiddenSections.includes('footer_cards') && (
              <section className="grid gap-4 md:grid-cols-2">
              <div className="glass-card border border-[#191919] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#191919]">Branding</h3>
                <p className="mt-1 text-sm text-[#4a4a4a]">Update logo and org colors.</p>
                <Link href="/org/settings" className="mt-3 inline-block text-sm font-semibold text-[#191919] underline">
                  Manage settings
                </Link>
              </div>
              <div className="glass-card border border-[#191919] bg-white p-6">
                <h3 className="text-lg font-semibold text-[#191919]">{labels.reportsLabel}</h3>
                <p className="mt-1 text-sm text-[#4a4a4a]">Export attendance, revenue, and retention.</p>
                <Link href="/org/reports" className="mt-3 inline-block text-sm font-semibold text-[#191919] underline">
                  View reports
                </Link>
              </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {customizeOpen && (
        <div className="fixed inset-0 z-[1200] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 md:items-center md:py-8">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100vw-2rem)] overflow-y-auto rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl sm:max-h-[85vh] sm:max-w-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Customize</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Overview sections</h2>
                <p className="mt-2 text-sm text-[#4a4a4a]">Toggle sections on or off. Data stays intact.</p>
              </div>
              <button
                type="button"
                onClick={() => setCustomizeOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { id: 'activation', label: 'Activation checklist' },
                { id: 'billing_followup', label: 'Billing follow-up' },
                { id: 'stripe_banner', label: 'Stripe reminder' },
                { id: 'stats', label: 'Stat cards' },
                { id: 'teams', label: 'Teams summary' },
                { id: 'coaches', label: 'Coach directory' },
                { id: 'calendar', label: 'Calendar summary' },
                { id: 'footer_cards', label: 'Branding + reports' },
              ].map((section) => (
                <label key={section.id} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3">
                  <span className="font-semibold text-[#191919]">{section.label}</span>
                  <input
                    type="checkbox"
                    checked={!hiddenSections.includes(section.id)}
                    onChange={(event) => {
                      const next = new Set(hiddenSections)
                      if (event.target.checked) {
                        next.delete(section.id)
                      } else {
                        next.add(section.id)
                      }
                      setHiddenSections(Array.from(next))
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                onClick={async () => {
                  setLayoutSaving(true)
                  await fetch('/api/dashboard-layout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ page: 'org_overview', hidden_sections: hiddenSections }),
                  })
                  setLayoutSaving(false)
                  setCustomizeOpen(false)
                  pushToast('Save complete')
                }}
                disabled={layoutSaving}
              >
                {layoutSaving ? 'Saving...' : 'Save layout'}
              </button>
              <button
                type="button"
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                onClick={() => setCustomizeOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast
        message={toast}
        onClose={() => {
          setToast('')
          setToastAction(null)
        }}
        actionLabel={toastAction?.label}
        onAction={toastAction?.onAction}
      />
    </main>
  )
}
