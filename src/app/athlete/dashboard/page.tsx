'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import Toast from '@/components/Toast'
import OnboardingModal from '@/components/OnboardingModal'
import InviteUserModal from '@/components/InviteUserModal'
import { formatShortDate } from '@/lib/dateUtils'
import { ATHLETE_FAMILY_FEATURES, normalizeAthleteTier } from '@/lib/planRules'
import { selectProfileCompat } from '@/lib/profileSchemaCompat'
import { useAthleteProfile } from '@/components/AthleteProfileContext'

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const formatCurrency = (value: number) => `$${value.toFixed(2).replace(/\.00$/, '')}`

type DashboardThread = {
  id: string
  name: string
  preview: string
  time: string
  unread: boolean
}

type AthleteProgram = {
  id: string
  title: string
  subtitle: string
  status: string
  href: string
}

const ALWAYS_VISIBLE_ATHLETE_SECTIONS = new Set(['programs', 'spend'])
const sanitizeAthleteHiddenSections = (sections: string[] | null | undefined) =>
  Array.from(new Set((sections || []).filter((section) => !ALWAYS_VISIBLE_ATHLETE_SECTIONS.has(section))))

export default function AthleteDashboard() {
  const supabase = createClientComponentClient()
  const { activeAthleteLabel, activeSubProfileId } = useAthleteProfile()
  const now = new Date()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingSeen, setOnboardingSeen] = useState(false)
  const [onboardingReady, setOnboardingReady] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [hiddenSections, setHiddenSections] = useState<string[]>([])
  const [layoutSaving, setLayoutSaving] = useState(false)
  const searchParams = useSearchParams()
  const [billingBannerDismissed, setBillingBannerDismissed] = useState(false)
  const [toast, setToast] = useState('')
  const [toastAction, setToastAction] = useState<{ label: string; onAction: () => void } | null>(null)
  const [athleteTier, setAthleteTier] = useState<'explore' | 'train' | 'family'>('explore')
  const [billingInfo, setBillingInfo] = useState<{
    status: string | null
    tier: string | null
    current_period_end: string | null
    trial_end: string | null
    cancel_at_period_end: boolean
  } | null>(null)
  const [invites, setInvites] = useState<any[]>([])
  const [inviteNotice, setInviteNotice] = useState('')
  const [pendingWaiverCount, setPendingWaiverCount] = useState(0)
  const [practicePlans, setPracticePlans] = useState<any[]>([])
  const [sessionCount, setSessionCount] = useState(0)
  const [lastSessionDate, setLastSessionDate] = useState<Date | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [allTasksOpen, setAllTasksOpen] = useState(false)
  const [reviewName, setReviewName] = useState('')
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [reviewStatusLoaded, setReviewStatusLoaded] = useState(false)
  const [athleteBirthdate, setAthleteBirthdate] = useState<string | null>(null)
  const [accountOwnerType, setAccountOwnerType] = useState<string | null>(null)
  const [guardianApprovalRule, setGuardianApprovalRule] = useState<string | null>(null)
  const [guardianInfoComplete, setGuardianInfoComplete] = useState(false)
  const [emergencyContactsComplete, setEmergencyContactsComplete] = useState(false)
  const [athleteProfileComplete, setAthleteProfileComplete] = useState(false)
  const [savedCoachCount, setSavedCoachCount] = useState(0)
  const [marketplaceOrderCount, setMarketplaceOrderCount] = useState(0)
  const [athleteName, setAthleteName] = useState('')
  const [marketplacePrograms, setMarketplacePrograms] = useState<AthleteProgram[]>([])
  const [loadingPrograms, setLoadingPrograms] = useState(true)
  const [dashboardThreads, setDashboardThreads] = useState<DashboardThread[]>([])
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [unreadThreadCount, setUnreadThreadCount] = useState(0)
  const [spendSummary, setSpendSummary] = useState({ totalDue: 0, dueThisMonth: 0, paidYtd: 0 })
  const [loadingSpend, setLoadingSpend] = useState(true)
  const [familyProfiles, setFamilyProfiles] = useState<
    Array<{ id?: string; name: string; sport: string; next: string }>
  >([])
  const [upcomingBookings, setUpcomingBookings] = useState<Array<{ time: string; coach: string; focus: string; location: string }>>([])
  const pushToast = (message: string, action?: { label: string; onAction: () => void }) => {
    setToast(message)
    setToastAction(action ?? null)
  }

  const tasks: Array<{ title: string; due: string; status: string }> = []

  const taskLinkMap: Array<{ match: RegExp; href: string }> = [
    { match: /book|schedule session|confirm availability/i, href: '/athlete/calendar' },
    { match: /questionnaire|intake|waiver|form/i, href: '/athlete/calendar' },
    { match: /message|reply to coach/i, href: '/athlete/messages' },
    { match: /profile|update info/i, href: '/athlete/profile' },
    { match: /emergency contacts|guardian approval|guardian/i, href: '/athlete/settings' },
    { match: /review notes|notes/i, href: '/athlete/notes' },
    { match: /upload|video|footage/i, href: '/athlete/notes' },
    { match: /pay fee|payment|receipt|download receipt/i, href: '/athlete/marketplace/orders' },
    { match: /program|plan/i, href: '/athlete/marketplace' },
  ]
  const resolveTaskHref = (title: string) => taskLinkMap.find((entry) => entry.match.test(title))?.href || null

  const nextSession = upcomingBookings[0]
  const nextSessionLabel = nextSession ? `${nextSession.time} · ${nextSession.coach}` : 'No upcoming sessions'
  const reviewTarget = nextSession?.coach || 'Coach'
  const birthdateValue = athleteBirthdate ? new Date(`${athleteBirthdate}T00:00:00`) : null
  const birthdateAge =
    birthdateValue && !Number.isNaN(birthdateValue.getTime())
      ? new Date().getFullYear() -
        birthdateValue.getFullYear() -
        (new Date().setFullYear(birthdateValue.getFullYear()) < birthdateValue.getTime() ? 1 : 0)
      : null
  const needsGuardianApproval =
    accountOwnerType === 'athlete_minor' ||
    accountOwnerType === 'guardian' ||
    (birthdateAge !== null && birthdateAge < 18)
  const familySafetyComplete = needsGuardianApproval
    ? guardianInfoComplete && emergencyContactsComplete
    : emergencyContactsComplete
  const coachDiscoveryComplete = savedCoachCount > 0 || sessionCount > 0 || reviewed
  const marketplaceStarted = practicePlans.length > 0 || marketplaceOrderCount > 0
  const activationTasks = useMemo(
    () => [
      {
        id: 'profile',
        title: 'Complete your athlete profile',
        done: athleteProfileComplete,
        action: { label: 'Update profile', href: '/athlete/settings#profile' },
      },
      {
        id: 'find-coach',
        title: 'Find the right coach',
        done: coachDiscoveryComplete,
        action: { label: 'Browse coaches', href: '/athlete/discover' },
      },
      {
        id: 'first-session',
        title: 'Book your first session',
        done: sessionCount > 0,
        action: { label: 'Book session', href: '/athlete/calendar' },
      },
      {
        id: 'marketplace',
        title: 'Start a training plan or marketplace purchase',
        done: marketplaceStarted,
        action: { label: 'Browse marketplace', href: '/athlete/marketplace' },
      },
      {
        id: 'leave-review',
        title: 'Leave your first review',
        done: reviewed,
        action: { label: 'Write review', onClick: () => setReviewOpen(true) },
      },
      {
        id: 'family-safety',
        title: needsGuardianApproval ? 'Add family & safety info' : 'Add safety info',
        done: familySafetyComplete,
        action: { label: 'Update family & safety', href: '/athlete/settings#family' },
      },
    ],
    [
      athleteProfileComplete,
      coachDiscoveryComplete,
      familySafetyComplete,
      marketplaceStarted,
      needsGuardianApproval,
      reviewed,
      sessionCount,
    ],
  )
  const activationComplete = activationTasks.filter((task) => task.done).length
  const daysSinceSession = lastSessionDate ? Math.floor((now.getTime() - lastSessionDate.getTime()) / 86400000) : null
  const needsRetentionNudge = daysSinceSession !== null && daysSinceSession >= 5
  const familyEnabled = ATHLETE_FAMILY_FEATURES[athleteTier]
  const pendingInviteCount = invites.filter((i) => i.status === 'pending').length
  const activePrograms = useMemo<AthleteProgram[]>(
    () => [
      ...practicePlans.map((plan: { id: string; title?: string | null; session_date?: string | null; duration_minutes?: number | null }) => ({
        id: `plan-${plan.id}`,
        title: plan.title || 'Practice plan',
        subtitle: plan.session_date
          ? `${new Date(plan.session_date).toLocaleDateString()}${plan.duration_minutes ? ` · ${plan.duration_minutes} min` : ''}`
          : 'Coach-created plan',
        status: 'Assigned',
        href: `/athlete/plans/${plan.id}`,
      })),
      ...marketplacePrograms,
    ],
    [marketplacePrograms, practicePlans],
  )

  useEffect(() => {
    if (!onboardingReady || !reviewStatusLoaded) return
    const sync = async () => {
      const doneIds = activationTasks.filter((task) => task.done).map((task) => task.id)
      const completedSteps = onboardingSeen ? [...doneIds, 'modal_seen'] : doneIds
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'athlete',
          completed_steps: completedSteps,
          total_steps: activationTasks.length + (onboardingSeen ? 1 : 0),
        }),
      })
    }
    void sync()
  }, [
    activationTasks,
    onboardingReady,
    onboardingSeen,
    reviewStatusLoaded,
  ])

  useEffect(() => {
    let active = true
    const loadOnboarding = async () => {
      const localSeen = typeof window !== 'undefined'
        && window.localStorage.getItem('ch_onboarding_athlete_v1') === '1'
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

  useEffect(() => {
    let active = true
    const loadReviewStatus = async () => {
      const localReviewed = typeof window !== 'undefined'
        && window.localStorage.getItem('ch_reviewed_athlete_v1') === '1'
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) {
        if (!active) return
        setReviewed(localReviewed)
        setReviewStatusLoaded(true)
        return
      }
      const { data: reviewRows, error } = await supabase
        .from('coach_reviews')
        .select('id')
        .eq('athlete_id', userId)
        .limit(1)
      if (!active) return
      setReviewed(error ? localReviewed : (reviewRows || []).length > 0)
      setReviewStatusLoaded(true)
    }
    void loadReviewStatus()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    if (searchParams?.get('review') !== '1') return
    setReviewOpen(true)
  }, [searchParams])


  useEffect(() => {
    let active = true
    const loadLayout = async () => {
      const response = await fetch('/api/dashboard-layout?page=athlete_dashboard')
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      setHiddenSections(sanitizeAthleteHiddenSections(payload.hidden_sections))
    }
    loadLayout()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadTier = async () => {
      const { data } = await supabase.auth.getUser()
      const userId = data.user?.id
      if (!userId) return
      const { data: planRow } = await supabase
        .from('athlete_plans')
        .select('tier')
        .eq('athlete_id', userId)
        .maybeSingle()
      if (!active) return
      const savedTier = typeof planRow?.tier === 'string' ? planRow.tier : null
      if (savedTier) {
        setAthleteTier(normalizeAthleteTier(savedTier))
      }
    }
    loadTier()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    let active = true
    const loadProfile = async () => {
      const { data } = await supabase.auth.getUser()
      const userId = data.user?.id
      if (!userId) return
      const { data: profileRow, error: profileError } = await selectProfileCompat({
        supabase,
        userId,
        columns: [
          'full_name',
          'guardian_name',
          'guardian_email',
          'guardian_phone',
          'athlete_birthdate',
          'athlete_season',
          'athlete_grade_level',
          'guardian_approval_rule',
          'account_owner_type',
        ],
      })
      if (!active) return
      if (profileError) {
        setAthleteName('')
        setAthleteBirthdate(null)
        setAccountOwnerType(null)
        setGuardianApprovalRule(null)
        setGuardianInfoComplete(false)
        setAthleteProfileComplete(false)
        return
      }
      const profile = (profileRow || null) as {
        full_name?: string | null
        guardian_name?: string | null
        guardian_email?: string | null
        guardian_phone?: string | null
        athlete_birthdate?: string | null
        athlete_season?: string | null
        athlete_grade_level?: string | null
        guardian_approval_rule?: string | null
        account_owner_type?: string | null
      } | null
      setAthleteName((profile?.full_name || '').split(' ')[0] || '')
      setAthleteBirthdate(profile?.athlete_birthdate || null)
      setAccountOwnerType(profile?.account_owner_type || null)
      setGuardianApprovalRule(profile?.guardian_approval_rule || null)
      const guardianComplete = Boolean(
        profile?.guardian_name && profile?.guardian_email && profile?.guardian_phone,
      )
      setGuardianInfoComplete(guardianComplete)
      setAthleteProfileComplete(
        Boolean(
          profile?.full_name?.trim() &&
          profile?.athlete_birthdate &&
          (profile?.athlete_season || profile?.athlete_grade_level),
        ),
      )
    }
    loadProfile()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    let active = true
    const loadFamilyProfiles = async () => {
      const res = await fetch('/api/athlete/profiles')
      if (!res.ok || !active) return
      const data = await res.json().catch(() => [])
      if (!active) return
      const profiles = (Array.isArray(data) ? data : []) as Array<{ id: string; name: string; sport: string }>
      setFamilyProfiles(profiles.map((p) => ({ id: p.id, name: p.name, sport: p.sport, next: 'View calendar' })))
    }
    loadFamilyProfiles()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const loadEmergencyContacts = async () => {
      const response = await fetch('/api/emergency-contacts')
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      const contacts = Array.isArray(payload.contacts) ? payload.contacts : []
      const contactsComplete =
        contacts.length >= 2 &&
        contacts.slice(0, 2).every((contact: { name?: string; relationship?: string; phone?: string; email?: string }) =>
          Boolean(contact?.name && contact?.relationship && (contact?.phone || contact?.email)),
        )
      setEmergencyContactsComplete(contactsComplete)
    }
    loadEmergencyContacts()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadSavedCoaches = async () => {
      const response = await fetch('/api/athlete/saved-coaches')
      if (!response.ok) return
      const payload = await response.json().catch(() => null)
      if (!active) return
      const savedCoachIds = Array.isArray(payload?.saved_coach_ids) ? payload.saved_coach_ids : []
      setSavedCoachCount(savedCoachIds.length)
    }
    void loadSavedCoaches()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadMarketplaceOrders = async () => {
      setLoadingPrograms(true)
      const endpoint = activeSubProfileId
        ? `/api/athlete/orders?sub_profile_id=${encodeURIComponent(activeSubProfileId)}`
        : '/api/athlete/orders'
      const response = await fetch(endpoint, { cache: 'no-store' }).catch(() => null)
      if (!active) return
      if (!response?.ok) {
        setMarketplaceOrderCount(0)
        setMarketplacePrograms([])
        setLoadingPrograms(false)
        return
      }
      const payload = await response.json().catch(() => ({}))
      if (!active) return
      const orders = ((payload.orders || []) as Array<{
        id: string
        title?: string | null
        seller?: string | null
        status?: string | null
        fulfillment_status?: string | null
      }>).filter((order) => {
        const status = String(order.status || '').toLowerCase()
        return !['failed', 'refunded', 'cancelled', 'canceled'].includes(status)
      })
      setMarketplaceOrderCount(orders.length)
      setMarketplacePrograms(
        orders.map((order) => ({
          id: `order-${order.id}`,
          title: order.title || 'Program',
          subtitle: order.seller ? `From ${order.seller}` : 'Marketplace purchase',
          status: order.fulfillment_status || order.status || 'Active',
          href: '/athlete/marketplace/orders',
        })),
      )
      setLoadingPrograms(false)
    }
    void loadMarketplaceOrders()
    return () => {
      active = false
    }
  }, [activeSubProfileId])

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
    const loadPendingWaivers = async () => {
      const res = await fetch('/api/waivers/pending')
      if (!res.ok || !active) return
      const data = await res.json().catch(() => null)
      if (active) setPendingWaiverCount((data?.pending || []).length)
    }
    loadPendingWaivers()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const loadPlans = async () => {
      if (activeSubProfileId) {
        setPracticePlans([])
        return
      }
      const response = await fetch('/api/practice-plans')
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      setPracticePlans(payload.plans || [])
    }
    loadPlans()
    return () => {
      active = false
    }
  }, [activeSubProfileId])

  useEffect(() => {
    let active = true
    const loadSessions = async () => {
      const endpoint = activeSubProfileId
        ? `/api/sessions?sub_profile_id=${encodeURIComponent(activeSubProfileId)}`
        : '/api/sessions?sub_profile_scope=main'
      const response = await fetch(endpoint)
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      const sessions = payload.sessions || []
      setSessionCount(sessions.length)
      const sorted = sessions
        .filter((session: { start_time?: string | null }) => session.start_time)
        .sort((a: { start_time?: string }, b: { start_time?: string }) =>
          new Date(b.start_time || '').getTime() - new Date(a.start_time || '').getTime(),
        )
      setLastSessionDate(sorted.length ? new Date(sorted[0].start_time) : null)
      // Build upcoming bookings list
      const nowIso = new Date().toISOString()
      const upcoming = sessions
        .filter((s: { start_time?: string | null; status?: string | null }) => {
          if (!s.start_time) return false
          const status = String(s.status || '').toLowerCase()
          if (status === 'cancelled' || status === 'completed' || status === 'rescheduled') return false
          return new Date(s.start_time).getTime() > Date.now()
        })
        .sort((a: { start_time?: string }, b: { start_time?: string }) =>
          new Date(a.start_time || '').getTime() - new Date(b.start_time || '').getTime(),
        )
        .slice(0, 5)
      if (!active) return
      setUpcomingBookings(
        (upcoming as Array<{ start_time: string; coach_id?: string; coach_name?: string | null; title?: string; type?: string; location?: string }>).map((s) => ({
          time: new Date(s.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
          coach: s.coach_name || 'Coach',
          focus: s.title || s.type || 'Training session',
          location: s.location || 'Online',
        })),
      )
    }
    loadSessions()
    return () => {
      active = false
    }
  }, [activeSubProfileId, supabase])

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
    const loadInboxSummary = async () => {
      setLoadingInbox(true)
      const params = new URLSearchParams({
        athlete_context_key: activeSubProfileId || 'main',
        athlete_context_label: activeAthleteLabel,
      })
      const response = await fetch(`/api/messages/inbox?${params.toString()}`, { cache: 'no-store' }).catch(() => null)
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
  }, [activeAthleteLabel, activeSubProfileId])

  useEffect(() => {
    let active = true
    const loadSpendSummary = async () => {
      setLoadingSpend(true)
      const [paymentsResponse, chargesResponse] = await Promise.all([
        fetch('/api/athlete/payments-summary', { cache: 'no-store' }).catch(() => null),
        fetch('/api/athlete/charges', { cache: 'no-store' }).catch(() => null),
      ])

      if (!active) return

      const paymentsPayload = paymentsResponse?.ok ? await paymentsResponse.json().catch(() => ({})) : {}
      const chargesPayload = chargesResponse?.ok ? await chargesResponse.json().catch(() => ({})) : {}

      if (!active) return

      const assignments = (chargesPayload.assignments || []) as Array<{
        fee_id: string
        status?: string | null
      }>
      const fees = (chargesPayload.fees || []) as Array<{
        id: string
        amount_cents: number
        due_date?: string | null
      }>
      const feeMap = new Map(fees.map((fee) => [fee.id, fee]))
      const nowDate = new Date()

      const totalDue = assignments.reduce((sum, assignment) => {
        const status = String(assignment.status || '').toLowerCase()
        if (status === 'paid' || status === 'waived') return sum
        return sum + Number(feeMap.get(assignment.fee_id)?.amount_cents || 0)
      }, 0)

      const dueThisMonth = assignments.reduce((sum, assignment) => {
        const status = String(assignment.status || '').toLowerCase()
        const fee = feeMap.get(assignment.fee_id)
        if (!fee?.due_date || status === 'paid' || status === 'waived') return sum
        const dueDate = new Date(fee.due_date)
        if (dueDate.getMonth() === nowDate.getMonth() && dueDate.getFullYear() === nowDate.getFullYear()) {
          return sum + Number(fee.amount_cents || 0)
        }
        return sum
      }, 0)

      const paidFeeCents = assignments.reduce((sum, assignment) => {
        const status = String(assignment.status || '').toLowerCase()
        if (status !== 'paid') return sum
        return sum + Number(feeMap.get(assignment.fee_id)?.amount_cents || 0)
      }, 0)

      const paidSessionCents = ((paymentsPayload.session_payments || []) as Array<{
        amount?: number | string | null
        status?: string | null
      }>).reduce((sum, payment) => {
        if (String(payment.status || '').toLowerCase() !== 'paid') return sum
        return sum + Math.round(Number(payment.amount || 0) * 100)
      }, 0)

      const paidMarketplaceCents = ((paymentsPayload.marketplace_receipts || []) as Array<{
        amount?: number | string | null
        status?: string | null
      }>).reduce((sum, receipt) => {
        if (String(receipt.status || '').toLowerCase() !== 'paid') return sum
        return sum + Math.round(Number(receipt.amount || 0) * 100)
      }, 0)

      setSpendSummary({
        totalDue,
        dueThisMonth,
        paidYtd: paidFeeCents + paidSessionCents + paidMarketplaceCents,
      })
      setLoadingSpend(false)
    }
    void loadSpendSummary()
    return () => {
      active = false
    }
  }, [])

  const handleCloseOnboarding = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ch_onboarding_athlete_v1', '1')
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

  const handleReviewSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reviewText.trim()) {
      pushToast('Add a short review before submitting.')
      return
    }
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (!userId) {
      pushToast('Sign in to leave a review.')
      return
    }

    const { data: coachRow } = await supabase
      .from('profiles')
      .select('id')
      .eq('full_name', reviewTarget)
      .eq('role', 'coach')
      .maybeSingle()
    const coachProfile = (coachRow || null) as { id?: string | null } | null

    if (!coachProfile?.id) {
      pushToast('Unable to find that coach profile.')
      return
    }

    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coach_id: coachProfile.id,
        reviewer_name: reviewName.trim() || null,
        rating: reviewRating,
        body: reviewText.trim(),
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      pushToast(payload?.error || 'Could not submit review yet.')
      return
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ch_reviewed_athlete_v1', '1')
    }
    setReviewed(true)
    setReviewOpen(false)
    setReviewText('')
    setReviewName('')
    setReviewRating(5)
    pushToast('Review submitted')
  }

  return (
    <main className="page-shell">
      <OnboardingModal role="athlete" open={showOnboarding} onClose={handleCloseOnboarding} userName={athleteName} />
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
              href="/select-plan?role=athlete"
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
      {needsGuardianApproval && !guardianInfoComplete && (
        <div className="flex items-center justify-between gap-4 border-b border-[#f5c2c2] bg-[#fff5f5] px-6 py-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#b80f0a]" />
            <p className="text-[#191919]">Your account requires guardian approval before messaging or booking. Ask a parent to visit <span className="font-semibold">coacheshive.com/guardian-approvals</span> to approve.</p>
          </div>
          <Link
            href="/athlete/settings"
            className="flex-shrink-0 rounded-full bg-[#b80f0a] px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Add guardian
          </Link>
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
      {pendingWaiverCount > 0 && (
        <div className="flex items-center justify-between gap-4 border-b border-[#f5c2c2] bg-[#fff5f5] px-6 py-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#b80f0a]" />
            <p className="text-[#191919]">You have {pendingWaiverCount} unsigned waiver{pendingWaiverCount !== 1 ? 's' : ''} required by your organization{pendingWaiverCount !== 1 ? 's' : ''}.</p>
          </div>
          <Link
            href="/athlete/waivers"
            className="flex-shrink-0 rounded-full bg-[#b80f0a] px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Sign waivers
          </Link>
        </div>
      )}
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athlete Portal</p>
            <h1 className="display text-3xl font-semibold md:text-4xl text-[#191919]">
              {athleteName ? `Hey ${athleteName}!` : 'Welcome back!'}
            </h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Your next sessions and progress highlights are waiting.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            {billingInfo?.status && (
              <Link
                href="/athlete/settings#payments"
                className="flex items-center gap-1.5 rounded-full border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-1 text-xs text-[#4a4a4a] transition-colors hover:border-[#191919]"
              >
                <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${billingInfo.status === 'active' ? 'bg-green-500' : billingInfo.status === 'trialing' ? 'bg-blue-500' : 'bg-[#b80f0a]'}`} />
                <span className="font-semibold capitalize">{billingInfo.tier ? billingInfo.tier.charAt(0).toUpperCase() + billingInfo.tier.slice(1) : ''}</span>
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
            <div className="flex flex-wrap gap-2 text-sm">
              <button
                type="button"
                className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                onClick={() => setCustomizeOpen(true)}
              >
                Customize
              </button>
              <Link href="/athlete/profile" className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
                Go to profile
              </Link>
              <Link href="/athlete/discover" className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
                Discover coaches
              </Link>
              <Link href="/athlete/calendar" className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white hover:opacity-90 transition-opacity">
                Book a session
              </Link>
            </div>
          </div>
        </header>
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">
            {!hiddenSections.includes('activation') && activationComplete < activationTasks.length && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Activation checklist</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Get to your first win</h2>
                    <p className="mt-1 text-sm text-[#4a4a4a]">Knock these out to unlock full progress tracking.</p>
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
                          body: JSON.stringify({ page: 'athlete_dashboard', hidden_sections: next }),
                        })
                        pushToast('Activation checklist hidden', {
                          label: 'Undo',
                          onAction: async () => {
                            setHiddenSections(previous)
                            await fetch('/api/dashboard-layout', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ page: 'athlete_dashboard', hidden_sections: previous }),
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
                        {'href' in task.action && typeof task.action.href === 'string' ? (
                          <Link
                            href={task.action.href}
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                          >
                            {task.action.label}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={task.action.onClick}
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                          >
                            {task.action.label}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!hiddenSections.includes('retention') && needsRetentionNudge && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Momentum check</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Stay on track this week</h2>
                    <p className="mt-1 text-sm text-[#4a4a4a]">
                      {lastSessionDate
                        ? `It's been ${daysSinceSession} days since your last session.`
                        : 'Book your first session to start tracking progress.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Link href="/athlete/calendar" className="rounded-full bg-[#b80f0a] px-3 py-1 font-semibold text-white">
                      Book session
                    </Link>
                    <Link href="/athlete/messages" className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                      Message coach
                    </Link>
                  </div>
                </div>
              </section>
            )}
            {!hiddenSections.includes('next_session') && (
              <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr]">
              <div className="glass-card card-hero card-accent space-y-4 border border-[#191919] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Next session</p>
                    <p className="text-lg font-semibold text-[#191919]">{nextSessionLabel}</p>
                    {nextSession && (
                      <p className="text-sm text-[#4a4a4a]">
                        Focus: {nextSession.focus} · {nextSession.location}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Link href="/athlete/calendar" className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] whitespace-nowrap">View calendar</Link>
                    <Link href="/athlete/messages" className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] whitespace-nowrap">Message coach</Link>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 text-sm">
                  {upcomingBookings.length === 0 ? (
                    <div className="col-span-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#9a9a9a]">
                      No upcoming sessions. <Link href="/athlete/calendar" className="font-semibold text-[#b80f0a]">Book a session</Link> to get started.
                    </div>
                  ) : upcomingBookings.map((booking) => (
                    <div key={booking.time} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">{booking.time}</p>
                      <p className="mt-1 text-lg font-semibold text-[#191919]">{booking.coach}</p>
                      <p className="text-sm text-[#4a4a4a]">{booking.focus}</p>
                      <p className="mt-1 text-xs text-[#4a4a4a]">{booking.location}</p>
                    </div>
                  ))}
                </div>
              </div>

              </section>
            )}

            {!hiddenSections.includes('programs') && (
              <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr]">
              <div className="glass-card card-accent border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-[#191919]">Active programs</h2>
                  <Link href="/athlete/marketplace" className="text-sm font-semibold text-[#191919] underline">
                    View all
                  </Link>
                </div>
                <p className="mt-2 text-sm text-[#4a4a4a]">
                  Plans and subscriptions you are currently enrolled in.
                </p>
                <div className="mt-6 space-y-4">
                  {loadingPrograms ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm text-[#9a9a9a]">
                      Loading programs…
                    </div>
                  ) : activePrograms.length === 0 ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm text-[#9a9a9a]">
                      No active programs yet. <Link href="/athlete/marketplace" className="font-semibold text-[#b80f0a]">Browse plans</Link> from your coaches.
                    </div>
                  ) : activePrograms.slice(0, 3).map((program) => (
                    <Link
                      key={program.id}
                      href={program.href}
                      className="block rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 transition-colors hover:border-[#191919]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-[#191919]">{program.title}</p>
                          <p className="mt-1 text-xs text-[#4a4a4a]">{program.subtitle}</p>
                        </div>
                        <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">
                          {program.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="glass-card card-accent border border-[#191919] bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-[#191919]">Messages</h2>
                  <Link href="/athlete/messages" className="text-sm font-semibold text-[#191919] underline">
                    Open inbox
                  </Link>
                </div>
                <p className="text-sm text-[#4a4a4a]">
                  Coach updates and system notifications.
                </p>
                <div className="space-y-3 text-sm">
                  {loadingInbox ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#9a9a9a]">
                      Loading inbox…
                    </div>
                  ) : dashboardThreads.length === 0 ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#9a9a9a]">
                      No conversations yet. <Link href="/athlete/messages" className="font-semibold text-[#b80f0a]">Open inbox</Link>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Unread threads</p>
                        <p className="mt-2 text-2xl font-semibold text-[#191919]">{unreadThreadCount}</p>
                      </div>
                      {dashboardThreads.slice(0, 3).map((thread) => (
                        <Link
                          key={thread.id}
                          href={`/athlete/messages?thread=${encodeURIComponent(thread.id)}`}
                          className="block rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 transition-colors hover:border-[#191919]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-[#191919]">{thread.name}</p>
                              <p className="mt-1 line-clamp-2 text-xs text-[#4a4a4a]">{thread.preview}</p>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-[#4a4a4a]">
                              {thread.unread ? <span className="h-2 w-2 rounded-full bg-[#b80f0a]" /> : null}
                              <span>{thread.time}</span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              </div>
              </section>
            )}

            {!hiddenSections.includes('spend') && (
              <section className="grid gap-6 md:grid-cols-2">
                <div className="glass-card card-accent border border-[#191919] bg-white p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-[#191919]">Spend summary</h2>
                    <Link href="/athlete/marketplace/orders" className="text-sm font-semibold text-[#191919] underline">
                      Purchase history
                    </Link>
                  </div>
                  <p className="mt-2 text-sm text-[#4a4a4a]">
                    Track subscriptions, bookings, and marketplace purchases.
                  </p>
                  <div className="mt-6 space-y-3 text-sm">
                    {loadingSpend ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-[#9a9a9a]">
                        Loading summary…
                      </div>
                    ) : (
                      <>
                        <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Total due</p>
                          <p className="mt-2 text-2xl font-semibold text-[#191919]">{formatCurrency(spendSummary.totalDue / 100)}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Due this month</p>
                            <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(spendSummary.dueThisMonth / 100)}</p>
                          </div>
                          <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Paid YTD</p>
                            <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(spendSummary.paidYtd / 100)}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="glass-card card-accent border border-[#191919] bg-white p-5 space-y-4">
                  <h2 className="text-xl font-semibold text-[#191919]">Quick actions & tasks</h2>
                  <div className="grid gap-3 md:grid-cols-2 text-sm">
                    {[
                      { label: 'Book a session', href: '/athlete/calendar' },
                      { label: 'Message coach', href: '/athlete/messages' },
                      { label: 'View programs', href: '/athlete/marketplace' },
                      { label: 'Review notes', href: '/athlete/notes' },
                      { label: 'Download receipts', href: '/athlete/marketplace/orders' },
                    ].map((action) => (
                      <Link
                        key={action.label}
                        href={action.href}
                        className="rounded-2xl border border-[#191919] px-4 py-3 text-left font-semibold text-[#191919] hover:bg-[#f5f5f5]"
                      >
                        {action.label}
                      </Link>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(true)}
                      className="rounded-2xl border border-[#191919] px-4 py-3 text-left font-semibold text-[#191919] hover:bg-[#f5f5f5]"
                    >
                      Invite user
                    </button>
                  </div>
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-[#191919]">Open tasks</p>
                      <button
                        type="button"
                        onClick={() => setAllTasksOpen(true)}
                        className="rounded-full border border-[#191919] px-3 py-1 text-[11px] font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        All tasks
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {tasks.map((task) => {
                        const href = resolveTaskHref(task.title)
                        const content = (
                          <>
                            <div>
                              <p className="font-semibold text-[#191919]">{task.title}</p>
                              <p className="text-xs text-[#4a4a4a]">Due: {task.due}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-[#191919] px-3 py-1 text-[11px] font-semibold text-[#191919]">
                                {task.status}
                              </span>
                              {href ? (
                                <span className="inline-flex items-center rounded-full bg-[#b80f0a] px-3 py-1 text-[11px] font-semibold tracking-[0.02em] text-white shadow-[0_8px_18px_rgba(184,15,10,0.28)] ring-1 ring-[#9f0d08]/20">
                                  Open task
                                </span>
                              ) : null}
                            </div>
                          </>
                        )
                        return href ? (
                          <Link
                            key={task.title}
                            href={href}
                            className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 hover:border-[#191919]"
                          >
                            {content}
                          </Link>
                        ) : (
                          <div
                            key={task.title}
                            className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-white px-3 py-2"
                          >
                            {content}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {!hiddenSections.includes('family') && familyEnabled && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-xl font-semibold text-[#191919]">Family dashboard</h2>
                  <Link href="/athlete/settings" className="text-sm font-semibold text-[#191919] underline">
                    Manage profiles
                  </Link>
                </div>
                <p className="mt-2 text-sm text-[#4a4a4a]">Overview of each athlete on the account.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {familyProfiles.map((profile) => (
                    <Link
                      key={profile.name}
                      href={
                        `/athlete/profiles/${slugify(profile.name)}?${
                          new URLSearchParams({
                            ...(profile.id ? { id: profile.id } : {}),
                            name: profile.name,
                          }).toString()
                        }`
                      }
                      className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm hover:border-[#191919]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#191919]">{profile.name}</p>
                          <p className="mt-1 text-xs text-[#4a4a4a]">{profile.sport || 'General'}</p>
                        </div>
                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <p className="text-xs font-medium text-[#4a4a4a]">Next: {profile.next}</p>
                          <span className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-[11px] font-semibold text-[#191919]">
                            Open
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {!hiddenSections.includes('family') && !familyEnabled && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <h2 className="text-xl font-semibold text-[#191919]">Family dashboard</h2>
                <p className="mt-2 text-sm text-[#4a4a4a]">
                  Family profiles and shared calendars are available on the Train and Family plans.
                </p>
                <Link
                  href="/pricing"
                  className="mt-3 inline-flex rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  View plans
                </Link>
              </section>
            )}
            {!hiddenSections.includes('practice_plans') && (
              <section className="glass-card card-accent border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-[#191919]">Team practice plans</h2>
                  <Link href="/athlete/calendar" className="text-sm font-semibold text-[#191919] underline">
                    View schedule
                  </Link>
                </div>
                <p className="mt-2 text-sm text-[#4a4a4a]">Plans shared by your coaches and teams.</p>
                <div className="mt-4 space-y-4 text-sm">
                  {practicePlans.length === 0 ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#4a4a4a]">
                      No practice plans yet.
                    </div>
                  ) : (
                    practicePlans.slice(0, 3).map((plan) => (
                      <Link
                        key={plan.id}
                        href={`/athlete/plans/${plan.id}`}
                        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm shadow-sm hover:border-[#191919]"
                      >
                        <div>
                          <p className="font-semibold text-[#191919]">{plan.title}</p>
                          <p className="text-xs text-[#4a4a4a]">
                            {plan.session_date ? new Date(plan.session_date).toLocaleDateString() : 'No date'} ·{' '}
                            {plan.duration_minutes ? `${plan.duration_minutes} min` : 'Open'}
                          </p>
                        </div>
                        <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                          View
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </section>
            )}
            {!hiddenSections.includes('invites') && invites.length > 0 && (
              <section id="invites" className="glass-card card-accent border border-[#191919] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Invitations</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Team invites waiting</h2>
                    <p className="mt-1 text-sm text-[#4a4a4a]">Join a team or organization to access shared practices.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {invites.map((invite) => (
                    <div key={invite.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3">
                      <p className="font-semibold text-[#191919]">{invite.org_name}</p>
                      <p className="text-xs text-[#4a4a4a]">
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
                        <p className="mt-3 text-xs font-semibold text-[#4a4a4a]">Awaiting org approval.</p>
                      )}
                    </div>
                  ))}
                </div>
                {inviteNotice && <p className="mt-2 text-xs text-[#4a4a4a]">{inviteNotice}</p>}
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
                { id: 'retention', label: 'Momentum check' },
                { id: 'invites', label: 'Invites' },
                { id: 'next_session', label: 'Next session' },
                { id: 'practice_plans', label: 'Practice plans' },
                { id: 'family', label: 'Family dashboard' },
              ].map((section) => {
                const isLocked = section.id === 'family' && !familyEnabled
                return (
                  <label
                    key={section.id}
                    className={`flex items-center justify-between rounded-2xl border border-[#dcdcdc] px-4 py-3 ${
                      isLocked ? 'bg-[#f5f5f5] text-[#9b9b9b]' : 'bg-[#f7f6f4]'
                    }`}
                  >
                    <span className="font-semibold text-[#191919]">
                      {section.label}
                      {isLocked ? ' (upgrade required)' : ''}
                    </span>
                    <input
                      type="checkbox"
                      checked={!hiddenSections.includes(section.id)}
                      onChange={(event) => {
                        if (isLocked) return
                        const next = new Set(hiddenSections)
                        if (event.target.checked) {
                          next.delete(section.id)
                        } else {
                          next.add(section.id)
                        }
                        setHiddenSections(Array.from(next))
                      }}
                      disabled={isLocked}
                    />
                  </label>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                onClick={async () => {
                  setLayoutSaving(true)
                  const nextHiddenSections = sanitizeAthleteHiddenSections(hiddenSections)
                  await fetch('/api/dashboard-layout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ page: 'athlete_dashboard', hidden_sections: nextHiddenSections }),
                  })
                  setHiddenSections(nextHiddenSections)
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
      {allTasksOpen && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[calc(100vw-2rem)] sm:max-w-2xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Tasks</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">All tasks</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">Complete these to keep progress on track.</p>
              </div>
              <button
                type="button"
                onClick={() => setAllTasksOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {tasks.length === 0 ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                  No open tasks right now.
                </div>
              ) : (
                tasks.map((task) => {
                  const href = resolveTaskHref(task.title)
                  return (
                    <div key={task.title} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#191919]">{task.title}</p>
                          <p className="mt-1 text-xs text-[#4a4a4a]">Due: {task.due}</p>
                        </div>
                        <span className="rounded-full border border-[#191919] px-3 py-1 text-[11px] font-semibold text-[#191919]">
                          {task.status}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {href ? (
                          <Link
                            href={href}
                            className="inline-flex items-center rounded-full bg-[#b80f0a] px-3 py-1.5 font-semibold text-white shadow-[0_10px_20px_rgba(184,15,10,0.28)] ring-1 ring-[#9f0d08]/20 transition hover:-translate-y-0.5 hover:bg-[#9f0d08]"
                          >
                            Open task
                          </Link>
                        ) : (
                          <span className="text-xs text-[#4a4a4a]">No action linked yet.</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
      {reviewOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[calc(100vw-2rem)] sm:max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Review</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Share feedback</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">Help {reviewTarget} with a quick review.</p>
              </div>
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleReviewSubmit} className="mt-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#191919]">Your name</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={reviewName}
                    onChange={(event) => setReviewName(event.target.value)}
                    placeholder="Your name"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#191919]">Rating</span>
                  <select
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={reviewRating}
                    onChange={(event) => setReviewRating(Number(event.target.value))}
                  >
                    <option value={5}>5 - Excellent</option>
                    <option value={4}>4 - Great</option>
                    <option value={3}>3 - Good</option>
                    <option value={2}>2 - Fair</option>
                    <option value={1}>1 - Poor</option>
                  </select>
                </label>
              </div>
              <label className="space-y-1 block">
                <span className="text-xs font-semibold text-[#191919]">Feedback</span>
                <textarea
                  rows={4}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  value={reviewText}
                  onChange={(event) => setReviewText(event.target.value)}
                  placeholder="Share your experience"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white">
                  Submit review
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  onClick={() => setReviewOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <InviteUserModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        allowedTypes={['coach', 'athlete', 'guardian']}
        defaultType="coach"
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
