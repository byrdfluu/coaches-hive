'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import Toast from '@/components/Toast'
import OnboardingModal from '@/components/OnboardingModal'
import InviteUserModal from '@/components/InviteUserModal'
import RoleSwitcher from '@/components/RoleSwitcher'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { formatShortDate } from '@/lib/dateUtils'
import { ORG_PLAN_PRICING } from '@/lib/orgPricing'
import { isCoachAthleteLaunch } from '@/lib/launchSurface'
import { getFeePercentage, resolveProductCategory, type FeeTier } from '@/lib/platformFees'
import { useRouter, useSearchParams } from 'next/navigation'

const orgPlanOptions = [
  {
    id: 'standard',
    name: 'Standard',
    price: ORG_PLAN_PRICING.standard,
    summary: 'Core tools for programs and teams.',
    perks: ['Up to 5 coaches + 50 athletes', 'Org dashboard + team management'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: ORG_PLAN_PRICING.growth,
    summary: 'Automations and compliance-ready ops.',
    perks: ['Up to 20 coaches + 250 athletes', 'Role-based access + exports'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: ORG_PLAN_PRICING.enterprise,
    summary: 'Unlimited scale and advanced controls.',
    perks: ['Unlimited coaches + athletes', 'Advanced permissions + custom branding'],
  },
] as const

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const formatCurrency = (value: number) => `$${value.toFixed(2).replace(/\.00$/, '')}`
const parseMoney = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

type DashboardInboxThread = {
  id: string
  name: string
  preview: string
  time: string
  unread: boolean
}

type DashboardProgram = {
  id: string
  title: string
  status: string
  category: string
}

type DashboardFeeRule = {
  tier: string
  category: string
  percentage: number
}

export default function CoachDashboard() {
  const now = new Date()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingSeen, setOnboardingSeen] = useState(false)
  const [onboardingReady, setOnboardingReady] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const supabase = createClientComponentClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [billingBannerDismissed, setBillingBannerDismissed] = useState(false)
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null)
  const [stripeStatusLoading, setStripeStatusLoading] = useState(true)
  const [billingInfo, setBillingInfo] = useState<{
    status: string | null
    tier: string | null
    current_period_end: string | null
    trial_end: string | null
    cancel_at_period_end: boolean
  } | null>(null)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [hiddenSections, setHiddenSections] = useState<string[]>([])
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [toastAction, setToastAction] = useState<{ label: string; onAction: () => void } | null>(null)
  const [invites, setInvites] = useState<any[]>([])
  const [sessionCount, setSessionCount] = useState(0)
  const [lastSessionDate, setLastSessionDate] = useState<Date | null>(null)
  const [availabilityCount, setAvailabilityCount] = useState(0)
  const [productCount, setProductCount] = useState(0)
  const [coachProfileComplete, setCoachProfileComplete] = useState(false)
  const [coachVerificationSubmitted, setCoachVerificationSubmitted] = useState(false)
  const [coachSlug, setCoachSlug] = useState('')
  const [coachName, setCoachName] = useState('')
  const [upcomingSessions, setUpcomingSessions] = useState<Array<{ time: string; athlete: string; focus: string; status: string }>>([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [demandSignals, setDemandSignals] = useState<Array<{ label: string; score: number }>>([])
  const [dashboardPrograms, setDashboardPrograms] = useState<DashboardProgram[]>([])
  const [loadingPrograms, setLoadingPrograms] = useState(true)
  const [dashboardThreads, setDashboardThreads] = useState<DashboardInboxThread[]>([])
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [unreadThreadCount, setUnreadThreadCount] = useState(0)
  const [spendSummary, setSpendSummary] = useState({ grossBooked: 0, netBooked: 0, pendingPayouts: 0, paidOut: 0 })
  const [loadingSpend, setLoadingSpend] = useState(true)
  const [isOrgOnlyCoach, setIsOrgOnlyCoach] = useState(false)
  const [showOrgCreate, setShowOrgCreate] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState<'school' | 'club' | 'travel' | 'academy'>('club')
  const [selectedOrgPlan, setSelectedOrgPlan] = useState<(typeof orgPlanOptions)[number]['id']>('standard')
  const [orgCreating, setOrgCreating] = useState(false)
  const [orgCreateError, setOrgCreateError] = useState('')
  const [orgJoinName, setOrgJoinName] = useState('')
  const [orgJoinTeamName, setOrgJoinTeamName] = useState('')
  const [orgJoinRole, setOrgJoinRole] = useState<'coach' | 'assistant_coach'>('coach')
  const [orgJoinLoading, setOrgJoinLoading] = useState(false)
  const [orgJoinNotice, setOrgJoinNotice] = useState('')
  const [existingOrg, setExistingOrg] = useState<{
    name: string
    orgType?: string | null
    role?: string | null
    teams?: string[]
  } | null>(null)
  const pushToast = (message: string, action?: { label: string; onAction: () => void }) => {
    setToast(message)
    setToastAction(action ?? null)
  }
  const coachOrgEntryPointsEnabled = !isCoachAthleteLaunch
  const billingLabel = billingInfo?.tier
    ? billingInfo.tier.charAt(0).toUpperCase() + billingInfo.tier.slice(1)
    : billingInfo?.status
      ? billingInfo.status.replace(/_/g, ' ')
      : 'Subscription'

  const continueToOrgPlans = async ({
    checkoutRole,
    orgRecord,
  }: {
    checkoutRole: string
    orgRecord: {
      name: string
      orgType?: string | null
      role?: string | null
      teams?: string[]
    } | null
  }) => {
    setOrgCreating(true)
    setOrgCreateError('')
    if (orgRecord) {
      setExistingOrg(orgRecord)
    }
    const roleResponse = await fetch('/api/roles/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: checkoutRole }),
    }).catch(() => null)
    if (!roleResponse?.ok) {
      const rolePayload = await roleResponse?.json().catch(() => null)
      setOrgCreateError(
        rolePayload?.error || 'Organization was created, but account role setup failed. Sign in again and retry org setup.',
      )
      setOrgCreating(false)
      return
    }
    await supabase.auth.refreshSession().catch(() => null)
    setShowOrgCreate(false)
    setOrgName('')
    setExistingOrg(null)
    pushToast('Organization ready. Choose your org plan to continue.')
    window.location.assign(
      `/select-plan?role=${encodeURIComponent(checkoutRole)}&tier=${encodeURIComponent(selectedOrgPlan)}&force_plan_selection=1&portal=coach`,
    )
  }

  const handleCreateOrg = async () => {
    if (!orgName.trim()) {
      setOrgCreateError('Enter an organization name.')
      return
    }

    setOrgCreating(true)
    setOrgCreateError('')
    const response = await fetch('/api/org/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_name: orgName.trim(), org_type: orgType, tier: selectedOrgPlan }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      if (response.status === 409) {
        const existingOrgRecord = {
          name: payload?.org?.name || 'Organization',
          orgType: payload?.org?.org_type || null,
          role: payload?.org?.role || null,
          teams: Array.isArray(payload?.teams) ? payload.teams : [],
        }
        setExistingOrg(existingOrgRecord)
        setOrgCreateError('This account already has an organization. Continue to org plans to choose billing, or open the org portal if billing is already active.')
        await continueToOrgPlans({
          checkoutRole: String(payload?.org?.role || 'org_admin'),
          orgRecord: existingOrgRecord,
        })
        return
      }
      setOrgCreateError(payload?.error || 'Unable to create organization.')
      setOrgCreating(false)
      return
    }
    const payload = await response.json().catch(() => null)
    await continueToOrgPlans({
      checkoutRole: String(payload?.membership_role || 'org_admin'),
      orgRecord: {
        name: payload?.org?.name || orgName.trim(),
        orgType: payload?.org?.org_type || orgType,
        role: payload?.membership_role || 'org_admin',
        teams: [],
      },
    })
  }

  const handleRequestOrgAccess = async () => {
    const requestedOrg = orgJoinName.trim()
    const requestedTeam = orgJoinTeamName.trim()
    if (!requestedOrg) {
      setOrgJoinNotice('Enter the organization name to request access.')
      return
    }
    setOrgJoinLoading(true)
    setOrgJoinNotice('')
    const response = await fetch('/api/org/join-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_name: requestedOrg,
        team_name: requestedTeam || null,
        role: orgJoinRole,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setOrgJoinNotice(payload?.error || 'Unable to send access request.')
      setOrgJoinLoading(false)
      return
    }
    setOrgJoinLoading(false)
    setOrgJoinName('')
    setOrgJoinTeamName('')
    setOrgJoinRole('coach')
    setOrgJoinNotice('Request sent. Org admins have been notified to review your access.')
    pushToast('Access request sent to organization admins.')
  }

  const activationTasks = useMemo(
    () => [
      {
        id: 'profile',
        title: 'Complete coach profile',
        done: coachProfileComplete,
        action: { label: 'Complete profile', href: '/coach/settings#profile' },
      },
      {
        id: 'verification',
        title: 'Submit verification',
        done: coachVerificationSubmitted,
        action: { label: 'Submit verification', href: '/coach/settings#verification' },
      },
      {
        id: 'stripe',
        title: 'Connect payouts',
        done: stripeConnected === true,
        action: { label: 'Connect Stripe', href: '/coach/stripe-setup' },
      },
      {
        id: 'availability',
        title: 'Publish availability',
        done: availabilityCount > 0,
        action: { label: 'Set availability', href: '/coach/calendar' },
      },
      {
        id: 'listing',
        title: 'Create your first listing',
        done: productCount > 0,
        action: { label: 'Create listing', href: '/coach/marketplace/create' },
      },
      {
        id: 'booking',
        title: 'Complete first booking',
        done: sessionCount > 0,
        action: { label: 'View bookings', href: '/coach/bookings' },
      },
    ],
    [availabilityCount, coachProfileComplete, coachVerificationSubmitted, productCount, sessionCount, stripeConnected],
  )
  const activationComplete = activationTasks.filter((task) => task.done).length
  const daysSinceSession = lastSessionDate ? Math.floor((now.getTime() - lastSessionDate.getTime()) / 86400000) : null
  const needsRetentionNudge = !lastSessionDate || (daysSinceSession !== null && daysSinceSession > 14)
  const pendingInviteCount = invites.filter((i) => i.status === 'pending').length

  useEffect(() => {
    if (!onboardingReady) return
    const sync = async () => {
      const doneIds = activationTasks.filter((task) => task.done).map((task) => task.id)
      const completedSteps = onboardingSeen ? [...doneIds, 'modal_seen'] : doneIds
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'coach',
          completed_steps: completedSteps,
          total_steps: activationTasks.length + (onboardingSeen ? 1 : 0),
        }),
      })
    }
    void sync()
  }, [activationTasks, onboardingReady, onboardingSeen])

  useEffect(() => {
    let active = true
    const loadOnboarding = async () => {
      const localSeen = typeof window !== 'undefined'
        && window.localStorage.getItem('ch_onboarding_coach_v1') === '1'
      const response = await fetch('/api/onboarding')
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
      setOnboardingReady(true)
    }
    void loadOnboarding()
    return () => {
      active = false
    }
  }, [])

  const loadStripeStatus = async () => {
    setStripeStatusLoading(true)
    try {
      const { data } = await supabase.auth.getUser()
      const userId = data.user?.id
      if (!userId) return
      setCurrentUserId(userId)
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_account_id, full_name, email, bio, verification_status, coach_profile_settings')
        .eq('id', userId)
        .maybeSingle()
      const profileRow = (profile || null) as {
        stripe_account_id?: string | null
        full_name?: string | null
        email?: string | null
        bio?: string | null
        verification_status?: string | null
        coach_profile_settings?: {
          title?: string | null
          primarySport?: string | null
          rates?: {
            oneOnOne?: string | null
            team?: string | null
            group?: string | null
            virtual?: string | null
            assessment?: string | null
          } | null
        } | null
      } | null
      if (profileRow?.stripe_account_id) {
        setStripeConnected(true)
      } else {
        // Client-side Supabase may not see stripe_account_id due to RLS; call the server-side verify as fallback
        try {
          const verifyRes = await fetch('/api/stripe/connect/verify')
          if (verifyRes.ok) {
            const verifyPayload = await verifyRes.json().catch(() => null)
            setStripeConnected(Boolean(verifyPayload?.connected))
          } else {
            setStripeConnected(false)
          }
        } catch {
          setStripeConnected(false)
        }
      }
      const rateValues = Object.values(profileRow?.coach_profile_settings?.rates || {})
        .map((value) => String(value || '').trim())
        .filter(Boolean)
      setCoachProfileComplete(
        Boolean(
          profileRow?.full_name?.trim() &&
          profileRow?.bio?.trim() &&
          profileRow?.coach_profile_settings?.title?.trim() &&
          profileRow?.coach_profile_settings?.primarySport?.trim() &&
          rateValues.length > 0,
        ),
      )
      setCoachVerificationSubmitted(
        ['pending', 'approved'].includes(String(profileRow?.verification_status || '').toLowerCase()),
      )
      const displayName = profileRow?.full_name || profileRow?.email || userId
      setCoachSlug(slugify(displayName))
      setCoachName((profileRow?.full_name || '').split(' ')[0] || '')
    } finally {
      setStripeStatusLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    const run = async () => {
      await loadStripeStatus()
      if (!active) return
    }
    void run()
    return () => {
      active = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  useEffect(() => {
    let active = true
    const loadLayout = async () => {
      const response = await fetch('/api/dashboard-layout?page=coach_dashboard')
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
    const loadInvites = async () => {
      const response = await fetch('/api/org/invites')
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      setInvites(payload.invites || [])
    }
    loadInvites()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadActivation = async () => {
      setLoadingPrograms(true)
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) {
        setLoadingSessions(false)
        setLoadingPrograms(false)
        return
      }
      const nowIso = new Date().toISOString()
      const [sessionRows, sessionsRes, availabilityRows, productRows, orgMemberRow, coachPlanRow] = await Promise.all([
        supabase.from('sessions').select('start_time').eq('coach_id', userId),
        fetch(`/api/sessions?start=${encodeURIComponent(nowIso)}`),
        supabase.from('availability_blocks').select('id').eq('coach_id', userId),
        supabase.from('products').select('id, title, name, status, type, category').eq('coach_id', userId),
        supabase.from('organization_memberships').select('org_id').eq('user_id', userId).maybeSingle(),
        supabase.from('coach_plans').select('tier').eq('coach_id', userId).maybeSingle(),
      ])
      if (!active) return
      const sessions = (sessionRows.data || []) as Array<{ start_time?: string | null }>
      setSessionCount(sessions.length)
      const sorted = sessions
        .filter((session): session is { start_time: string } => Boolean(session.start_time))
        .sort((a, b) =>
          new Date(b.start_time || '').getTime() - new Date(a.start_time || '').getTime(),
        )
      setLastSessionDate(sorted.length ? new Date(sorted[0].start_time) : null)
      setAvailabilityCount((availabilityRows.data || []).length)
      const productItems = ((productRows.data || []) as Array<{
        id: string
        title?: string | null
        name?: string | null
        status?: string | null
        type?: string | null
        category?: string | null
      }>)
      setProductCount(productItems.length)
      setDashboardPrograms(
        productItems
          .filter((product) => String(product.status || '').toLowerCase() !== 'draft')
          .map((product) => ({
            id: product.id,
            title: product.title || product.name || 'Program',
            status: product.status || 'active',
            category: product.type || product.category || 'Program',
          })),
      )
      setLoadingPrograms(false)
      setIsOrgOnlyCoach(!coachPlanRow.data?.tier && Boolean(orgMemberRow.data?.org_id))

      const sessionsPayload = sessionsRes.ok ? await sessionsRes.json().catch(() => ({})) : {}
      const allUpcoming = ((sessionsPayload.sessions || []) as Array<{
        id: string
        title?: string | null
        start_time?: string | null
        status?: string | null
        athlete_id?: string | null
        athlete_name?: string | null
      }>)
        .filter((s) => {
          const st = String(s.status || '').toLowerCase()
          return !['cancelled', 'completed', 'rescheduled'].includes(st)
        })
        .sort((a, b) => new Date(a.start_time || '').getTime() - new Date(b.start_time || '').getTime())
        .slice(0, 5)

      if (!active) return
      setUpcomingSessions(
        allUpcoming.map((s) => ({
          time: s.start_time
            ? new Date(s.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : 'TBD',
          athlete: s.athlete_name || 'Athlete',
          focus: s.title || 'Session',
          status: s.status || 'Scheduled',
        })),
      )
      setLoadingSessions(false)
    }
    loadActivation()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    let active = true
    const loadInboxSummary = async () => {
      setLoadingInbox(true)
      const response = await fetch('/api/messages/inbox', { cache: 'no-store' }).catch(() => null)
      if (!active) return
      if (!response?.ok) {
        setDashboardThreads([])
        setUnreadThreadCount(0)
        setLoadingInbox(false)
        return
      }
      const payload = await response.json().catch(() => ({}))
      if (!active) return
      const threads = ((payload.threads || []) as Array<{
        id: string
        name?: string
        preview?: string
        time?: string
        unread?: boolean
      }>).map((thread) => ({
        id: thread.id,
        name: thread.name || 'Conversation',
        preview: thread.preview || 'Start the conversation',
        time: thread.time || '',
        unread: Boolean(thread.unread),
      }))
      setDashboardThreads(threads)
      setUnreadThreadCount(threads.filter((thread) => thread.unread).length)
      setLoadingInbox(false)
    }
    void loadInboxSummary()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    let active = true
    const loadSpendSummary = async () => {
      setLoadingSpend(true)
      const [ordersResult, payoutsResult, sessionPaymentsResult, coachPlanResult, feeRuleResult, productResult] = await Promise.all([
        supabase.from('orders').select('amount, total, price, status, product_id').eq('coach_id', currentUserId),
        supabase.from('coach_payouts').select('amount, status').eq('coach_id', currentUserId),
        supabase.from('session_payments').select('amount, status').eq('coach_id', currentUserId),
        supabase.from('coach_plans').select('tier').eq('coach_id', currentUserId).maybeSingle(),
        supabase.from('platform_fee_rules').select('tier, category, percentage').eq('active', true),
        supabase.from('products').select('id, type, category').eq('coach_id', currentUserId),
      ])

      if (!active) return

      const feeRules = (feeRuleResult.data || []) as DashboardFeeRule[]
      const coachTier = (coachPlanResult.data?.tier as FeeTier) || 'starter'
      const productCategoryMap = new Map(
        ((productResult.data || []) as Array<{ id: string; type?: string | null; category?: string | null }>).map((product) => [
          product.id,
          resolveProductCategory(product.type || product.category),
        ]),
      )

      const orders = (ordersResult.data || []) as Array<{
        amount?: number | string | null
        total?: number | string | null
        price?: number | string | null
        status?: string | null
        product_id?: string | null
      }>
      const sessionPayments = (sessionPaymentsResult.data || []) as Array<{
        amount?: number | string | null
        status?: string | null
      }>
      const payouts = (payoutsResult.data || []) as Array<{
        amount?: number | string | null
        status?: string | null
      }>

      const grossOrders = orders.reduce((sum, order) => {
        const status = String(order.status || '').toLowerCase()
        if (['failed', 'refunded', 'cancelled', 'canceled'].includes(status)) return sum
        return sum + parseMoney(order.amount ?? order.total ?? order.price)
      }, 0)

      const netOrders = orders.reduce((sum, order) => {
        const status = String(order.status || '').toLowerCase()
        if (['failed', 'refunded', 'cancelled', 'canceled'].includes(status)) return sum
        const amount = parseMoney(order.amount ?? order.total ?? order.price)
        const productCategory = order.product_id ? productCategoryMap.get(order.product_id) : undefined
        const feePercent = getFeePercentage(coachTier, productCategory || 'marketplace_digital', feeRules)
        return sum + Math.max(amount - amount * (feePercent / 100), 0)
      }, 0)

      const paidSessionGross = sessionPayments.reduce((sum, payment) => {
        if (String(payment.status || '').toLowerCase() !== 'paid') return sum
        return sum + parseMoney(payment.amount)
      }, 0)

      const paidSessionNet = sessionPayments.reduce((sum, payment) => {
        if (String(payment.status || '').toLowerCase() !== 'paid') return sum
        const amount = parseMoney(payment.amount)
        const feePercent = getFeePercentage(coachTier, 'session', feeRules)
        return sum + Math.max(amount - amount * (feePercent / 100), 0)
      }, 0)

      const pendingPayouts = payouts.reduce((sum, payout) => {
        const status = String(payout.status || '').toLowerCase()
        if (!['scheduled', 'pending', 'processing', 'in_transit'].includes(status)) return sum
        return sum + parseMoney(payout.amount)
      }, 0)

      const paidOut = payouts.reduce((sum, payout) => {
        if (String(payout.status || '').toLowerCase() !== 'paid') return sum
        return sum + parseMoney(payout.amount)
      }, 0)

      setSpendSummary({
        grossBooked: grossOrders + paidSessionGross,
        netBooked: netOrders + paidSessionNet,
        pendingPayouts,
        paidOut,
      })
      setLoadingSpend(false)
    }
    void loadSpendSummary()
    return () => {
      active = false
    }
  }, [currentUserId, supabase])

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

  useEffect(() => {
    let active = true
    const loadSignals = async () => {
      const res = await fetch('/api/demand-signals?limit=5&window_days=30')
      if (!res.ok || !active) return
      const payload = await res.json().catch(() => null)
      if (active && payload?.signals) setDemandSignals(payload.signals)
    }
    loadSignals()
    return () => { active = false }
  }, [])

  const handleCloseOnboarding = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ch_onboarding_coach_v1', '1')
    }
    setOnboardingSeen(true)
    setShowOnboarding(false)
  }

  const handleOpenCustomerPortal = async () => {
    const response = await fetch('/api/stripe/customer-portal', { method: 'POST' })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.url) {
      setToast(data?.error || 'Unable to open billing portal.')
      return
    }
    window.open(data.url, '_blank', 'noopener,noreferrer')
  }


  return (
    <main className="page-shell">
      <OnboardingModal role="coach" open={showOnboarding} onClose={handleCloseOnboarding} userName={coachName} />
      {searchParams?.get('billing') === 'canceled' && !billingBannerDismissed && (
        <div className="flex items-center justify-between gap-4 border-b border-[#f5c2c2] bg-[#fff5f5] px-6 py-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#b80f0a]" />
            <p className="text-[#191919]">Your subscription has been canceled. Reactivate to restore full access.</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <Link
              href="/select-plan?role=coach"
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
      {pendingInviteCount > 0 && (
        <div className="flex items-center justify-between gap-4 border-b border-[#f5e2a0] bg-[#fffbeb] px-6 py-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#b45309]" />
            <p className="text-[#191919]">You have {pendingInviteCount} pending org invite{pendingInviteCount !== 1 ? 's' : ''} waiting for your response.</p>
          </div>
          <a
            href="#invites"
            className="flex-shrink-0 rounded-full border border-[#b45309] px-4 py-1.5 text-xs font-semibold text-[#b45309]"
          >
            View invites
          </a>
        </div>
      )}
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">
              Coach Portal
            </p>
            <h1 className="display text-3xl font-semibold md:text-4xl">
              Welcome back{coachName ? `, ${coachName}` : ''}
            </h1>
            <p className="mt-2 text-sm text-[#6b5f55]">
              Here is your coaching snapshot.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 text-sm sm:items-end">
            <RoleSwitcher hideOrgOptions />
            {billingInfo?.status && (
              <Link
                href="/coach/settings#plans"
                className="flex items-center gap-1.5 rounded-full border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-1 text-xs text-[#4a4a4a] transition-colors hover:border-[#191919]"
              >
                <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${billingInfo.status === 'active' ? 'bg-green-500' : billingInfo.status === 'trialing' ? 'bg-blue-500' : 'bg-[#b80f0a]'}`} />
                <span className="font-semibold capitalize">{billingLabel}</span>
                {billingInfo.status === 'trialing' && billingInfo.trial_end
                  ? <span>· Trial ends {formatShortDate(new Date(billingInfo.trial_end))}</span>
                  : billingInfo.status === 'active' && billingInfo.current_period_end
                    ? <span>· Renews {formatShortDate(new Date(billingInfo.current_period_end))}</span>
                    : billingInfo.status !== 'active' && billingInfo.status !== 'trialing'
                      ? <span>· {billingInfo.status.replace(/_/g, ' ')}</span>
                      : null}
              </Link>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
              >
                Invite user
              </button>
              <button
                type="button"
                className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                onClick={() => setCustomizeOpen(true)}
              >
                Customize
              </button>
              {coachSlug && (
                <Link
                  href="/coach/profile"
                  className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Go to profile
                </Link>
              )}
            </div>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div>
            {!hiddenSections.includes('stats') && (
              <section className="mb-6 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Total bookings', value: sessionCount > 0 ? String(sessionCount) : '—', href: '/coach/bookings' },
                  { label: 'Active products', value: productCount > 0 ? String(productCount) : '—', href: '/coach/marketplace' },
                  { label: 'Availability slots', value: availabilityCount > 0 ? String(availabilityCount) : '—', href: '/coach/calendar' },
                  { label: 'Stripe connected', value: stripeConnected === true ? 'Yes' : stripeConnected === false ? 'No' : '—', href: '/coach/settings' },
                ].map((stat) => (
                  <Link
                    key={stat.label}
                    href={stat.href}
                    className="glass-card card-accent border border-[#191919] bg-white p-5 transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                    <p className="mt-3 text-3xl font-semibold text-[#191919]">{stat.value}</p>
                  </Link>
                ))}
              </section>
            )}
            {stripeConnected === false && !stripeStatusLoading && !hiddenSections.includes('stripe_banner') && (
              <section className="mb-6 rounded-2xl border border-[#b80f0a] bg-white p-4 text-sm text-[#191919]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#191919]">Connect Stripe to start receiving payments</p>
                    <p className="mt-1 text-xs text-[#6b5f55]">Set up Stripe Connect once so payouts go directly to you.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void loadStripeStatus()}
                      className="rounded-full border border-[#dcdcdc] px-4 py-2 text-xs font-semibold text-[#4a4a4a] transition-opacity hover:opacity-70"
                    >
                      Refresh status
                    </button>
                    <Link
                      href="/coach/stripe-setup"
                      className="rounded-full border border-[#b80f0a] px-4 py-2 text-xs font-semibold text-[#b80f0a]"
                    >
                      Set up Stripe
                    </Link>
                    <Link
                      href="/coach/stripe-setup?stripe=verify"
                      className="rounded-full border border-[#dcdcdc] px-4 py-2 text-xs font-semibold text-[#4a4a4a] transition-colors hover:border-[#191919]"
                    >
                      Already connected? Verify →
                    </Link>
                  </div>
                </div>
              </section>
            )}
            {!hiddenSections.includes('activation') && activationComplete < activationTasks.length && (
              <section className="mb-6 glass-card border border-[#191919] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Activation checklist</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Launch your coaching business</h2>
                    <p className="mt-1 text-sm text-[#6b5f55]">Finish these steps to unlock bookings and payouts.</p>
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
                          body: JSON.stringify({ page: 'coach_dashboard', hidden_sections: next }),
                        })
                        pushToast('Activation checklist hidden', {
                          label: 'Undo',
                          onAction: async () => {
                            setHiddenSections(previous)
                            await fetch('/api/dashboard-layout', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ page: 'coach_dashboard', hidden_sections: previous }),
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
                        <Link
                          href={task.action.href}
                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                        >
                          {task.action.label}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!hiddenSections.includes('sessions') && (
              <section className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr]">
                <div className="glass-card card-accent p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Upcoming sessions</h2>
                    <Link href="/coach/calendar" className="text-sm font-semibold text-[#b80f0a]">
                      View calendar
                    </Link>
                  </div>
                  <div className="mt-6 space-y-4">
                    {loadingSessions ? (
                      <p className="text-sm text-[#9a9a9a]">Loading...</p>
                    ) : upcomingSessions.length === 0 ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm text-[#9a9a9a]">
                        No upcoming sessions. <Link href="/coach/calendar" className="font-semibold text-[#b80f0a]">Set your availability</Link> to start accepting bookings.
                      </div>
                    ) : upcomingSessions.map((session) => (
                      <div
                        key={`${session.athlete}-${session.time}`}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4"
                      >
                        <div>
                          <p className="text-sm text-[#6b5f55]">{session.time}</p>
                          <p className="text-lg font-semibold text-[#191919]">{session.athlete}</p>
                          <p className="text-sm text-[#6b5f55]">{session.focus}</p>
                        </div>
                        <span className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white capitalize">
                          {session.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card card-accent p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <div className="sm:pr-4">
                      <h2 className="text-xl font-semibold">Inbox</h2>
                      <p className="mt-2 text-sm text-[#6b5f55]">
                        Messages from athletes and teams.
                      </p>
                    </div>
                    <Link
                      href="/coach/messages"
                      className="self-start text-sm font-semibold leading-tight text-[#b80f0a] sm:whitespace-nowrap"
                    >
                      Open inbox
                    </Link>
                  </div>
                  <div className="mt-6 text-sm">
                    {loadingInbox ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-[#9a9a9a]">
                        Loading inbox…
                      </div>
                    ) : dashboardThreads.length === 0 ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-[#9a9a9a]">
                        No conversations yet. <Link href="/coach/messages" className="font-semibold text-[#b80f0a]">Open inbox</Link> to start messaging.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Unread threads</p>
                          <p className="mt-2 text-2xl font-semibold text-[#191919]">{unreadThreadCount}</p>
                        </div>
                        {dashboardThreads.slice(0, 3).map((thread) => (
                          <Link
                            key={thread.id}
                            href={`/coach/messages?thread=${encodeURIComponent(thread.id)}`}
                            className="block rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 transition-colors hover:border-[#191919]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-[#191919]">{thread.name}</p>
                                <p className="mt-1 line-clamp-2 text-xs text-[#6b5f55]">{thread.preview}</p>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-[#6b5f55]">
                                {thread.unread ? <span className="h-2 w-2 rounded-full bg-[#b80f0a]" /> : null}
                                <span>{thread.time}</span>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {!hiddenSections.includes('marketplace') && (
              <section className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                {isOrgOnlyCoach ? (
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Marketplace</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Unlock your own marketplace</h2>
                    <p className="mt-2 text-sm text-[#6b5f55]">
                      Your access is through an organization. Upgrade to an individual coach plan to create and sell your own products directly to athletes.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-sm">
                      <Link
                        href="/select-plan?role=coach"
                        className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white"
                      >
                        Upgrade plan
                      </Link>
                      <Link
                        href="/coach/marketplace"
                        className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919]"
                      >
                        View marketplace
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="glass-card card-accent p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-semibold">Active programs</h2>
                        <p className="mt-2 text-sm text-[#6b5f55]">
                          Live programs, listings, and offers athletes can buy now.
                        </p>
                      </div>
                      <Link href="/coach/marketplace" className="text-sm font-semibold text-[#b80f0a]">
                        View marketplace
                      </Link>
                    </div>
                    <div className="mt-6">
                      {loadingPrograms ? (
                        <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm text-[#9a9a9a]">
                          Loading programs…
                        </div>
                      ) : dashboardPrograms.length === 0 ? (
                        <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm text-[#9a9a9a]">
                          No products yet. <Link href="/coach/marketplace/create" className="font-semibold text-[#b80f0a]">Create your first listing</Link> to start selling.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {dashboardPrograms.slice(0, 3).map((program) => (
                            <div key={program.id} className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-[#191919]">{program.title}</p>
                                  <p className="mt-1 text-xs text-[#6b5f55]">{program.category}</p>
                                </div>
                                <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">
                                  {program.status}
                                </span>
                              </div>
                            </div>
                          ))}
                          <Link href="/coach/marketplace" className="inline-flex rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#f5f5f5]">
                            View {dashboardPrograms.length} active program{dashboardPrograms.length !== 1 ? 's' : ''}
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="glass-card card-accent border border-[#191919] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-[#191919]">Spend summary</h2>
                      <p className="mt-2 text-sm text-[#6b5f55]">Bookings, marketplace sales, and payout progress tied to your coach account.</p>
                    </div>
                    <Link href="/coach/marketplace/revenue" className="text-sm font-semibold text-[#b80f0a]">
                      Revenue
                    </Link>
                  </div>
                  <div className="mt-6 space-y-3 text-sm">
                    {loadingSpend ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-[#9a9a9a]">
                        Loading summary…
                      </div>
                    ) : (
                      <>
                        <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Gross booked</p>
                          <p className="mt-2 text-2xl font-semibold text-[#191919]">{formatCurrency(spendSummary.grossBooked)}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Net booked</p>
                            <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(spendSummary.netBooked)}</p>
                          </div>
                          <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Pending payouts</p>
                            <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(spendSummary.pendingPayouts)}</p>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Paid out</p>
                          <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(spendSummary.paidOut)}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>
            )}

            {demandSignals.length > 0 && !hiddenSections.includes('demand_signals') && (
              <section className="mt-10 glass-card border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Market intelligence</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">What athletes are searching for</h2>
                    <p className="mt-1 text-sm text-[#6b5f55]">Top demand signals from the last 30 days.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {demandSignals.map((signal, index) => (
                    <div key={signal.label} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#6b5f55]">#{index + 1}</span>
                        <span className="font-semibold text-[#191919]">{signal.label}</span>
                      </div>
                      <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-xs text-[#6b5f55]">
                        {signal.score} pt{signal.score !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {coachOrgEntryPointsEnabled ? (
              <section className="mt-10 glass-card border border-[#191919] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">For organizations</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Need a full org view?</h2>
                    <p className="mt-1 text-sm text-[#6b5f55]">
                      Create an org portal to manage teams, billing, and staff in one place.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOrgCreateError('')
                      setOrgJoinNotice('')
                      setExistingOrg(null)
                      setShowOrgCreate(true)
                    }}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Create org
                  </button>
                </div>
              </section>
            ) : null}

            {!hiddenSections.includes('invites') && invites.length > 0 && (
              <section id="invites" className="mt-10 glass-card card-accent border border-[#191919] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Invitations</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Team invites waiting</h2>
                    <p className="mt-1 text-sm text-[#6b5f55]">Join an organization to collaborate on practices.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {invites.map((invite) => (
                    <div key={invite.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3">
                      <p className="font-semibold text-[#191919]">{invite.org_name}</p>
                      <p className="text-xs text-[#6b5f55]">
                        {invite.team_name ? `${invite.team_name} · ` : ''}Role: {invite.role}
                      </p>
                      {invite.status === 'pending' ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-full bg-[#b80f0a] px-3 py-1 text-xs font-semibold text-white"
                            onClick={async () => {
                              await fetch('/api/org/invites/respond', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ invite_id: invite.id, action: 'accept' }),
                              })
                              setInvites((prev) =>
                                prev.map((row) =>
                                  row.id === invite.id ? { ...row, status: 'awaiting_approval' } : row,
                                ),
                              )
                            }}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            onClick={async () => {
                              await fetch('/api/org/invites/respond', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ invite_id: invite.id, action: 'decline' }),
                              })
                              setInvites((prev) => prev.filter((row) => row.id !== invite.id))
                            }}
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs font-semibold text-[#6b5f55]">Awaiting org approval.</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!hiddenSections.includes('retention') && needsRetentionNudge && (
              <section className="mt-6 glass-card border border-[#191919] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Retention loop</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Re-engage your athletes</h2>
                    <p className="mt-1 text-sm text-[#6b5f55]">
                      {lastSessionDate
                        ? `No sessions in ${daysSinceSession} days. Send a check-in and open new slots.`
                        : 'Publish availability to get your first booking.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Link href="/coach/messages" className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                      Send check-in
                    </Link>
                    <Link href="/coach/calendar" className="rounded-full bg-[#b80f0a] px-3 py-1 font-semibold text-white">
                      Add availability
                    </Link>
                  </div>
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
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Dashboard sections</h2>
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
                { id: 'retention', label: 'Retention loop' },
                { id: 'stripe_banner', label: 'Stripe reminder' },
                { id: 'invites', label: 'Invites' },
                { id: 'stats', label: 'Stat cards' },
                { id: 'sessions', label: 'Upcoming sessions + inbox pulse' },
                { id: 'marketplace', label: 'Marketplace performance' },
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
                    body: JSON.stringify({ page: 'coach_dashboard', hidden_sections: hiddenSections }),
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
      {coachOrgEntryPointsEnabled && showOrgCreate && (
        <div className="fixed inset-0 z-[1200] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 md:py-10">
          <div className="w-full max-w-[calc(100vw-2rem)] sm:max-w-3xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Organization access</p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {existingOrg ? 'You are already in an org' : 'Launch your org portal'}
                </h2>
                <p className="mt-1 text-sm text-[#6b5f55]">
                  {existingOrg
                    ? 'Switch to the org view to manage teams and billing.'
                    : 'Pick a plan, then continue to secure checkout and org setup.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowOrgCreate(false)
                  setOrgCreateError('')
                  setExistingOrg(null)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {existingOrg ? (
              <>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Organization</p>
                    <p className="mt-1 text-lg font-semibold text-[#191919]">{existingOrg.name}</p>
                    {existingOrg.orgType ? (
                      <p className="text-xs text-[#6b5f55]">Type: {existingOrg.orgType}</p>
                    ) : null}
                    {existingOrg.role ? (
                      <p className="text-xs text-[#6b5f55]">Role: {existingOrg.role}</p>
                    ) : null}
                    {existingOrg.teams && existingOrg.teams.length > 0 ? (
                      <p className="mt-2 text-xs text-[#6b5f55]">
                        Teams: {existingOrg.teams.join(', ')}
                      </p>
                    ) : null}
                  </div>
                  {orgCreateError ? (
                    <p className="text-xs text-[#b80f0a]">{orgCreateError}</p>
                  ) : null}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      continueToOrgPlans({
                        checkoutRole: String(existingOrg.role || 'org_admin'),
                        orgRecord: existingOrg,
                      })
                    }
                    disabled={orgCreating}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {orgCreating ? 'Opening plans...' : 'Continue to plans'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOrgCreate(false)
                      router.push('/org')
                      router.refresh()
                    }}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                  >
                    Go to org portal
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                    onClick={() => setShowOrgCreate(false)}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-5 space-y-6">
                  <section className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">1. Select org plan</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      {orgPlanOptions.map((plan) => (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setSelectedOrgPlan(plan.id)}
                          className={`rounded-2xl border p-3 text-left transition ${
                            selectedOrgPlan === plan.id
                              ? 'border-[#191919] bg-white shadow-md'
                              : 'border-[#dcdcdc] bg-white hover:border-[#191919]'
                          }`}
                        >
                          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{plan.name}</p>
                          <p className="mt-2 text-xl font-semibold text-[#191919]">{plan.price}<span className="text-xs font-normal text-[#6b5f55]"> / mo</span></p>
                          <p className="mt-1 text-xs text-[#6b5f55]">{plan.summary}</p>
                          <ul className="mt-2 space-y-1 text-xs text-[#4a4a4a]">
                            {plan.perks.map((perk) => (
                              <li key={perk}>- {perk}</li>
                            ))}
                          </ul>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">2. Create your organization</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="space-y-2 text-sm">
                        <span className="text-xs font-semibold text-[#6b5f55]">Organization name</span>
                        <input
                          value={orgName}
                          onChange={(event) => setOrgName(event.target.value)}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                          placeholder="Organization name"
                        />
                      </label>
                      <label className="space-y-2 text-sm">
                        <span className="text-xs font-semibold text-[#6b5f55]">Organization type</span>
                        <select
                          value={orgType}
                          onChange={(event) => setOrgType(event.target.value as typeof orgType)}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        >
                          <option value="school">School</option>
                          <option value="club">Club</option>
                          <option value="travel">Travel</option>
                          <option value="academy">Academy</option>
                        </select>
                      </label>
                    </div>
                    <p className="mt-3 text-xs text-[#6b5f55]">
                      We&apos;ll create your organization, switch you into the org portal, and open org plan selection with <span className="font-semibold text-[#191919]">{orgPlanOptions.find((plan) => plan.id === selectedOrgPlan)?.name}</span> preselected.
                    </p>
                    {orgCreateError ? <p className="mt-2 text-xs text-[#b80f0a]">{orgCreateError}</p> : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCreateOrg}
                        disabled={orgCreating}
                        className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {orgCreating ? 'Opening org plans...' : 'Continue to org plans'}
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                        onClick={() => setShowOrgCreate(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Already part of an org/team?</p>
                    <p className="mt-1 text-xs text-[#6b5f55]">
                      Enter the organization and optional team. We&apos;ll notify org admins to approve your access.
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="space-y-2 text-sm">
                        <span className="text-xs font-semibold text-[#6b5f55]">Organization name</span>
                        <input
                          value={orgJoinName}
                          onChange={(event) => setOrgJoinName(event.target.value)}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                          placeholder="Organization name"
                        />
                      </label>
                      <label className="space-y-2 text-sm">
                        <span className="text-xs font-semibold text-[#6b5f55]">Team name (optional)</span>
                        <input
                          value={orgJoinTeamName}
                          onChange={(event) => setOrgJoinTeamName(event.target.value)}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                          placeholder="Varsity Track"
                        />
                      </label>
                      <label className="space-y-2 text-sm md:col-span-2">
                        <span className="text-xs font-semibold text-[#6b5f55]">Requested role</span>
                        <select
                          value={orgJoinRole}
                          onChange={(event) => setOrgJoinRole(event.target.value as 'coach' | 'assistant_coach')}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        >
                          <option value="coach">Coach</option>
                          <option value="assistant_coach">Assistant coach</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleRequestOrgAccess}
                        disabled={orgJoinLoading}
                        className="rounded-full border border-[#191919] bg-white px-4 py-2 text-xs font-semibold text-[#191919] disabled:opacity-60"
                      >
                        {orgJoinLoading ? 'Sending request...' : 'Request access'}
                      </button>
                    </div>
                    {orgJoinNotice ? <p className="mt-2 text-xs text-[#4a4a4a]">{orgJoinNotice}</p> : null}
                  </section>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <InviteUserModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        allowedTypes={['coach', 'athlete', 'guardian']}
        defaultType="athlete"
        onSent={(message) => pushToast(message)}
      />
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
