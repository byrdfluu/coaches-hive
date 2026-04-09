"use client"

export const dynamic = 'force-dynamic'

import { useMemo, useState, useEffect, useCallback } from 'react'
import type { ChangeEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import AthleteProfileSwitcher from '@/components/AthleteProfileSwitcher'
import { useAthleteProfile } from '@/components/AthleteProfileContext'
import Toast from '@/components/Toast'
import StripeCheckoutForm from '@/components/StripeCheckoutForm'
import { useAthleteAccess } from '@/components/AthleteAccessProvider'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { ATHLETE_FAMILY_FEATURES, normalizeAthleteTier } from '@/lib/planRules'
import { resolveSessionRateCents, type SessionRates } from '@/lib/sessionPricing'
import {
  guardianPendingMessage,
  isGuardianApprovalApiError,
  requestGuardianApproval,
} from '@/lib/guardianApprovalClient'

type SessionRow = {
  id: string
  title?: string | null
  start_time?: string | null
  end_time?: string | null
  session_type?: string | null
  type?: string | null
  status?: string | null
  attendance_status?: string | null
  coach_id?: string | null
  location?: string | null
  notes?: string | null
  duration_minutes?: number | null
  practice_plan_id?: string | null
}

type AvailabilityBlock = {
  id?: string
  coach_id?: string | null
  day_of_week: number
  start_time: string
  end_time: string
  session_type?: string | null
  location?: string | null
  notes?: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  role?: string | null
  integration_settings?: IntegrationSettings | null
  coach_profile_settings?: {
    rates?: SessionRates
    location?: string
  } | null
}

type PracticePlan = {
  id: string
  title: string
}

type CalendarEvent = {
  day: number
  label: string
  type: '1:1' | 'strength' | 'endurance' | 'recovery'
  coach: string
  sessionId?: string
  notes?: string
  status?: string | null
}

type BookingRequestPayload = {
  coach_id: string
  athlete_id: string
  start_time: string
  duration_minutes: number
  session_type: string
  status: string
  location: string
  notes: string
  title: string
  meeting_mode: string
  meeting_provider: string | null
  meeting_link: string | null
  price_cents: number
  price: number
  sub_profile_id?: string | null
}

type IntegrationSettings = {
  videoProvider: 'zoom' | 'google_meet' | 'custom'
  customVideoLink: string
  connections: {
    google: { connected: boolean }
    zoom: { connected: boolean }
  }
}

const defaultIntegrationSettings: IntegrationSettings = {
  videoProvider: 'zoom',
  customVideoLink: '',
  connections: {
    google: { connected: false },
    zoom: { connected: false },
  },
}

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

const formatTime = (value?: string | null) => {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBD'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const formatSessionTypeLabel = (value: string) => {
  if (value === '1:1') return '1:1'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const formatAttendanceLabel = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Not marked'
  if (normalized === 'present') return 'Present'
  if (normalized === 'absent') return 'Absent'
  if (normalized === 'excused') return 'Excused'
  return normalized
}

const slugify = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const canConfirmAttendance = (session?: SessionRow | null) => {
  if (!session?.start_time) return false
  const start = new Date(session.start_time)
  if (Number.isNaN(start.getTime())) return false
  return start <= new Date()
}

const timeToMinutes = (value?: string | null) => {
  if (!value) return null
  const [hour, minute] = value.split(':').map((part) => Number(part))
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  return hour * 60 + minute
}

const minutesToTime = (minutes: number) => {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const getWeekStart = (date: Date) => {
  const day = date.getDay()
  const diff = date.getDate() - ((day + 6) % 7)
  const start = new Date(date)
  start.setDate(diff)
  start.setHours(0, 0, 0, 0)
  return start
}

const formatTimeLabel = (value?: string | null) => {
  if (!value) return 'TBD'
  const [hour, minute] = value.split(':').map((part) => Number(part))
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 'TBD'
  const date = new Date(2000, 0, 1, hour, minute)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const buildSlotTimes = (blocks: AvailabilityBlock[], durationMinutes: number) => {
  const slots: { time: string; block: AvailabilityBlock }[] = []
  const step = Math.min(30, Math.max(durationMinutes, 15))
  blocks.forEach((block) => {
    const startMinutes = timeToMinutes(block.start_time)
    const endMinutes = timeToMinutes(block.end_time)
    if (startMinutes === null || endMinutes === null) return
    for (let current = startMinutes; current + durationMinutes <= endMinutes; current += step) {
      slots.push({ time: minutesToTime(current), block })
    }
  })
  return slots
}

const normalizeType = (value?: string | null): CalendarEvent['type'] => {
  const raw = (value || '').toLowerCase()
  if (raw.includes('strength')) return 'strength'
  if (raw.includes('endurance')) return 'endurance'
  if (raw.includes('recovery')) return 'recovery'
  return '1:1'
}

const formatGoogleDate = (date: Date) =>
  date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

const buildGoogleCalendarUrl = (session: SessionRow, coachName?: string, planTitle?: string) => {
  if (!session.start_time) return null
  const start = new Date(session.start_time)
  if (Number.isNaN(start.getTime())) return null
  const end = session.end_time ? new Date(session.end_time) : new Date(start.getTime() + 60 * 60 * 1000)
  const endDate = Number.isNaN(end.getTime()) ? new Date(start.getTime() + 60 * 60 * 1000) : end
  const titleBase = session.title || session.session_type || session.type || 'Session'
  const title = coachName ? `${titleBase} with ${coachName}` : titleBase
  const details = [session.notes, planTitle ? `Practice plan: ${planTitle}` : null]
    .filter(Boolean)
    .join('\n')
  const location = session.location || ''
  const dates = `${formatGoogleDate(start)}/${formatGoogleDate(endDate)}`
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    title
  )}&dates=${dates}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`
}

export default function AthleteCalendarPage() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const { canTransact, needsGuardianApproval } = useAthleteAccess()
  const { activeSubProfileId, setActiveSubProfileId } = useAthleteProfile()
  const requestedSubProfileId = searchParams.get('sub_profile_id') || ''
  const [typeFilter, setTypeFilter] = useState<'All' | '1:1' | 'strength' | 'endurance' | 'recovery'>('All')
  const [search, setSearch] = useState('')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [familyView, setFamilyView] = useState(false)
  const [athleteTier, setAthleteTier] = useState<'explore' | 'train' | 'family'>('explore')
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [coachNames, setCoachNames] = useState<Record<string, string>>({})
  const [practicePlans, setPracticePlans] = useState<PracticePlan[]>([])
  const [coaches, setCoaches] = useState<ProfileRow[]>([])
  const [coachSearch, setCoachSearch] = useState('')
  const [selectedCoachId, setSelectedCoachId] = useState('')
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [authError, setAuthError] = useState('')
  const [availabilityError, setAvailabilityError] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [bookingForm, setBookingForm] = useState({
    coach: '',
    date: '',
    time: '',
    duration: '60',
    location: '',
    notes: '',
    meetingMode: 'in_person',
    meetingProvider: 'zoom',
    meetingLink: '',
  })
  const [availabilityFilters, setAvailabilityFilters] = useState({
    sessionType: 'All',
    location: 'All',
  })
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationSettings>(defaultIntegrationSettings)
  const [bookingNotice, setBookingNotice] = useState('')
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [paymentStep, setPaymentStep] = useState<'details' | 'pay' | 'confirm'>('details')
  const [paymentNotice, setPaymentNotice] = useState('')
  const [bookingClientSecret, setBookingClientSecret] = useState('')
  const [bookingAmountCents, setBookingAmountCents] = useState(0)
  const [pendingBookingPayload, setPendingBookingPayload] = useState<BookingRequestPayload | null>(null)
  const [selectedSlotDetails, setSelectedSlotDetails] = useState<{
    date: Date
    time: string
    location: string
    sessionType: string
  } | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [sessionNotice, setSessionNotice] = useState('')
  const [sessionSaving, setSessionSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (requestedSubProfileId) {
      setActiveSubProfileId(requestedSubProfileId)
    }
  }, [requestedSubProfileId, setActiveSubProfileId])
  const [rescheduleForm, setRescheduleForm] = useState({
    date: '',
    time: '',
    duration: '60',
  })
  const requestedCoachSlug = searchParams?.get('coach')?.trim().toLowerCase() || ''

  const [monthCursor, setMonthCursor] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const monthName = monthCursor.toLocaleString('en-US', { month: 'long' })
  const monthYear = String(monthCursor.getFullYear())
  const monthDays = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate()
  const startOffset = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1).getDay()
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const familyEnabled = ATHLETE_FAMILY_FEATURES[athleteTier]
  const googleConnected = selectedIntegration.connections.google.connected
  const zoomConnected = selectedIntegration.connections.zoom.connected
  const [appliedCoachSlug, setAppliedCoachSlug] = useState('')


  useEffect(() => {
    if (!familyEnabled && familyView) {
      setFamilyView(false)
    }
  }, [familyEnabled, familyView])

  useEffect(() => {
    let active = true
    const loadTier = async () => {
      try {
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
      } catch {
        // Non-critical: tier defaults to 'explore', page still loads
      }
    }
    loadTier()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    let mounted = true
    const loadCoaches = async () => {
      try {
        const response = await fetch('/api/athlete/coaches', { cache: 'no-store' })
        if (!mounted) return
        if (!response.ok) return
        const payload = await response.json().catch(() => null)
        if (!mounted) return
        const rows = (payload?.coaches || []) as ProfileRow[]
        setCoaches(rows)
        // Only auto-select the first coach when no selection has been made yet.
        // selectedCoachId is intentionally excluded from deps to avoid re-fetching
        // the full coach list every time the user picks a different coach.
        setSelectedCoachId((prev) => {
          if (prev) return prev
          if (rows.length > 0) {
            setBookingForm((form) => ({ ...form, coach: rows[0].full_name || form.coach }))
            return rows[0].id
          }
          return prev
        })
      } catch {
        // Coaches list failed to load; user can still view sessions
      }
    }
    loadCoaches()
    return () => {
      mounted = false
    }
  }, [])

  // Sync coach names from the loaded coaches list so session labels resolve correctly
  useEffect(() => {
    if (coaches.length === 0) return
    setCoachNames((prev) => {
      const next: Record<string, string> = { ...prev }
      coaches.forEach((coach) => {
        if (coach.full_name) next[coach.id] = coach.full_name
      })
      return next
    })
  }, [coaches])

  useEffect(() => {
    if (!requestedCoachSlug || requestedCoachSlug === appliedCoachSlug || coaches.length === 0) return
    const requestedCoach = coaches.find((coach) => slugify(coach.full_name) === requestedCoachSlug)
    if (!requestedCoach) {
      setAppliedCoachSlug(requestedCoachSlug)
      return
    }
    setSelectedCoachId(requestedCoach.id)
    setBookingForm((prev) => ({
      ...prev,
      coach: requestedCoach.full_name || prev.coach,
    }))
    setAppliedCoachSlug(requestedCoachSlug)
  }, [appliedCoachSlug, coaches, requestedCoachSlug])

  useEffect(() => {
    if (!selectedCoachId) return
    const match = coaches.find((coach) => coach.id === selectedCoachId)
    if (match?.integration_settings && typeof match.integration_settings === 'object') {
      const raw = match.integration_settings as Partial<IntegrationSettings>
      const nextSettings: IntegrationSettings = {
        videoProvider: raw.videoProvider || defaultIntegrationSettings.videoProvider,
        customVideoLink: raw.customVideoLink || defaultIntegrationSettings.customVideoLink,
        connections: {
          google: { connected: Boolean(raw.connections?.google?.connected) },
          zoom: { connected: Boolean(raw.connections?.zoom?.connected) },
        },
      }
      setSelectedIntegration(nextSettings)
      setBookingForm((prev) => ({
        ...prev,
        meetingProvider: nextSettings.videoProvider || prev.meetingProvider,
        meetingLink: prev.meetingLink || nextSettings.customVideoLink || '',
      }))
      return
    }
    setSelectedIntegration(defaultIntegrationSettings)
  }, [coaches, selectedCoachId])

  useEffect(() => {
    let mounted = true
    const loadUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (!mounted) return
        if (error || !data.user?.id) {
          setAuthError('Unable to verify your session. Please refresh the page.')
          setCurrentUserId(null)
          setLoading(false)
          return
        }
        setCurrentUserId(data.user.id)
      } catch {
        if (!mounted) return
        setAuthError('Unable to verify your session. Please refresh the page.')
        setCurrentUserId(null)
        setLoading(false)
      }
    }
    loadUser()
    return () => {
      mounted = false
    }
  }, [supabase])

  const loadSessions = useCallback(async () => {
    if (!currentUserId) return
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/sessions')
      if (!response.ok) {
        throw new Error(`Sessions request failed with status ${response.status}`)
      }
      const payload = await response.json()
      const rows = (payload.sessions || []) as SessionRow[]
      setSessions(rows)

      // Fetch practice plans independently of coach profiles.
      const planIds = Array.from(
        new Set(rows.map((row) => row.practice_plan_id).filter(Boolean) as string[])
      )

      const plansResult = planIds.length > 0
        ? await supabase.from('practice_plans').select('id, title').in('id', planIds)
        : { data: [] }

      setPracticePlans((plansResult.data || []) as PracticePlan[])
    } catch {
      setLoadError('Unable to load your sessions. Please refresh the page.')
      setSessions([])
      setPracticePlans([])
      setCoachNames({})
    } finally {
      setLoading(false)
    }
  }, [currentUserId, supabase])

  useEffect(() => {
    if (!currentUserId) return
    loadSessions()
  }, [currentUserId, loadSessions])

  useEffect(() => {
    if (!currentUserId) return
    const channel = supabase
      .channel(`athlete-sessions-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `athlete_id=eq.${currentUserId}` },
        () => loadSessions()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId, loadSessions, supabase])
  useEffect(() => {
    if (!selectedCoachId) {
      setAvailability([])
      setAvailabilityError('')
      return
    }
    const loadAvailability = async () => {
      setAvailabilityError('')
      try {
        const response = await fetch(`/api/availability?coach_id=${selectedCoachId}`)
        if (!response.ok) {
          throw new Error(`Availability request failed with status ${response.status}`)
        }
        const payload = await response.json()
        setAvailability((payload.availability || []) as AvailabilityBlock[])
      } catch {
        setAvailability([])
        setAvailabilityError('Unable to load coach availability.')
      }
    }
    loadAvailability()
  }, [selectedCoachId])

  const resolveCoachId = useCallback(async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return null
    // First try to find in the already-loaded coaches list
    const localMatch = coaches.find((coach) =>
      (coach.full_name || '').toLowerCase().includes(trimmed.toLowerCase())
    )
    if (localMatch) return localMatch.id
    // Fall back to API search
    const response = await fetch(`/api/athlete/coaches?search=${encodeURIComponent(trimmed)}`, { cache: 'no-store' })
    if (!response.ok) return null
    const payload = await response.json().catch(() => null)
    return (payload?.coaches?.[0]?.id as string | undefined) ?? null
  }, [coaches])

  const handleBookingChange = (field: keyof typeof bookingForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setBookingForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const selectedCoach = useMemo(() => coaches.find((coach) => coach.id === selectedCoachId), [coaches, selectedCoachId])
  const defaultCoachLocation = useMemo(() => {
    const availabilityLocation = availability
      .map((block) => block.location?.trim() || '')
      .find(Boolean)
    if (availabilityLocation) return availabilityLocation
    return selectedCoach?.coach_profile_settings?.location?.trim() || ''
  }, [availability, selectedCoach?.coach_profile_settings?.location])
  useEffect(() => {
    if (!defaultCoachLocation) return
    setBookingForm((prev) => {
      if (prev.meetingMode !== 'in_person' || prev.location.trim()) return prev
      return { ...prev, location: defaultCoachLocation }
    })
  }, [defaultCoachLocation])
  const selectedSessionType = selectedSlotDetails?.sessionType || availabilityFilters.sessionType || '1:1'
  const selectedSessionRateCents = useMemo(() => {
    return resolveSessionRateCents({
      rates: selectedCoach?.coach_profile_settings?.rates || null,
      sessionType: selectedSessionType,
      meetingMode: bookingForm.meetingMode,
    })
  }, [
    bookingForm.meetingMode,
    selectedCoach?.coach_profile_settings?.rates,
    selectedSessionType,
  ])

  const selectedDate = useMemo(() => {
    if (selectedDay === null) return null
    return new Date(monthCursor.getFullYear(), monthCursor.getMonth(), selectedDay)
  }, [selectedDay, monthCursor])

  const openBookingModal = useCallback((slot: { time: string; block: AvailabilityBlock }) => {
    if (!selectedDate) return
    const dateValue = selectedDate.toLocaleDateString('en-CA')
    setBookingForm((prev) => ({
      ...prev,
      coach: selectedCoach?.full_name || prev.coach,
      date: dateValue,
      time: slot.time,
      location: slot.block.location?.trim() || defaultCoachLocation || prev.location,
    }))
    setSelectedSlotDetails({
      date: selectedDate,
      time: slot.time,
      location: slot.block.location?.trim() || defaultCoachLocation || 'Location TBD',
      sessionType: slot.block.session_type || '1:1',
    })
    setPaymentNotice('')
    setPaymentStep('details')
    setBookingModalOpen(true)
  }, [defaultCoachLocation, selectedCoach?.full_name, selectedDate])

  const handlePayAndBook = useCallback(async () => {
    setPaymentNotice('')
    if (!currentUserId) {
      setPaymentNotice('Please sign in to complete booking.')
      return
    }
    if (!selectedCoachId) {
      setPaymentNotice('Select a coach before booking.')
      return
    }
    if (needsGuardianApproval) {
      const approvalResult = await requestGuardianApproval({
        target_type: 'coach',
        target_id: selectedCoachId,
        target_label: selectedCoach?.full_name || bookingForm.coach || 'this coach',
        scope: 'transactions',
      })
      if (!approvalResult.ok) {
        setPaymentNotice(approvalResult.error || 'Unable to request guardian approval.')
        return
      }
      if (approvalResult.status !== 'approved') {
        setPaymentNotice(guardianPendingMessage)
        return
      }
    }
    if (!bookingForm.date || !bookingForm.time) {
      setPaymentNotice('Select a date and time to book.')
      return
    }
    if (bookingForm.meetingMode === 'online') {
      if (!bookingForm.meetingProvider) {
        setPaymentNotice('Select a video provider for online sessions.')
        return
      }
      if (bookingForm.meetingProvider === 'custom' && !bookingForm.meetingLink.trim()) {
        setPaymentNotice('Add a meeting link for online sessions.')
        return
      }
      if (bookingForm.meetingProvider === 'google_meet' && !googleConnected) {
        setPaymentNotice('Coach has not connected Google Meet yet.')
        return
      }
      if (bookingForm.meetingProvider === 'zoom' && !zoomConnected) {
        setPaymentNotice('Coach has not connected Zoom yet.')
        return
      }
    }

    const startTime = new Date(`${bookingForm.date}T${bookingForm.time}`)
    if (Number.isNaN(startTime.getTime())) {
      setPaymentNotice('Enter a valid date and time.')
      return
    }

    const sessionType = selectedSessionType
    const sessionRateCents = selectedSessionRateCents
    const payload: BookingRequestPayload = {
      coach_id: selectedCoachId,
      athlete_id: currentUserId,
      start_time: startTime.toISOString(),
      duration_minutes: Number(bookingForm.duration),
      session_type: sessionType,
      status: 'Scheduled',
      location:
        bookingForm.meetingMode === 'online' && bookingForm.meetingProvider === 'custom'
          ? bookingForm.meetingLink
          : bookingForm.location,
      notes: bookingForm.notes,
      title: `Session with ${bookingForm.coach}`,
      meeting_mode: bookingForm.meetingMode,
      meeting_provider: bookingForm.meetingMode === 'online' ? bookingForm.meetingProvider : null,
      meeting_link: bookingForm.meetingMode === 'online' ? bookingForm.meetingLink : null,
      price_cents: sessionRateCents,
      price: sessionRateCents / 100,
      sub_profile_id: activeSubProfileId || null,
    }

    if (sessionRateCents <= 0) {
      setBookingLoading(true)
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        if (isGuardianApprovalApiError(data)) {
          setPaymentNotice(data?.error || guardianPendingMessage)
          setBookingLoading(false)
          return
        }
        setPaymentNotice(data?.error || 'Unable to book this session.')
        setBookingLoading(false)
        return
      }
      setBookingLoading(false)
      setPaymentStep('confirm')
      setBookingNotice('Session booked. It will appear on both calendars.')
      await loadSessions()
      return
    }

    setBookingLoading(true)
    const intentResponse = await fetch('/api/payments/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: sessionRateCents,
        currency: 'usd',
        metadata: {
          source: 'session_booking',
          feeCategory: 'session',
          coachId: selectedCoachId,
          athleteId: currentUserId,
          sessionType,
        },
      }),
    })
    const intentPayload = await intentResponse.json().catch(() => null)
    if (!intentResponse.ok || !intentPayload?.clientSecret) {
      if (isGuardianApprovalApiError(intentPayload)) {
        setPaymentNotice(intentPayload?.error || guardianPendingMessage)
        setBookingLoading(false)
        return
      }
      setPaymentNotice(intentPayload?.error || 'Unable to initialize payment.')
      setBookingLoading(false)
      return
    }
    setPendingBookingPayload(payload)
    setBookingAmountCents(sessionRateCents)
    setBookingClientSecret(intentPayload.clientSecret)
    setPaymentStep('pay')
    setBookingLoading(false)
  }, [
    activeSubProfileId,
    bookingForm,
    currentUserId,
    googleConnected,
    loadSessions,
    needsGuardianApproval,
    selectedCoachId,
    selectedCoach?.full_name,
    selectedSessionRateCents,
    selectedSessionType,
    zoomConnected,
  ])

  const handleStripeBookingSuccess = useCallback(async (paymentIntentId: string) => {
    if (!pendingBookingPayload) {
      setPaymentNotice('Booking payload is missing. Please try again.')
      return
    }
    setBookingLoading(true)
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...pendingBookingPayload,
        payment_intent_id: paymentIntentId,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      if (isGuardianApprovalApiError(payload)) {
        setPaymentNotice(payload?.error || guardianPendingMessage)
        setBookingLoading(false)
        return
      }
      setPaymentNotice(payload?.error || 'Unable to finalize booking after payment.')
      setBookingLoading(false)
      return
    }
    setBookingLoading(false)
    setBookingClientSecret('')
    setPendingBookingPayload(null)
    setPaymentStep('confirm')
    setBookingNotice('Session booked. It will appear on both calendars.')
    await loadSessions()
  }, [loadSessions, pendingBookingPayload])

  const closeBookingModal = useCallback(() => {
    setBookingModalOpen(false)
    setPaymentNotice('')
    setPaymentStep('details')
    setBookingClientSecret('')
    setBookingAmountCents(0)
    setPendingBookingPayload(null)
    setSelectedSlotDetails(null)
  }, [])

  const selectDate = useCallback((date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateValue = `${year}-${month}-${day}`
    setMonthCursor(new Date(year, date.getMonth(), 1))
    setSelectedDay(date.getDate())
    setBookingForm((prev) => ({ ...prev, date: dateValue }))
  }, [])

  const handleDaySelect = useCallback((dayNumber: number) => {
    const date = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), dayNumber)
    selectDate(date)
  }, [monthCursor, selectDate])

  const goToPrevMonth = useCallback(() => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
    setSelectedDay(null)
  }, [])

  const goToNextMonth = useCallback(() => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
    setSelectedDay(null)
  }, [])

  const jumpToToday = useCallback(() => {
    const today = new Date()
    selectDate(today)
  }, [selectDate])

  const jumpToTomorrow = useCallback(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    selectDate(tomorrow)
  }, [selectDate])

  const jumpToWeekend = useCallback(() => {
    const today = new Date()
    const offset = (6 - today.getDay() + 7) % 7
    const target = new Date(today)
    target.setDate(today.getDate() + offset)
    selectDate(target)
  }, [selectDate])

  const formatDateInput = (value?: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('en-CA')
  }

  const formatTimeInput = (value?: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const events = useMemo<CalendarEvent[]>(() => {
    return sessions
      .map((session) => {
        if (!session.start_time) return null
        const start = new Date(session.start_time)
        if (start.getMonth() !== monthCursor.getMonth() || start.getFullYear() !== monthCursor.getFullYear()) return null
        const coachName = session.coach_id ? coachNames[session.coach_id] : 'Coach'
        const labelBase = session.title || session.session_type || session.type || 'Session'
        const label = `${formatTime(session.start_time)} · ${labelBase}`
        return {
          day: start.getDate(),
          label,
          type: normalizeType(session.session_type || session.type),
          coach: coachName || 'Coach',
          sessionId: session.id,
          notes: session.notes || undefined,
          status: session.status || null,
        }
      })
      .filter(Boolean) as CalendarEvent[]
  }, [sessions, coachNames, monthCursor])

  const availabilityByDay = useMemo(() => {
    const map: Record<number, AvailabilityBlock[]> = {}
    availability.forEach((block) => {
      const day = Number(block.day_of_week)
      if (Number.isNaN(day)) return
      if (!map[day]) map[day] = []
      map[day].push(block)
    })
    return map
  }, [availability])

  const availabilityOptions = useMemo(() => {
    const types = new Set<string>()
    const locations = new Set<string>()
    availability.forEach((block) => {
      if (block.session_type) {
        types.add(block.session_type)
      }
      if (block.location && block.location.trim()) {
        locations.add(block.location.trim())
      }
    })
    return {
      types: Array.from(types).sort(),
      locations: Array.from(locations).sort(),
    }
  }, [availability])

  useEffect(() => {
    if (availabilityFilters.sessionType !== 'All' && !availabilityOptions.types.includes(availabilityFilters.sessionType)) {
      setAvailabilityFilters((prev) => ({ ...prev, sessionType: 'All' }))
    }
    if (availabilityFilters.location !== 'All' && !availabilityOptions.locations.includes(availabilityFilters.location)) {
      setAvailabilityFilters((prev) => ({ ...prev, location: 'All' }))
    }
  }, [
    availabilityFilters.sessionType,
    availabilityFilters.location,
    availabilityOptions.types,
    availabilityOptions.locations,
  ])

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const matchesType = typeFilter === 'All' || e.type === typeFilter
      const matchesSearch = e.label.toLowerCase().includes(search.toLowerCase()) || e.coach.toLowerCase().includes(search.toLowerCase())
      return matchesType && matchesSearch
    })
  }, [search, typeFilter, events])

  const summaryStats = useMemo(() => {
    const now = new Date()
    const weekStart = getWeekStart(now)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)
    const weekCount = sessions.filter((session) => {
      if (!session.start_time) return false
      const start = new Date(session.start_time)
      return start >= weekStart && start < weekEnd
    }).length
    const upcomingCount = sessions.filter((session) => {
      if (!session.start_time) return false
      const start = new Date(session.start_time)
      return start >= now && start < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    }).length
    const confirmedCount = sessions.filter((session) => {
      const status = String(session.status || '').toLowerCase()
      return status.includes('confirmed') || status.includes('scheduled')
    }).length
    const openSlots = selectedCoachId ? availability.length : 0
    return [
      { label: 'This week', value: weekCount },
      { label: 'Next 7 days', value: upcomingCount },
      { label: 'Confirmed', value: confirmedCount },
      { label: 'Open slots', value: openSlots, helper: selectedCoachId ? 'With selected coach' : 'Select a coach' },
    ]
  }, [availability.length, selectedCoachId, sessions])

  const upcomingSessions = useMemo(() => {
    const now = new Date()
    return sessions
      .map((session) => {
        if (!session.start_time) return null
        const start = new Date(session.start_time)
        if (Number.isNaN(start.getTime())) return null
        return {
          id: session.id,
          title: session.title || session.session_type || session.type || 'Session',
          start,
          coachName: session.coach_id ? coachNames[session.coach_id] || 'Coach' : 'Coach',
          status: session.status || 'Scheduled',
          location: session.location || 'TBD',
          practicePlanId: session.practice_plan_id || null,
        }
      })
      .filter((session): session is NonNullable<typeof session> => session !== null)
      .filter((session) => session.start >= now)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 5)
  }, [coachNames, sessions])

  const selectedEvents = useMemo(() => {
    if (selectedDay === null) {
      return []
    }
    return filteredEvents.filter((event) => event.day === selectedDay)
  }, [filteredEvents, selectedDay])

  const selectedDayAvailability = useMemo(() => {
    if (!selectedDate) return []
    const dayOfWeek = selectedDate.getDay()
    return availabilityByDay[dayOfWeek] || []
  }, [availabilityByDay, selectedDate])

  const slotDuration = Number(bookingForm.duration) || 60

  const availableSlots = useMemo(() => {
    if (!selectedCoachId || !selectedDate) return []
    const filteredBlocks = selectedDayAvailability.filter((block) => {
      const typeLabel = block.session_type || 'General'
      const locationLabel = block.location?.trim() || 'Location TBD'
      const matchesType = availabilityFilters.sessionType === 'All' || availabilityFilters.sessionType === typeLabel
      const matchesLocation = availabilityFilters.location === 'All' || availabilityFilters.location === locationLabel
      return matchesType && matchesLocation
    })
    return buildSlotTimes(filteredBlocks, slotDuration)
  }, [selectedCoachId, selectedDate, selectedDayAvailability, slotDuration, availabilityFilters])

  const groupedSlots = useMemo(() => {
    const groups: Record<'Morning' | 'Afternoon' | 'Evening', { time: string; block: AvailabilityBlock }[]> = {
      Morning: [],
      Afternoon: [],
      Evening: [],
    }
    availableSlots.forEach((slot) => {
      const hour = Number(slot.time.split(':')[0])
      if (hour < 12) {
        groups.Morning.push(slot)
      } else if (hour < 17) {
        groups.Afternoon.push(slot)
      } else {
        groups.Evening.push(slot)
      }
    })
    return groups
  }, [availableSlots])

  const nextAvailableSlot = useMemo(() => {
    if (!selectedCoachId) return null
    const start = new Date()
    for (let offset = 0; offset < 30; offset += 1) {
      const candidate = new Date(start)
      candidate.setDate(start.getDate() + offset)
      const blocks = (availabilityByDay[candidate.getDay()] || []).filter((block) => {
        const typeLabel = block.session_type || 'General'
        const locationLabel = block.location?.trim() || 'Location TBD'
        const matchesType = availabilityFilters.sessionType === 'All' || availabilityFilters.sessionType === typeLabel
        const matchesLocation = availabilityFilters.location === 'All' || availabilityFilters.location === locationLabel
        return matchesType && matchesLocation
      })
      if (blocks.length === 0) continue
      const slots = buildSlotTimes(blocks, slotDuration)
      if (slots.length === 0) continue
      return { date: candidate, slot: slots[0] }
    }
    return null
  }, [availabilityByDay, selectedCoachId, slotDuration, availabilityFilters])

  const nextAvailableLabel = useMemo(() => {
    if (!nextAvailableSlot) return ''
    return `${nextAvailableSlot.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${formatTimeLabel(
      nextAvailableSlot.slot.time
    )}`
  }, [nextAvailableSlot])

  const sessionById = useMemo(() => {
    const map = new Map<string, SessionRow>()
    sessions.forEach((session) => {
      map.set(session.id, session)
    })
    return map
  }, [sessions])

  const practicePlanMap = useMemo(() => {
    const map = new Map<string, PracticePlan>()
    practicePlans.forEach((plan) => map.set(plan.id, plan))
    return map
  }, [practicePlans])

  const updateSession = useCallback(
    async (sessionId: string, updates: Record<string, unknown>) => {
      setSessionSaving(true)
      setSessionNotice('')
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setSessionNotice(data?.error || 'Unable to update session.')
        setSessionSaving(false)
        return false
      }
      await loadSessions()
      setSessionSaving(false)
      return true
    },
    [loadSessions]
  )

  const openSession = useCallback(
    (sessionId?: string) => {
      if (!sessionId) return
      const session = sessionById.get(sessionId)
      if (!session?.start_time) return
      const start = new Date(session.start_time)
      const end = session.end_time ? new Date(session.end_time) : null
      const duration = end && !Number.isNaN(end.getTime())
        ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000))
        : session?.duration_minutes || 60
      setActiveSessionId(sessionId)
      setRescheduleOpen(false)
      setSessionNotice('')
      setRescheduleForm({
        date: formatDateInput(session.start_time),
        time: formatTimeInput(session.start_time),
        duration: String(duration),
      })
    },
    [sessionById]
  )

  const closeSession = useCallback(() => {
    setActiveSessionId(null)
    setRescheduleOpen(false)
    setSessionNotice('')
  }, [])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <AthleteProfileSwitcher className="mb-4" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Calendar</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">
              Visual schedule for sessions and classes.
            </h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Sync, reschedule, and manage reminders.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/athlete/settings#export-center" className="inline-flex h-7 items-center justify-center rounded-full border border-[#191919] px-4 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
              Go to export center
            </Link>
            <Link href="/athlete/discover" className="inline-flex h-7 items-center justify-center rounded-full border border-[#191919] px-4 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
              Find coach
            </Link>
            <Link href="/athlete/messages" className="inline-flex h-7 items-center justify-center rounded-full border border-[#191919] px-4 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
              Message coach
            </Link>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">
            {authError && (
              <div className="rounded-2xl border border-[#b80f0a] bg-white p-4 text-sm text-[#b80f0a]">
                {authError}
              </div>
            )}
            {loadError && (
              <div className="rounded-2xl border border-[#b80f0a] bg-white p-4 text-sm text-[#b80f0a]">
                {loadError}
              </div>
            )}
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {summaryStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{stat.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                  {stat.helper && (
                    <p className="mt-1 text-xs text-[#9a9a9a]">{stat.helper}</p>
                  )}
                </div>
              ))}
            </section>
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#191919]">
                  <button
                    type="button"
                    onClick={goToPrevMonth}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dcdcdc] text-base text-[#191919] hover:border-[#191919]"
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                  <span>{monthName} {monthYear}</span>
                  <button
                    type="button"
                    onClick={goToNextMonth}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dcdcdc] text-base text-[#191919] hover:border-[#191919]"
                    aria-label="Next month"
                  >
                    ›
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {(['All', '1:1', 'strength', 'endurance', 'recovery'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setTypeFilter(type)}
                      className={`rounded-full border px-3 py-1 font-semibold transition ${
                        typeFilter === type ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
                      }`}
                    >
                      {type === '1:1' ? '1:1' : type[0].toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sessions, coaches, or keywords"
                  className="w-full rounded-2xl border border-[#dcdcdc] px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none md:w-80"
                />
                <label className="flex items-center gap-2 text-xs font-semibold text-[#191919]">
                  <input
                    type="checkbox"
                    checked={familyView}
                    onChange={(event) => setFamilyView(event.target.checked)}
                    className="h-4 w-4 border-[#191919]"
                    disabled={!familyEnabled}
                  />
                  <span className={familyEnabled ? '' : 'text-[#9b9b9b]'}>
                    Family view{familyEnabled ? '' : ' (upgrade required)'}
                  </span>
                </label>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="flex items-center gap-2 rounded-full border border-[#dcdcdc] px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-[#b80f0a]" /> Sessions
                  </span>
                  <span className="flex items-center gap-2 rounded-full border border-[#dcdcdc] px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-[#4a4a4a]" /> Coach tasks
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Appointment</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-[#191919]">1:1 Private Training</p>
                    <p className="text-sm text-[#4a4a4a]">
                      {selectedCoach?.full_name ? `with ${selectedCoach.full_name}` : 'Select a coach to book'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <input
                      type="text"
                      value={coachSearch}
                      onChange={(e) => setCoachSearch(e.target.value)}
                      placeholder="Search coaches..."
                      className="rounded-full border border-[#dcdcdc] px-3 py-1.5 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <div className="rounded-full border border-[#dcdcdc] bg-white px-3 py-2 text-xs font-semibold text-[#191919]">
                      <label className="sr-only" htmlFor="coach-availability">Choose coach</label>
                      <select
                        id="coach-availability"
                        value={selectedCoachId}
                        onChange={(event) => {
                          setSelectedCoachId(event.target.value)
                          const coach = coaches.find((item) => item.id === event.target.value)
                          if (coach?.full_name) {
                            setBookingForm((prev) => ({ ...prev, coach: coach.full_name || prev.coach }))
                          }
                        }}
                        className="bg-transparent text-xs font-semibold text-[#191919] focus:outline-none"
                      >
                        <option value="">Select coach</option>
                        {coaches
                          .filter((coach) =>
                            !coachSearch.trim() ||
                            (coach.full_name || '').toLowerCase().includes(coachSearch.trim().toLowerCase())
                          )
                          .map((coach) => (
                            <option key={coach.id} value={coach.id}>
                              {coach.full_name || 'Coach'}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#191919]">
                    Duration: {bookingForm.duration} min
                  </span>
                  <span className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#191919]">
                    {bookingForm.location ? bookingForm.location : 'Location TBD'}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={jumpToToday}
                    className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={jumpToTomorrow}
                    className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={jumpToWeekend}
                    className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    Weekend
                  </button>
                </div>
                {nextAvailableSlot ? (
                  <button
                    type="button"
                    onClick={() => selectDate(nextAvailableSlot.date)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 font-semibold text-[#191919]"
                  >
                    Next available: {nextAvailableLabel}
                  </button>
                ) : (
                  <span className="text-[#9a9a9a]">Select a coach to see next availability</span>
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#191919]">
                <div className="grid grid-cols-7 gap-2 text-[11px] text-[#4a4a4a]">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div key={day} className="text-center font-semibold uppercase tracking-[0.2em]">{day}</div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-7 gap-2">
                  {Array.from({ length: startOffset }).map((_, index) => (
                    <div key={`empty-${index}`} className="min-h-[72px] rounded-xl border border-transparent" />
                  ))}
                  {Array.from({ length: monthDays }).map((_, index) => {
                    const dayNumber = index + 1
                    const dayEvents = filteredEvents.filter((event) => event.day === dayNumber)
                    const dayOfWeek = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), dayNumber).getDay()
                    const dayAvailability = availabilityByDay[dayOfWeek] || []
                    return (
                      <button
                        key={dayNumber}
                        type="button"
                        onClick={() => handleDaySelect(dayNumber)}
                        className={`min-h-[72px] rounded-xl border bg-white p-2 text-left transition ${
                          selectedDay === dayNumber ? 'border-[#b80f0a] ring-2 ring-[#b80f0a]/20' : 'border-[#e5e5e5]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-[#4a4a4a]">
                          <span className="font-semibold text-[#191919]">{dayNumber}</span>
                          {dayEvents.length > 0 && (
                            <span className="h-2 w-2 rounded-full bg-[#b80f0a]" />
                          )}
                          {dayEvents.length === 0 && dayAvailability.length > 0 && selectedCoachId && (
                            <span className="h-2 w-2 rounded-full bg-[#191919]" />
                          )}
                        </div>
                        <p className="mt-2 text-[10px] text-[#9a9a9a]">
                          {dayEvents.length > 0
                            ? `${dayEvents.length} item${dayEvents.length > 1 ? 's' : ''}`
                            : dayAvailability.length > 0 && selectedCoachId
                            ? `${dayAvailability.length} open`
                            : '—'}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <p className="mt-3 text-xs text-[#4a4a4a]">Timezone: {localTimezone}</p>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Available times</p>
                    <span className="text-xs text-[#4a4a4a]">
                      {selectedDate ? selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Select a day'}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="font-semibold text-[#4a4a4a]">Session type</span>
                      <select
                        value={availabilityFilters.sessionType}
                        onChange={(event) => setAvailabilityFilters((prev) => ({ ...prev, sessionType: event.target.value }))}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                      >
                        <option value="All">All session types</option>
                        {availabilityOptions.types.map((type) => (
                          <option key={type} value={type}>
                            {formatSessionTypeLabel(type)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="font-semibold text-[#4a4a4a]">Location</span>
                      <select
                        value={availabilityFilters.location}
                        onChange={(event) => setAvailabilityFilters((prev) => ({ ...prev, location: event.target.value }))}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                      >
                        <option value="All">All locations</option>
                        {availabilityOptions.locations.map((location) => (
                          <option key={location} value={location}>
                            {location}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {loading ? (
                    <p className="mt-3 text-xs text-[#9a9a9a]">Loading availability...</p>
                  ) : availabilityError ? (
                    <p className="mt-3 text-xs text-[#b80f0a]">{availabilityError}</p>
                  ) : !selectedCoachId ? (
                    <p className="mt-3 text-xs text-[#9a9a9a]">Choose a coach to see open times.</p>
                  ) : selectedDay === null ? (
                    <p className="mt-3 text-xs text-[#9a9a9a]">Pick a day to view availability.</p>
                  ) : availableSlots.length === 0 ? (
                    <p className="mt-3 text-xs text-[#9a9a9a]">No availability for this day.</p>
                  ) : (
                    <div className="mt-3 space-y-3 text-xs">
                      {(Object.keys(groupedSlots) as Array<keyof typeof groupedSlots>).map((group) => {
                        const slots = groupedSlots[group]
                        if (!slots.length) return null
                        return (
                          <div key={group}>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">{group}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {slots.map((slot) => (
                                <button
                                  key={`${group}-${slot.time}`}
                                  type="button"
                                  onClick={() => openBookingModal(slot)}
                                  className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                                >
                                  {formatTimeLabel(slot.time)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Scheduled items</p>
                    <span className="text-xs text-[#4a4a4a]">{selectedDay ? `${selectedEvents.length} items` : '—'}</span>
                  </div>
                  <div className="mt-3 space-y-3 text-xs text-[#4a4a4a]">
                    {selectedEvents.map((event) => (
                      <div key={`${event.day}-${event.label}-detail`} className="rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] px-3 py-2">
                        <p className="font-semibold text-[#191919]">{event.label}</p>
                        <p className="text-xs text-[#4a4a4a]">{event.coach}</p>
                        {event.sessionId && sessionById.get(event.sessionId)?.practice_plan_id && (
                          <p className="mt-1 text-xs text-[#4a4a4a]">
                            Plan: {practicePlanMap.get(sessionById.get(event.sessionId)?.practice_plan_id || '')?.title || 'Linked plan'}
                          </p>
                        )}
                        {event.notes && (
                          <p className="mt-1 text-xs text-[#4a4a4a]">Notes: {event.notes}</p>
                        )}
                        {event.status && (
                          <p className="mt-1 text-xs text-[#4a4a4a]">Status: {event.status}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
                          {event.sessionId && (
                            (() => {
                              const session = sessionById.get(event.sessionId)
                              const planTitle = session?.practice_plan_id
                                ? practicePlanMap.get(session.practice_plan_id || '')?.title
                                : undefined
                              const url = session ? buildGoogleCalendarUrl(session, event.coach, planTitle) : null
                              if (!url) return null
                              return (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[#b80f0a] underline"
                                >
                                  Add to Google
                                </a>
                              )
                            })()
                          )}
                          {event.sessionId && (
                            <button
                              type="button"
                              onClick={() => openSession(event.sessionId)}
                              className="text-[#b80f0a] underline"
                            >
                              Manage session
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {selectedEvents.length === 0 && (
                      <div className="rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] px-3 py-2 text-xs text-[#4a4a4a]">
                        {selectedDay ? 'No coach sessions or tasks scheduled for this day.' : 'Pick a day to review your coach schedule.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Upcoming</p>
                  <h2 className="mt-2 text-lg font-semibold text-[#191919]">Next sessions</h2>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Your next five sessions across coaches.</p>
                </div>
                <Link href="/athlete/calendar" className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
                  View all
                </Link>
              </div>
              <div className="mt-4 space-y-3">
                {upcomingSessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f9f9f9] p-4 text-xs text-[#4a4a4a]">
                    No upcoming sessions yet. Book a coach or pick an open time.
                  </div>
                ) : (
                  <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                    {upcomingSessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => openSession(session.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-left text-sm transition hover:border-[#b80f0a]"
                      >
                        <div>
                          <p className="font-semibold text-[#191919]">{session.title}</p>
                          <p className="mt-1 text-xs text-[#4a4a4a]">
                            {session.coachName} · {session.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {formatTime(session.start.toISOString())}
                          </p>
                          <p className="mt-1 text-xs text-[#9a9a9a]">{session.location}</p>
                          {session.practicePlanId ? (
                            <p className="mt-1 text-xs text-[#4a4a4a]">
                              Plan: {practicePlanMap.get(session.practicePlanId)?.title || 'Linked plan'}
                            </p>
                          ) : null}
                        </div>
                        <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-[11px] font-semibold text-[#4a4a4a]">
                          {session.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {activeSessionId && (
              <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
                <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Session</p>
                      <p className="text-lg font-semibold text-[#191919]">
                        {sessionById.get(activeSessionId)?.title || 'Session details'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeSession}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
                    <p><span className="font-semibold text-[#191919]">Status:</span> {sessionById.get(activeSessionId)?.status || 'Scheduled'}</p>
                    <p>
                      <span className="font-semibold text-[#191919]">Attendance:</span>{' '}
                      {formatAttendanceLabel(sessionById.get(activeSessionId)?.attendance_status)}
                    </p>
                    <p><span className="font-semibold text-[#191919]">Location:</span> {sessionById.get(activeSessionId)?.location || 'TBD'}</p>
                    {sessionById.get(activeSessionId)?.practice_plan_id && (
                      <p>
                        <span className="font-semibold text-[#191919]">Practice plan:</span>{' '}
                        {practicePlanMap.get(sessionById.get(activeSessionId)?.practice_plan_id || '')?.title || 'Linked plan'}
                      </p>
                    )}
                    {sessionById.get(activeSessionId)?.notes && (
                      <p><span className="font-semibold text-[#191919]">Notes:</span> {sessionById.get(activeSessionId)?.notes}</p>
                    )}
                  </div>
                  {(() => {
                    const session = sessionById.get(activeSessionId)
                    if (!session) return null
                    if (!canConfirmAttendance(session)) {
                      return (
                        <p className="mt-3 text-xs text-[#4a4a4a]">
                          Attendance confirmation opens once the session begins.
                        </p>
                      )
                    }
                    return (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                        <button
                          type="button"
                          disabled={sessionSaving}
                          onClick={async () => {
                            const ok = await updateSession(activeSessionId, { attendance_status: 'present' })
                            if (ok) {
                              setToast('Attendance confirmed')
                            }
                          }}
                          className="rounded-full bg-[#b80f0a] px-4 py-2 text-white disabled:opacity-60"
                        >
                          Confirm attendance
                        </button>
                        <button
                          type="button"
                          disabled={sessionSaving}
                          onClick={async () => {
                            const ok = await updateSession(activeSessionId, { attendance_status: 'absent' })
                            if (ok) {
                              setToast('Attendance updated')
                            }
                          }}
                          className="rounded-full border border-[#191919] px-4 py-2 text-[#191919] disabled:opacity-60"
                        >
                          Couldn&apos;t attend
                        </button>
                      </div>
                    )
                  })()}

                  {rescheduleOpen && (
                    <div className="mt-4 rounded-2xl border border-[#e5e5e5] bg-[#f5f5f5] p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Reschedule</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <input
                          type="date"
                          value={rescheduleForm.date}
                          onChange={(event) => setRescheduleForm((prev) => ({ ...prev, date: event.target.value }))}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                        />
                        <input
                          type="time"
                          value={rescheduleForm.time}
                          onChange={(event) => setRescheduleForm((prev) => ({ ...prev, time: event.target.value }))}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                        />
                        <select
                          value={rescheduleForm.duration}
                          onChange={(event) => setRescheduleForm((prev) => ({ ...prev, duration: event.target.value }))}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                        >
                          <option value="30">30 min</option>
                          <option value="45">45 min</option>
                          <option value="60">60 min</option>
                          <option value="90">90 min</option>
                        </select>
                      </div>
                      {sessionNotice && <p className="mt-2 text-xs text-[#4a4a4a]">{sessionNotice}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={sessionSaving}
                          onClick={async () => {
                            if (!rescheduleForm.date || !rescheduleForm.time) {
                              setSessionNotice('Add a new date and time.')
                              return
                            }
                            const startTime = new Date(`${rescheduleForm.date}T${rescheduleForm.time}`)
                            if (Number.isNaN(startTime.getTime())) {
                              setSessionNotice('Invalid date or time.')
                              return
                            }
                            const ok = await updateSession(activeSessionId, {
                              start_time: startTime.toISOString(),
                              duration_minutes: Number(rescheduleForm.duration),
                              status: 'Rescheduled',
                            })
                            if (ok) {
                              setSessionNotice('Session rescheduled.')
                              setToast('Session rescheduled')
                              setRescheduleOpen(false)
                            }
                          }}
                          className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {sessionSaving ? 'Saving...' : 'Save changes'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRescheduleOpen(false)}
                          className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setRescheduleOpen(true)
                        setSessionNotice('')
                      }}
                      className="rounded-full border border-[#191919] px-4 py-2 text-[#191919]"
                    >
                      Reschedule
                    </button>
                    <button
                      type="button"
                      disabled={sessionSaving}
                      onClick={async () => {
                        const ok = await updateSession(activeSessionId, { status: 'Canceled' })
                        if (ok) {
                          setSessionNotice('Session canceled.')
                          setToast('Session canceled')
                          closeSession()
                        }
                      }}
                      className="rounded-full bg-[#191919] px-4 py-2 text-white disabled:opacity-60"
                    >
                      Cancel session
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
      {bookingModalOpen && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">
                  {paymentStep === 'confirm' ? 'Booked' : 'Session details'}
                </p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">
                  {selectedCoach?.full_name ? `Session with ${selectedCoach.full_name}` : 'Session'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeBookingModal}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-3 rounded-2xl border border-[#e5e5e5] bg-[#f5f5f5] p-4 text-xs text-[#4a4a4a]">
              <p>
                <span className="font-semibold text-[#191919]">Date:</span>{' '}
                {selectedSlotDetails?.date
                  ? selectedSlotDetails.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : bookingForm.date || 'Select a date'}
              </p>
              <p>
                <span className="font-semibold text-[#191919]">Time:</span>{' '}
                {selectedSlotDetails?.time ? formatTimeLabel(selectedSlotDetails.time) : formatTimeLabel(bookingForm.time)}
              </p>
              <p>
                <span className="font-semibold text-[#191919]">Duration:</span> {bookingForm.duration} min
              </p>
              <p>
                <span className="font-semibold text-[#191919]">Session type:</span>{' '}
                {formatSessionTypeLabel(selectedSlotDetails?.sessionType || availabilityFilters.sessionType || '1:1')}
              </p>
              <p>
                <span className="font-semibold text-[#191919]">Format:</span>{' '}
                {bookingForm.meetingMode === 'online' ? 'Online' : 'In-person'}
              </p>
              {bookingForm.meetingMode === 'online' ? (
                <p>
                  <span className="font-semibold text-[#191919]">Provider:</span>{' '}
                  {bookingForm.meetingProvider === 'google_meet'
                    ? 'Google Meet'
                    : bookingForm.meetingProvider === 'zoom'
                      ? 'Zoom'
                      : 'Custom link'}
                </p>
              ) : (
                <p>
                  <span className="font-semibold text-[#191919]">Location:</span>{' '}
                  {selectedSlotDetails?.location || bookingForm.location || 'Location TBD'}
                </p>
              )}
            </div>

            {paymentStep !== 'confirm' && (
              <>
                <div className="mt-4 space-y-3 rounded-2xl border border-[#e5e5e5] bg-white p-4 text-xs text-[#4a4a4a]">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Session format</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(['in_person', 'online'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          setBookingForm((prev) => ({
                            ...prev,
                            meetingMode: mode,
                            location: mode === 'in_person' ? (prev.location || defaultCoachLocation) : '',
                          }))
                        }
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          bookingForm.meetingMode === mode
                            ? 'border-[#191919] bg-[#f5f5f5] text-[#191919]'
                            : 'border-[#dcdcdc] text-[#191919]'
                        }`}
                      >
                        {mode === 'in_person' ? 'In-person' : 'Online'}
                      </button>
                    ))}
                  </div>
                  {bookingForm.meetingMode === 'online' && (
                    <>
                      <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Video provider</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setBookingForm((prev) => ({ ...prev, meetingProvider: 'google_meet' }))}
                          disabled={!googleConnected}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            bookingForm.meetingProvider === 'google_meet'
                              ? 'border-[#191919] bg-[#f5f5f5] text-[#191919]'
                              : 'border-[#dcdcdc] text-[#191919]'
                          } ${!googleConnected ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          Google Meet
                        </button>
                        <button
                          type="button"
                          onClick={() => setBookingForm((prev) => ({ ...prev, meetingProvider: 'zoom' }))}
                          disabled={!zoomConnected}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            bookingForm.meetingProvider === 'zoom'
                              ? 'border-[#191919] bg-[#f5f5f5] text-[#191919]'
                              : 'border-[#dcdcdc] text-[#191919]'
                          } ${!zoomConnected ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          Zoom
                        </button>
                        <button
                          type="button"
                          onClick={() => setBookingForm((prev) => ({ ...prev, meetingProvider: 'custom' }))}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            bookingForm.meetingProvider === 'custom'
                              ? 'border-[#191919] bg-[#f5f5f5] text-[#191919]'
                              : 'border-[#dcdcdc] text-[#191919]'
                          }`}
                        >
                          Custom link
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-[#4a4a4a]">
                        Coach must connect Google Meet or Zoom to enable those options.
                      </p>
                      {bookingForm.meetingProvider === 'custom' && (
                        <input
                          value={bookingForm.meetingLink}
                          onChange={handleBookingChange('meetingLink')}
                          placeholder="Paste a video link"
                          className="mt-3 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                        />
                      )}
                    </>
                  )}
                </div>
                <label className="mt-4 block space-y-2 text-xs text-[#4a4a4a]">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Notes</span>
                  <textarea
                    rows={3}
                    value={bookingForm.notes}
                    onChange={handleBookingChange('notes')}
                    placeholder="Share goals or prep notes."
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  />
                </label>
              </>
            )}

            {paymentStep === 'details' && (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4 text-xs text-[#4a4a4a]">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Payment</p>
                  {selectedSessionRateCents > 0 ? (
                    <p className="mt-2 text-sm text-[#191919]">
                      Session total: ${(selectedSessionRateCents / 100).toFixed(2)}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-[#191919]">No payment required for this session.</p>
                  )}
                </div>
                {paymentNotice && <p className="text-xs text-[#4a4a4a]">{paymentNotice}</p>}
                {needsGuardianApproval && (
                  <p className="text-xs text-[#b80f0a]">Guardian approval required to book sessions.</p>
                )}
                <button
                  type="button"
                  onClick={handlePayAndBook}
                  disabled={bookingLoading || !canTransact}
                  className="w-full rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:bg-[#b80f0a] disabled:text-white disabled:cursor-not-allowed"
                >
                  {bookingLoading
                    ? 'Processing...'
                    : selectedSessionRateCents > 0
                      ? 'Continue to payment'
                      : 'Book session'}
                </button>
              </div>
            )}

            {paymentStep === 'pay' && (
              <div className="mt-4 space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Secure payment</p>
                <p className="text-sm text-[#191919]">
                  Pay ${(bookingAmountCents / 100).toFixed(2)} to confirm this booking.
                </p>
                {paymentNotice && <p className="text-xs text-[#4a4a4a]">{paymentNotice}</p>}
                {!stripePromise && (
                  <p className="rounded-2xl border border-[#e5e5e5] bg-white p-3 text-xs text-[#b80f0a]">
                    Stripe publishable key is missing. Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
                  </p>
                )}
                {stripePromise && bookingClientSecret && (
                  <Elements stripe={stripePromise} options={{ clientSecret: bookingClientSecret }}>
                    <StripeCheckoutForm clientSecret={bookingClientSecret} onSuccess={handleStripeBookingSuccess} />
                  </Elements>
                )}
                <button
                  type="button"
                  onClick={() => setPaymentStep('details')}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  Back
                </button>
              </div>
            )}

            {paymentStep === 'confirm' && (
              <div className="mt-4 space-y-3 rounded-2xl border border-[#e5e5e5] bg-white p-4 text-sm text-[#191919]">
                <p className="text-lg font-semibold text-[#191919]">Session booked</p>
                <p className="text-sm text-[#4a4a4a]">Your session is confirmed and appears on your calendar.</p>
                {bookingNotice && <p className="text-xs text-[#4a4a4a]">{bookingNotice}</p>}
              </div>
            )}
          </div>
        </div>
      )}
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
