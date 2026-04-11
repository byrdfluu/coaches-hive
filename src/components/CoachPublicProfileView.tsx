'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import StripeCheckoutForm from '@/components/StripeCheckoutForm'
import { useAthleteProfile } from '@/components/AthleteProfileContext'
import { resolveSessionRateCents, type SessionRates } from '@/lib/sessionPricing'
import {
  guardianPendingMessage,
  isGuardianApprovalApiError,
  requestGuardianApproval,
} from '@/lib/guardianApprovalClient'

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

type CoachProfile = {
  id: string
  full_name: string | null
  bio?: string | null
  avatar_url?: string | null
  brand_logo_url?: string | null
  brand_cover_url?: string | null
  brand_primary_color?: string | null
  brand_accent_color?: string | null
  verification_status?: string | null
  coach_seasons?: string[] | null
  coach_grades?: string[] | null
  coach_cancel_window?: string | null
  coach_reschedule_window?: string | null
  coach_refund_policy?: string | null
  coach_messaging_hours?: string | null
  coach_auto_reply?: string | null
  coach_silence_outside_hours?: boolean | null
  integration_settings?: IntegrationSettings | null
  coach_profile_settings?: CoachProfileSettings | null
  coach_privacy_settings?: CoachPrivacySettings | null
}

type CoachReview = {
  id: string
  athlete_id?: string | null
  reviewer_name?: string | null
  rating?: number | null
  body?: string | null
  verified?: boolean | null
  coach_response?: string | null
  created_at?: string | null
}

type AvailabilityBlock = {
  id?: string
  day_of_week: number
  start_time: string
  end_time: string
  session_type?: string | null
  location?: string | null
  notes?: string | null
}

type ProductRow = {
  id: string
  title?: string | null
  name?: string | null
  type?: string | null
  category?: string | null
  price?: number | string | null
  price_cents?: number | null
  description?: string | null
  media_url?: string | null
  status?: string | null
}

type IntegrationSettings = {
  videoProvider: 'zoom' | 'google_meet' | 'custom'
  customVideoLink: string
  connections: {
    google: { connected: boolean }
    zoom: { connected: boolean }
  }
}

type CoachProfileMedia = {
  id: string
  url: string
  name: string
  type: string
  size: number
  uploaded_at: string
}

type CoachProfileSettings = {
  title: string
  location: string
  primarySport: string
  rates: {
    oneOnOne: string
    team: string
    group: string
    virtual: string
    assessment: string
  }
  certification: {
    name: string
    organization: string
    date: string
    fileUrl?: string
  }
  media: CoachProfileMedia[]
}

type BookingRequestPayload = {
  coach_id: string
  athlete_id: string
  sub_profile_id?: string | null
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
}

type CoachPrivacySettings = {
  visibleToAthletes: boolean
  allowDirectMessages: boolean
  showProgressSnapshots: boolean
  showRatings: boolean
  blockedAthletes: string
  regionVisibility: string
}

const defaultIntegrationSettings: IntegrationSettings = {
  videoProvider: 'zoom',
  customVideoLink: '',
  connections: {
    google: { connected: false },
    zoom: { connected: false },
  },
}

const defaultProfileSettings: CoachProfileSettings = {
  title: '',
  location: '',
  primarySport: '',
  rates: {
    oneOnOne: '',
    team: '',
    group: '',
    virtual: '',
    assessment: '',
  },
  certification: {
    name: '',
    organization: '',
    date: '',
  },
  media: [],
}

const defaultPrivacySettings: CoachPrivacySettings = {
  visibleToAthletes: true,
  allowDirectMessages: true,
  showProgressSnapshots: true,
  showRatings: true,
  blockedAthletes: '',
  regionVisibility: '',
}

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

const formatSessionTypeLabel = (value: string) => {
  if (value === '1:1') return '1:1'
  return value.charAt(0).toUpperCase() + value.slice(1)
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

const formatTimeLabel = (value?: string | null) => {
  if (!value) return 'TBD'
  const [hour, minute] = value.split(':').map((part) => Number(part))
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 'TBD'
  const date = new Date(2000, 0, 1, hour, minute)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return '$0'
  if (typeof value === 'string') return value.trim().startsWith('$') ? value : `$${value}`
  return `$${value.toFixed(2).replace(/\.00$/, '')}`
}

const formatBookingTypeLabel = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if (normalized === '1:1' || normalized === 'one-on-one') return '1:1 Private Training'
  if (normalized.includes('team')) return 'Team Session'
  if (normalized.includes('group')) return 'Group Session'
  if (normalized.includes('assessment')) return 'Assessment'
  if (normalized.includes('virtual')) return 'Virtual Call'
  return value
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

type CoachPublicProfileViewProps = {
  slug: string
  selfView?: boolean
}

export default function CoachPublicProfileView({ slug, selfView = false }: CoachPublicProfileViewProps) {
  const supabase = createClientComponentClient()
  const { activeSubProfileId } = useAthleteProfile()
  const [coach, setCoach] = useState<CoachProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState<CoachReview[]>([])
  const [reviewers, setReviewers] = useState<Record<string, string>>({})
  const [reviewAverage, setReviewAverage] = useState(0)
  const [trustMetrics, setTrustMetrics] = useState<{
    trustScore: number
    completionRate: number | null
    cancellationRate: number | null
    responseHours: number | null
  } | null>(null)
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityNotice, setAvailabilityNotice] = useState('')
  const [products, setProducts] = useState<ProductRow[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [viewerRole, setViewerRole] = useState<string | null>(null)
  const [viewerEmail, setViewerEmail] = useState<string | null>(null)
  const [monthCursor, setMonthCursor] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [bookingForm, setBookingForm] = useState({
    date: '',
    time: '',
    duration: '60',
    location: '',
    notes: '',
    meetingMode: 'in_person',
    meetingProvider: 'zoom',
    meetingLink: '',
  })
  const [commHours, setCommHours] = useState('')
  const [commAutoReply, setCommAutoReply] = useState('')
  const [commSilenceOutside, setCommSilenceOutside] = useState(false)
  const [bookingNotice, setBookingNotice] = useState('')
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookingStep, setBookingStep] = useState<'details' | 'pay'>('details')
  const [bookingClientSecret, setBookingClientSecret] = useState('')
  const [bookingAmountCents, setBookingAmountCents] = useState(0)
  const [pendingBookingPayload, setPendingBookingPayload] = useState<BookingRequestPayload | null>(null)
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>(defaultIntegrationSettings)
  const [profileSettings, setProfileSettings] = useState<CoachProfileSettings>(defaultProfileSettings)
  const [privacySettings, setPrivacySettings] = useState<CoachPrivacySettings>(defaultPrivacySettings)
  const [availabilityFilters, setAvailabilityFilters] = useState({
    sessionType: 'All',
    location: 'All',
  })
  const [selectedBookingType, setSelectedBookingType] = useState('1:1')
  const googleConnected = integrationSettings.connections.google.connected
  const zoomConnected = integrationSettings.connections.zoom.connected

  useEffect(() => {
    let active = true
    const loadCoach = async () => {
      setLoading(true)
      const response = await fetch(`/api/public/coaches?slug=${encodeURIComponent(slug)}`)
      const payload = response.ok ? await response.json().catch(() => null) : null
      if (!active) return
      const match = (payload?.coach || null) as CoachProfile | null
      setCoach(match || null)
      if (match?.coach_messaging_hours) {
        setCommHours(match.coach_messaging_hours)
      }
      if (match?.coach_auto_reply) {
        setCommAutoReply(match.coach_auto_reply)
      }
      if (match?.coach_silence_outside_hours !== null && match?.coach_silence_outside_hours !== undefined) {
        setCommSilenceOutside(Boolean(match.coach_silence_outside_hours))
      }
      if (match?.integration_settings && typeof match.integration_settings === 'object') {
        const raw = match.integration_settings as Partial<IntegrationSettings>
        setIntegrationSettings({
          videoProvider: raw.videoProvider || defaultIntegrationSettings.videoProvider,
          customVideoLink: raw.customVideoLink || defaultIntegrationSettings.customVideoLink,
          connections: {
            google: { connected: Boolean(raw.connections?.google?.connected) },
            zoom: { connected: Boolean(raw.connections?.zoom?.connected) },
          },
        })
        setBookingForm((prev) => ({
          ...prev,
          meetingProvider: raw.videoProvider || prev.meetingProvider,
          meetingLink: prev.meetingLink || raw.customVideoLink || '',
        }))
      }
      if (match?.coach_profile_settings && typeof match.coach_profile_settings === 'object') {
        const stored = match.coach_profile_settings as Partial<CoachProfileSettings>
        setProfileSettings({
          ...defaultProfileSettings,
          ...stored,
          rates: {
            ...defaultProfileSettings.rates,
            ...(stored.rates || {}),
          },
          certification: {
            ...defaultProfileSettings.certification,
            ...(stored.certification || {}),
          },
          media: Array.isArray(stored.media) ? (stored.media as CoachProfileMedia[]) : [],
        })
      }
      if (match?.coach_privacy_settings && typeof match.coach_privacy_settings === 'object') {
        const stored = match.coach_privacy_settings as Partial<CoachPrivacySettings>
        setPrivacySettings({
          ...defaultPrivacySettings,
          ...stored,
        })
      }
      setLoading(false)
    }
    loadCoach()
    return () => {
      active = false
    }
  }, [slug, supabase])

  useEffect(() => {
    if (!coach?.id) return
    let active = true
    const loadReviews = async () => {
      const { data } = await supabase
        .from('coach_reviews')
        .select('*')
        .eq('coach_id', coach.id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
      if (!active) return
      const rows = (data || []) as CoachReview[]
      setReviews(rows)
      if (rows.length) {
        const total = rows.reduce((sum, review) => sum + (review.rating || 0), 0)
        setReviewAverage(Math.round((total / rows.length) * 10) / 10)
      } else {
        setReviewAverage(0)
      }
      const athleteIds = Array.from(new Set(rows.map((row) => row.athlete_id).filter(Boolean))) as string[]
      if (athleteIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', athleteIds)
        const map: Record<string, string> = {}
        const athleteProfiles = (profiles || []) as Array<{ id: string; full_name: string | null }>
        athleteProfiles.forEach((profile) => {
          if (profile.full_name) {
            map[profile.id] = profile.full_name
          }
        })
        if (active) {
          setReviewers(map)
        }
      } else {
        setReviewers({})
      }
    }
    loadReviews()
    return () => {
      active = false
    }
  }, [coach?.id, supabase])

  useEffect(() => {
    let active = true
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (active) {
        setCurrentUserId(data.user?.id ?? null)
        setViewerRole((data.user?.user_metadata?.role as string) || null)
        setViewerEmail(data.user?.email ?? null)
      }
    }
    loadUser()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    if (!coach?.id) return
    let active = true
    const loadAvailability = async () => {
      setAvailabilityLoading(true)
      setAvailabilityNotice('')
      const response = await fetch(`/api/availability?coach_id=${coach.id}`)
      if (!response.ok) {
        if (active) {
          setAvailability([])
          setAvailabilityNotice('Sign in to view live availability.')
          setAvailabilityLoading(false)
        }
        return
      }
      const payload = await response.json().catch(() => ({ availability: [] }))
      if (!active) return
      setAvailability((payload.availability || []) as AvailabilityBlock[])
      setAvailabilityLoading(false)
    }
    loadAvailability()
    return () => {
      active = false
    }
  }, [coach?.id])

  useEffect(() => {
    if (!coach?.id) return
    let active = true
    const loadProducts = async () => {
      setProductsLoading(true)
      const { data } = await supabase
        .from('products')
        .select('id, title, name, type, category, price, price_cents, description, media_url, status')
        .eq('coach_id', coach.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
      if (!active) return
      setProducts((data || []) as ProductRow[])
      setProductsLoading(false)
    }
    loadProducts()
    return () => {
      active = false
    }
  }, [coach?.id, supabase])

  useEffect(() => {
    if (!coach?.id) return
    let active = true
    const loadTrust = async () => {
      const response = await fetch(`/api/coach/trust?coach_ids=${coach.id}`)
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      const entry = payload.trust?.[coach.id]
      setTrustMetrics(entry || null)
    }
    loadTrust()
    return () => {
      active = false
    }
  }, [coach?.id])

  const name = coach?.full_name || 'Coach'
  const logo = coach?.brand_logo_url || coach?.avatar_url || '/avatar-coach-placeholder.png'
  const accent = coach?.brand_accent_color || '#b80f0a'
  const primary = coach?.brand_primary_color || '#191919'
  const coverStyle = coach?.brand_cover_url
    ? { backgroundImage: `url(${coach.brand_cover_url})` }
    : { backgroundImage: `linear-gradient(120deg, ${primary}10 0%, ${accent}22 100%)` }
  const verified = String(coach?.verification_status || '').trim().toLowerCase() === 'approved'
  const coachSeasons: string[] = Array.isArray(coach?.coach_seasons) ? coach?.coach_seasons ?? [] : []
  const coachGrades: string[] = Array.isArray(coach?.coach_grades) ? coach?.coach_grades ?? [] : []
  const seasonsLabel = coachSeasons.length ? coachSeasons.join(', ') : ''
  const gradesLabel = coachGrades.length ? coachGrades.join(', ') : ''
  const policyCancelWindow = coach?.coach_cancel_window || '24 hours'
  const policyRescheduleWindow = coach?.coach_reschedule_window || 'Up to 24 hours'
  const policyRefundText = coach?.coach_refund_policy || ''
  const subtitleParts = [profileSettings.location, profileSettings.primarySport, profileSettings.title].filter(Boolean)
  const subtitle = subtitleParts.length ? subtitleParts.join(' · ') : 'Coach profile'
  const offerRows = [
    { label: '1:1 sessions', value: profileSettings.rates.oneOnOne, bookingType: '1:1', meetingMode: 'in_person' as const },
    { label: 'Team training', value: profileSettings.rates.team, bookingType: 'team', meetingMode: 'in_person' as const },
    { label: 'Group sessions', value: profileSettings.rates.group, bookingType: 'group', meetingMode: 'in_person' as const },
    { label: 'Virtual calls', value: profileSettings.rates.virtual, bookingType: 'virtual', meetingMode: 'online' as const },
    { label: 'Assessments', value: profileSettings.rates.assessment, bookingType: 'assessment', meetingMode: 'in_person' as const },
  ].filter((row) => row.value)
  const blockedEntries = useMemo(() => {
    return privacySettings.blockedAthletes
      .split(/[\n,]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  }, [privacySettings.blockedAthletes])
  const isBlocked = useMemo(() => {
    if (!currentUserId && !viewerEmail) return false
    const athleteId = currentUserId?.toLowerCase()
    const athleteEmail = viewerEmail?.toLowerCase()
    return (
      (athleteId ? blockedEntries.includes(athleteId) : false) ||
      (athleteEmail ? blockedEntries.includes(athleteEmail) : false)
    )
  }, [blockedEntries, currentUserId, viewerEmail])
  const viewerIsAthlete = viewerRole === 'athlete'
  const canViewProfile = privacySettings.visibleToAthletes || !viewerIsAthlete
  const canMessageCoach = !selfView && privacySettings.allowDirectMessages && !isBlocked
  const canBookCoach = !selfView && !isBlocked && canViewProfile
  const selectedSessionType = availabilityFilters.sessionType !== 'All'
    ? availabilityFilters.sessionType
    : (selectedBookingType || '1:1')
  const selectedSessionRateCents = useMemo(() => {
    return resolveSessionRateCents({
      rates: (profileSettings.rates || null) as SessionRates | null,
      sessionType: selectedSessionType,
      meetingMode: bookingForm.meetingMode,
    })
  }, [bookingForm.meetingMode, profileSettings.rates, selectedSessionType])
  const defaultInPersonLocation = useMemo(() => {
    const availabilityLocation = availability
      .map((block) => block.location?.trim() || '')
      .find(Boolean)
    if (availabilityLocation) return availabilityLocation
    const profileLocation = profileSettings.location?.trim()
    return profileLocation || ''
  }, [availability, profileSettings.location])

  const handleBookSession = useCallback(async () => {
    setBookingNotice('')
    if (!currentUserId) {
      setBookingNotice('Please sign in as an athlete to book.')
      return
    }
    if (!coach?.id) {
      setBookingNotice('Coach profile not available.')
      return
    }
    if (!canBookCoach) {
      setBookingNotice('Coach is not accepting bookings right now.')
      return
    }
    if (!bookingForm.date || !bookingForm.time) {
      setBookingNotice('Select a date and time to book.')
      return
    }
    if (bookingForm.meetingMode === 'online') {
      if (!bookingForm.meetingProvider) {
        setBookingNotice('Select a video provider for online sessions.')
        return
      }
      if (bookingForm.meetingProvider === 'custom' && !bookingForm.meetingLink.trim()) {
        setBookingNotice('Add a meeting link for online sessions.')
        return
      }
      if (bookingForm.meetingProvider === 'google_meet' && !googleConnected) {
        setBookingNotice('Coach has not connected Google Meet yet.')
        return
      }
      if (bookingForm.meetingProvider === 'zoom' && !zoomConnected) {
        setBookingNotice('Coach has not connected Zoom yet.')
        return
      }
    }
    const startTime = new Date(`${bookingForm.date}T${bookingForm.time}`)
    if (Number.isNaN(startTime.getTime())) {
      setBookingNotice('Enter a valid date and time.')
      return
    }

    const sessionType = selectedSessionType
    const sessionRateCents = selectedSessionRateCents
    const payload: BookingRequestPayload = {
      coach_id: coach.id,
      athlete_id: currentUserId,
      sub_profile_id: activeSubProfileId || null,
      start_time: startTime.toISOString(),
      duration_minutes: Number(bookingForm.duration),
      session_type: sessionType,
      status: 'Scheduled',
      location: bookingForm.meetingMode === 'online' && bookingForm.meetingProvider === 'custom'
        ? bookingForm.meetingLink
        : bookingForm.location,
      notes: bookingForm.notes,
      title: `Session with ${name}`,
      meeting_mode: bookingForm.meetingMode,
      meeting_provider: bookingForm.meetingMode === 'online' ? bookingForm.meetingProvider : null,
      meeting_link: bookingForm.meetingMode === 'online' ? bookingForm.meetingLink : null,
      price_cents: sessionRateCents,
      price: sessionRateCents / 100,
    }

    if (sessionRateCents <= 0) {
      setBookingLoading(true)
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        if (isGuardianApprovalApiError(data)) {
          if (coach?.id) {
            const approval = await requestGuardianApproval({
              target_type: 'coach',
              target_id: coach.id,
              target_label: name || 'this coach',
              scope: 'transactions',
            })
            setBookingNotice(
              approval.ok && approval.status !== 'approved'
                ? guardianPendingMessage
                : approval.error || data?.error || 'Guardian approval required to book sessions.',
            )
          } else {
            setBookingNotice(data?.error || 'Guardian approval required to book sessions.')
          }
          setBookingLoading(false)
          return
        }
        setBookingNotice(data?.error || 'Unable to book this session.')
        setBookingLoading(false)
        return
      }

      setBookingForm({
        date: '',
        time: '',
        duration: '60',
        location: defaultInPersonLocation,
        notes: '',
        meetingMode: 'in_person',
        meetingProvider: integrationSettings.videoProvider || 'zoom',
        meetingLink: integrationSettings.customVideoLink || '',
      })
      setBookingNotice('Session booked. It will appear on both calendars.')
      setBookingLoading(false)
      setBookingStep('details')
      setBookingClientSecret('')
      setBookingAmountCents(0)
      setPendingBookingPayload(null)
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
          coachId: coach.id,
          athleteId: currentUserId,
          sessionType,
        },
      }),
    })
    const intentPayload = await intentResponse.json().catch(() => null)
    if (!intentResponse.ok || !intentPayload?.clientSecret) {
      if (isGuardianApprovalApiError(intentPayload)) {
        if (coach?.id) {
          const approval = await requestGuardianApproval({
            target_type: 'coach',
            target_id: coach.id,
            target_label: name || 'this coach',
            scope: 'transactions',
          })
          setBookingNotice(
            approval.ok && approval.status !== 'approved'
              ? guardianPendingMessage
              : approval.error || intentPayload?.error || 'Guardian approval required to book sessions.',
          )
        } else {
          setBookingNotice(intentPayload?.error || 'Guardian approval required to book sessions.')
        }
        setBookingLoading(false)
        return
      }
      setBookingNotice(intentPayload?.error || 'Unable to initialize payment.')
      setBookingLoading(false)
      return
    }

    setPendingBookingPayload(payload)
    setBookingAmountCents(sessionRateCents)
    setBookingClientSecret(intentPayload.clientSecret)
    setBookingStep('pay')
    setBookingNotice('Complete payment to confirm this booking.')
    setBookingLoading(false)
  }, [
    activeSubProfileId,
    bookingForm,
    canBookCoach,
    coach?.id,
    currentUserId,
    defaultInPersonLocation,
    googleConnected,
    integrationSettings,
    name,
    selectedSessionRateCents,
    selectedSessionType,
    zoomConnected,
  ])

  const handleOfferSelect = useCallback((params: { bookingType: string; meetingMode: 'in_person' | 'online' }) => {
    const availableTypes = Array.from(new Set(
      availability
        .map((block) => block.session_type)
        .filter((value): value is string => Boolean(value))
    ))
    const matchedAvailabilityType =
      availableTypes.find((type) => type.toLowerCase() === params.bookingType.toLowerCase())
      || availableTypes.find((type) => {
        const normalized = type.toLowerCase()
        if (params.bookingType === '1:1') return normalized === '1:1' || normalized.includes('private')
        if (params.bookingType === 'team') return normalized.includes('team')
        if (params.bookingType === 'group') return normalized.includes('group')
        if (params.bookingType === 'assessment') return normalized.includes('assessment')
        return false
      })
      || 'All'

    setSelectedBookingType(params.bookingType)
    setAvailabilityFilters((prev) => ({
      ...prev,
      sessionType: matchedAvailabilityType,
    }))
    setBookingForm((prev) => ({
      ...prev,
      meetingMode: params.meetingMode,
      meetingProvider: params.meetingMode === 'online' ? (integrationSettings.videoProvider || prev.meetingProvider) : prev.meetingProvider,
      meetingLink:
        params.meetingMode === 'online'
          ? (integrationSettings.customVideoLink || prev.meetingLink)
          : '',
      location: params.meetingMode === 'in_person' ? (prev.location || defaultInPersonLocation) : '',
    }))
    setBookingStep('details')
    setBookingClientSecret('')
    setBookingAmountCents(0)
    setPendingBookingPayload(null)
    setBookingNotice(`Selected ${formatBookingTypeLabel(params.bookingType)}. Pick a date and time below.`)
    if (typeof document !== 'undefined') {
      document.getElementById('book-session')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [availability, defaultInPersonLocation, integrationSettings.customVideoLink, integrationSettings.videoProvider])

  const handleStripeBookingSuccess = useCallback(async (paymentIntentId: string) => {
    if (!pendingBookingPayload) {
      setBookingNotice('Booking details are missing. Please try again.')
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

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      if (isGuardianApprovalApiError(data)) {
        if (coach?.id) {
          const approval = await requestGuardianApproval({
            target_type: 'coach',
            target_id: coach.id,
            target_label: name || 'this coach',
            scope: 'transactions',
          })
          setBookingNotice(
            approval.ok && approval.status !== 'approved'
              ? guardianPendingMessage
              : approval.error || data?.error || 'Guardian approval required to book sessions.',
          )
        } else {
          setBookingNotice(data?.error || 'Guardian approval required to book sessions.')
        }
        setBookingLoading(false)
        return
      }
      setBookingNotice(data?.error || 'Unable to finalize booking after payment.')
      setBookingLoading(false)
      return
    }

    setBookingForm({
      date: '',
      time: '',
      duration: '60',
      location: defaultInPersonLocation,
      notes: '',
      meetingMode: 'in_person',
      meetingProvider: integrationSettings.videoProvider || 'zoom',
      meetingLink: integrationSettings.customVideoLink || '',
    })
    setBookingNotice('Session booked. It will appear on both calendars.')
    setBookingLoading(false)
    setBookingStep('details')
    setBookingClientSecret('')
    setBookingAmountCents(0)
    setPendingBookingPayload(null)
  }, [coach?.id, defaultInPersonLocation, integrationSettings, name, pendingBookingPayload])

  const tags = useMemo(() => {
    const base = ['Speed & agility', 'Strength training', 'Return-to-play']
    if (profileSettings.primarySport) {
      base.unshift(profileSettings.primarySport)
    }
    return Array.from(new Set(base))
  }, [profileSettings.primarySport])
  const hasProducts = products.length > 0
  const monthName = monthCursor.toLocaleString('en-US', { month: 'long' })
  const monthYear = String(monthCursor.getFullYear())
  const monthDays = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate()
  const startOffset = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1).getDay()
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

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
    if (!defaultInPersonLocation) return
    setBookingForm((prev) => {
      if (prev.meetingMode !== 'in_person' || prev.location.trim()) return prev
      return { ...prev, location: defaultInPersonLocation }
    })
  }, [defaultInPersonLocation])

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

  const selectedDate = useMemo(() => {
    if (selectedDay === null) return null
    return new Date(monthCursor.getFullYear(), monthCursor.getMonth(), selectedDay)
  }, [selectedDay, monthCursor])

  const selectedDayAvailability = useMemo(() => {
    if (!selectedDate) return []
    const dayOfWeek = selectedDate.getDay()
    return availabilityByDay[dayOfWeek] || []
  }, [availabilityByDay, selectedDate])

  const slotDuration = Number(bookingForm.duration) || 60

  const availableSlots = useMemo(() => {
    if (!selectedDate) return []
    const filteredBlocks = selectedDayAvailability.filter((block) => {
      const typeLabel = block.session_type || 'General'
      const locationLabel = block.location?.trim() || 'Location TBD'
      const matchesType = availabilityFilters.sessionType === 'All' || availabilityFilters.sessionType === typeLabel
      const matchesLocation = availabilityFilters.location === 'All' || availabilityFilters.location === locationLabel
      return matchesType && matchesLocation
    })
    return buildSlotTimes(filteredBlocks, slotDuration)
  }, [selectedDate, selectedDayAvailability, slotDuration, availabilityFilters])

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
  }, [availabilityByDay, slotDuration, availabilityFilters])

  const nextAvailableLabel = useMemo(() => {
    if (!nextAvailableSlot) return ''
    return `${nextAvailableSlot.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${formatTimeLabel(
      nextAvailableSlot.slot.time
    )}`
  }, [nextAvailableSlot])

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

  if (!loading && coach && viewerIsAthlete && (!canViewProfile || isBlocked)) {
    return (
      <main className="page-shell">
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-16">
          <section className="glass-card border border-[#191919] bg-white p-8 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coach profile</p>
            <h1 className="mt-3 text-2xl font-semibold text-[#191919]">Profile unavailable</h1>
            <p className="mt-3 text-sm text-[#4a4a4a]">
              {isBlocked
                ? 'This coach is not accepting requests from this athlete.'
                : 'This coach is not visible to athletes right now.'}
            </p>
            <Link href="/athlete/discover" className="mt-4 inline-flex rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]">
              Back to discover
            </Link>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="glass-card border border-[#191919] bg-white p-0 overflow-hidden">
          <div className="h-48 w-full bg-cover bg-center" style={coverStyle} />
          <div className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div
                  className="h-16 w-16 rounded-full border border-[#191919] bg-white bg-cover bg-center"
                  style={{ backgroundImage: `url(${logo})` }}
                />
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coach profile</p>
                  <h1 className="text-3xl font-semibold text-[#191919]">{name}</h1>
                  <p className="text-sm text-[#4a4a4a]">{subtitle}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {canMessageCoach ? (
                  <Link
                    href={
                      activeSubProfileId
                        ? `/athlete/messages?new=${slug}&sub_profile_id=${encodeURIComponent(activeSubProfileId)}`
                        : `/athlete/messages?new=${slug}`
                    }
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    Message coach
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-full border border-[#dcdcdc] px-4 py-2 text-sm font-semibold text-[#9a9a9a]"
                  >
                    Messaging unavailable
                  </button>
                )}
                {canBookCoach ? (
                  <Link
                    href={
                      activeSubProfileId
                        ? `/athlete/calendar?sub_profile_id=${encodeURIComponent(activeSubProfileId)}`
                        : '/athlete/calendar'
                    }
                    className="rounded-full px-4 py-2 text-sm font-semibold text-white"
                    style={{ backgroundColor: accent }}
                  >
                    Book a session
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-full bg-[#dcdcdc] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Booking unavailable
                  </button>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              {tags.map((tag) => (
                <span key={tag} className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                  {tag}
                </span>
              ))}
              {seasonsLabel && (
                <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                  Seasons: {seasonsLabel}
                </span>
              )}
              {gradesLabel && (
                <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                  Grades: {gradesLabel}
                </span>
              )}
              {verified && (
                <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">Verified</span>
              )}
            </div>
          </div>
        </section>
        <section className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="glass-card border border-[#191919] bg-white p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">About</p>
            <p className="mt-3 text-sm text-[#4a4a4a]">
              {loading ? 'Loading profile details...' : coach?.bio || 'Focused on building speed, strength, and confidence with clear progress metrics.'}
            </p>
          </div>
          <div className="glass-card border border-[#191919] bg-white p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Offers</p>
            <ul className="mt-3 space-y-2 text-sm text-[#191919]">
              {offerRows.length > 0 ? (
                offerRows.map((row) => (
                  <li key={row.label}>
                    <button
                      type="button"
                      onClick={() => handleOfferSelect({ bookingType: row.bookingType, meetingMode: row.meetingMode })}
                      className="inline-flex w-full items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-left font-semibold text-[#191919] transition hover:border-[#191919] hover:bg-[#f7f6f4]"
                    >
                      <span>{row.label}</span>
                      <span>{formatCurrency(row.value)}</span>
                    </button>
                  </li>
                ))
              ) : (
                <>
                  <li>• 1:1 sessions · $90</li>
                  <li>• Team training · $250</li>
                  <li>• Digital programs · $45</li>
                </>
              )}
            </ul>
          </div>
          {privacySettings.showRatings ? (
            <div className="glass-card border border-[#191919] bg-white p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Trust snapshot</p>
              <div className="mt-3 space-y-2 text-sm text-[#191919]">
                <p>Rating: {reviewAverage ? reviewAverage.toFixed(1) : 'New'}</p>
                {trustMetrics?.trustScore !== undefined ? <p>Trust score: {trustMetrics.trustScore}</p> : null}
                {trustMetrics?.completionRate !== null && trustMetrics?.completionRate !== undefined ? (
                  <p>Completion: {(trustMetrics.completionRate * 100).toFixed(0)}%</p>
                ) : null}
                {trustMetrics?.responseHours !== null && trustMetrics?.responseHours !== undefined ? (
                  <p>Avg response: {trustMetrics.responseHours}h</p>
                ) : null}
                {trustMetrics?.cancellationRate !== null && trustMetrics?.cancellationRate !== undefined ? (
                  <p>Cancellations: {(trustMetrics.cancellationRate * 100).toFixed(0)}%</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="glass-card border border-[#191919] bg-white p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Trust snapshot</p>
              <p className="mt-3 text-sm text-[#4a4a4a]">Ratings are hidden for this coach.</p>
            </div>
          )}
        </section>

        <section className="mt-6 glass-card border border-[#191919] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Session policies</p>
              <p className="mt-2 text-lg font-semibold text-[#191919]">Cancellation & refund rules</p>
              <p className="mt-1 text-sm text-[#4a4a4a]">These policies apply when booking sessions with {name}.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
              <p className="text-xs font-semibold text-[#4a4a4a]">Cancellation window</p>
              <p className="mt-2 font-semibold text-[#191919]">{policyCancelWindow}</p>
            </div>
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
              <p className="text-xs font-semibold text-[#4a4a4a]">Reschedule window</p>
              <p className="mt-2 font-semibold text-[#191919]">{policyRescheduleWindow}</p>
            </div>
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
              <p className="text-xs font-semibold text-[#4a4a4a]">Refund policy</p>
              <p className="mt-2 text-sm text-[#191919]">
                {policyRefundText || 'Refunds follow the cancellation and reschedule windows above.'}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 glass-card border border-[#191919] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Communication</p>
              <p className="mt-2 text-lg font-semibold text-[#191919]">How this coach communicates</p>
              <p className="mt-1 text-sm text-[#4a4a4a]">Use these details to expect response time and availability.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
              <p className="text-xs font-semibold text-[#4a4a4a]">Messaging hours</p>
              <p className="mt-2 font-semibold text-[#191919]">{commHours || 'Not set'}</p>
            </div>
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
              <p className="text-xs font-semibold text-[#4a4a4a]">Auto-reply</p>
              <p className="mt-2 text-sm text-[#191919]">{commAutoReply || 'Not set'}</p>
            </div>
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
              <p className="text-xs font-semibold text-[#4a4a4a]">Preferences</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-[#191919] px-2 py-1 font-semibold text-[#191919]">
                  Silence after hours {commSilenceOutside ? 'on' : 'off'}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="book-session" className="mt-8 glass-card border border-[#191919] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Marketplace</p>
              <p className="mt-2 text-lg font-semibold text-[#191919]">Coach offerings</p>
              <p className="mt-1 text-sm text-[#4a4a4a]">Programs, bundles, and products from this coach.</p>
            </div>
            <Link
              href="/athlete/marketplace"
              className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              View marketplace
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
            {productsLoading ? (
              <div className="md:col-span-3">
                <LoadingState label="Loading offerings..." />
              </div>
            ) : !hasProducts ? (
              <div className="md:col-span-3">
                <EmptyState title="No listings yet." description="Coach products will appear here once published." />
              </div>
            ) : (
              products.map((product) => {
                const title = product.title || product.name || 'Product'
                const type = product.type || product.category || 'Offer'
                const price = product.price_cents ? formatCurrency(product.price_cents / 100) : formatCurrency(product.price)
                const isSession = type.toLowerCase().includes('session')
                return (
                  <div key={product.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                    {product.media_url ? (
                      <Image
                        src={product.media_url}
                        alt={title}
                        width={320}
                        height={96}
                        className="mb-3 h-24 w-full rounded-xl object-cover"
                      />
                    ) : (
                      <div className="mb-3 h-24 w-full rounded-xl border border-dashed border-[#dcdcdc] bg-white" />
                    )}
                    <p className="text-xs font-semibold text-[#4a4a4a]">{type}</p>
                    <p className="font-semibold text-[#191919]">{title}</p>
                    {product.description ? (
                      <p className="mt-1 text-xs text-[#4a4a4a]">
                        {product.description.length > 90 ? `${product.description.slice(0, 90)}...` : product.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-lg font-semibold text-[#191919]">{price}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Link
                        href={`/athlete/marketplace/product/${product.id}`}
                        className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        View details
                      </Link>
                      <Link
                        href={isSession ? '/athlete/calendar' : `/athlete/marketplace/checkout/${product.id}`}
                        className="rounded-full bg-[#b80f0a] px-3 py-1 font-semibold text-white hover:opacity-90 transition-opacity"
                      >
                        {isSession ? 'Book session' : 'Checkout'}
                      </Link>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        <section className="mt-8 glass-card border border-[#191919] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Schedule</p>
              <p className="mt-2 text-lg font-semibold text-[#191919]">Pick a date and time</p>
              <p className="text-sm text-[#4a4a4a]">Tap a day to view open times for {name}.</p>
            </div>
            <Link href="/athlete/calendar" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]">
              Open calendar
            </Link>
          </div>

          {!availabilityLoading && availability.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-8 text-center text-sm">
              <p className="font-semibold text-[#191919]">Calendar not open yet</p>
              <p className="mt-1 text-[#4a4a4a]">This coach hasn&apos;t published their availability yet — check back soon or send a message to connect.</p>
              <Link href="/athlete/messages" className="mt-3 inline-flex rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]">Send a message</Link>
            </div>
          ) : (
            <>
              <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#191919]">
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
            </div>
            <div className="mt-3 grid grid-cols-7 gap-2 text-[11px] text-[#4a4a4a]">
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
                const dayAvailability = availabilityByDay[new Date(monthCursor.getFullYear(), monthCursor.getMonth(), dayNumber).getDay()] || []
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
                      {dayAvailability.length > 0 && <span className="h-2 w-2 rounded-full bg-[#191919]" />}
                    </div>
                    <p className="mt-2 text-[10px] text-[#9a9a9a]">
                      {dayAvailability.length ? `${dayAvailability.length} open` : '—'}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <p className="mt-3 text-xs text-[#4a4a4a]">Timezone: {localTimezone}</p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
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
              <div className="mt-3 text-xs text-[#4a4a4a]">
                {nextAvailableSlot ? (
                  <button
                    type="button"
                    onClick={() => selectDate(nextAvailableSlot.date)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 font-semibold text-[#191919]"
                  >
                    Next available: {nextAvailableLabel}
                  </button>
                ) : (
                  <span>{availabilityNotice || 'Select a day to view times.'}</span>
                )}
              </div>
              {availabilityLoading ? (
                <p className="mt-3 text-xs text-[#9a9a9a]">Loading availability...</p>
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
                              onClick={() => {
                                if (!selectedDate) return
                                const dateValue = selectedDate.toLocaleDateString('en-CA')
                                setBookingForm((prev) => ({
                                  ...prev,
                                  date: dateValue,
                                  time: slot.time,
                                  location: slot.block.location?.trim() || defaultInPersonLocation || prev.location,
                                }))
                                setBookingNotice('Prefilled booking with selected slot.')
                                setBookingStep('details')
                                setBookingClientSecret('')
                                setBookingAmountCents(0)
                                setPendingBookingPayload(null)
                              }}
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
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Request details</p>
              <div className="mt-3 space-y-3 text-sm text-[#191919]">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2 text-xs">
                  <p className="font-semibold text-[#191919]">{formatBookingTypeLabel(selectedSessionType)}</p>
                  <p className="text-[#4a4a4a]">with {name}</p>
                  <p className="mt-1 text-[#4a4a4a]">
                    {bookingForm.date && bookingForm.time
                      ? `${bookingForm.date} · ${formatTimeLabel(bookingForm.time)}`
                      : 'Select a date and time'}
                  </p>
                </div>
                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-[#4a4a4a]">Duration</span>
                  <select
                    value={bookingForm.duration}
                    onChange={(event) => setBookingForm((prev) => ({ ...prev, duration: event.target.value }))}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                  >
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                    <option value="90">90 min</option>
                  </select>
                </label>
                <div className="space-y-1 text-xs">
                  <span className="font-semibold text-[#4a4a4a]">Session format</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(['in_person', 'online'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          setBookingForm((prev) => ({
                            ...prev,
                            meetingMode: mode,
                            location: mode === 'in_person' ? (prev.location || defaultInPersonLocation) : '',
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
                </div>
                {bookingForm.meetingMode === 'online' && (
                  <div className="space-y-1 text-xs">
                    <span className="font-semibold text-[#4a4a4a]">Video provider</span>
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
                  </div>
                )}
                {bookingForm.meetingMode === 'online' && bookingForm.meetingProvider === 'custom' && (
                  <label className="space-y-1 text-xs">
                    <span className="font-semibold text-[#4a4a4a]">Meeting link</span>
                    <input
                      value={bookingForm.meetingLink}
                      onChange={(event) => setBookingForm((prev) => ({ ...prev, meetingLink: event.target.value }))}
                      placeholder="Paste a video link"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                    />
                  </label>
                )}
                {bookingForm.meetingMode === 'in_person' && (
                  <label className="space-y-1 text-xs">
                    <span className="font-semibold text-[#4a4a4a]">Location</span>
                    <input
                      value={bookingForm.location}
                      onChange={(event) => setBookingForm((prev) => ({ ...prev, location: event.target.value }))}
                      placeholder="Facility or address"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                    />
                  </label>
                )}
                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-[#4a4a4a]">Notes</span>
                  <textarea
                    rows={3}
                    value={bookingForm.notes}
                    onChange={(event) => setBookingForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Share goals or prep notes."
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                  />
                </label>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2 text-xs text-[#4a4a4a]">
                  {selectedSessionRateCents > 0
                    ? `Session total: $${(selectedSessionRateCents / 100).toFixed(2)}`
                    : 'No payment required for this session.'}
                </div>
                {bookingNotice && <p className="text-xs text-[#4a4a4a]">{bookingNotice}</p>}
                {bookingStep === 'details' && (
                  <button
                    type="button"
                    onClick={handleBookSession}
                    disabled={bookingLoading || !canBookCoach}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {bookingLoading
                      ? 'Booking...'
                      : canBookCoach
                        ? selectedSessionRateCents > 0
                          ? 'Continue to payment'
                          : 'Book session'
                        : 'Booking unavailable'}
                  </button>
                )}
                {bookingStep === 'pay' && (
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Secure payment</p>
                    <p className="text-xs text-[#191919]">Pay ${(bookingAmountCents / 100).toFixed(2)} to confirm this session.</p>
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
                      onClick={() => {
                        setBookingStep('details')
                        setBookingClientSecret('')
                        setBookingAmountCents(0)
                        setPendingBookingPayload(null)
                        setBookingNotice('')
                      }}
                      className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                    >
                      Back to details
                    </button>
                  </div>
                )}
              </div>
            </div>
              </div>
            </>
          )}
        </section>

        {privacySettings.showRatings ? (
          <section className="mt-8 glass-card border border-[#191919] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Reviews</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">What athletes are saying</p>
              </div>
              <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                {reviewAverage ? `${reviewAverage}★ average` : 'No ratings yet'}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm">
              {reviews.length === 0 ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-xs text-[#4a4a4a]">
                  Reviews will appear here after athletes share feedback.
                </div>
              ) : (
                reviews.slice(0, 4).map((review) => {
                  const name = review.reviewer_name || (review.athlete_id ? reviewers[review.athlete_id] : null) || 'Athlete'
                  const time = review.created_at
                    ? new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : ''
                  return (
                    <div key={review.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[#191919]">{name}</p>
                        <div className="flex items-center gap-2 text-xs text-[#4a4a4a]">
                          {review.verified ? (
                            <span className="rounded-full border border-[#191919] px-2 py-0.5 font-semibold text-[#191919]">
                              Verified
                            </span>
                          ) : null}
                          <span>{time}</span>
                        </div>
                      </div>
                      <p className="text-xs text-[#4a4a4a]">Rating: {review.rating || 0}/5</p>
                      <p className="text-[#191919]">{review.body}</p>
                      {review.coach_response ? (
                        <div className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#4a4a4a]">
                          <p className="font-semibold text-[#191919]">Coach response</p>
                          <p className="mt-1">{review.coach_response}</p>
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          </section>
        ) : null}

      </div>
    </main>
  )
}
