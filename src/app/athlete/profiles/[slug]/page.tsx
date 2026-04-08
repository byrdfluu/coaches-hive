'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import Image from 'next/image'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { ChangeEvent } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import StripeCheckoutForm from '@/components/StripeCheckoutForm'
import Toast from '@/components/Toast'
import { useAthleteAccess } from '@/components/AthleteAccessProvider'
import { addDays, formatWeekLabel, getWeekStart } from '@/lib/dateUtils'
import { resolveSessionRateCents, type SessionRates } from '@/lib/sessionPricing'
import {
  guardianPendingMessage,
  isGuardianApprovalApiError,
  requestGuardianApproval,
} from '@/lib/guardianApprovalClient'

const profiles = {
  'maya-lopez': {
    name: 'Athlete profile',
    subtitle: 'Athlete details',
    focus: ['Focus: Not set', 'Preferred: Not set'],
    about:
      'Profile details appear here once athlete data is connected.',
    team: 'Not set',
    coach: '',
    format: 'Not set',
  },
  'carter-lopez': {
    name: 'Linked athlete',
    subtitle: 'Athlete details',
    focus: ['Focus: Not set', 'Preferred: Not set'],
    about:
      'Profile details appear here once athlete data is connected.',
    team: 'Not set',
    coach: '',
    format: 'Not set',
  },
}


type ProfileKey = keyof typeof profiles

type AthleteMetric = {
  id: string
  athlete_id: string
  label: string
  value: string
  unit?: string | null
  sort_order?: number | null
}

type AthleteResult = {
  id: string
  athlete_id: string
  title: string
  event_date?: string | null
  placement?: string | null
  detail?: string | null
}

type AthleteMedia = {
  id: string
  athlete_id: string
  title?: string | null
  media_url: string
  media_type?: string | null
}

type VisibilityRow = {
  section: string
  visibility: string
}

type IntegrationSettings = {
  videoProvider: 'zoom' | 'google_meet' | 'custom'
  customVideoLink: string
  connections: {
    google: { connected: boolean }
    zoom: { connected: boolean }
  }
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
}

const defaultIntegrationSettings: IntegrationSettings = {
  videoProvider: 'zoom',
  customVideoLink: '',
  connections: {
    google: { connected: false },
    zoom: { connected: false },
  },
}

const formatAccountOwnerLabel = (value?: string | null) => {
  if (value === 'athlete_minor') return 'Athlete under 18'
  if (value === 'guardian') return 'Guardian-managed'
  return 'Athlete 18+'
}

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

export default function AthleteProfileDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const athleteId = searchParams.get('id')
  const subProfileId = searchParams.get('sub_profile_id')
  const profile = profiles[slug as ProfileKey] || profiles['maya-lopez']
  const [profileName, setProfileName] = useState(profile.name)
  const displayName = profileName || profile.name
  const displaySport = searchParams.get('sport')
  const displaySubtitle = displaySport ? `${profile.subtitle} · ${displaySport}` : profile.subtitle
  const [today, setToday] = useState<Date | null>(null)
  const weekStart = useMemo(() => (today ? getWeekStart(today) : null), [today])
  const previousWeek = useMemo(() => (weekStart ? addDays(weekStart, -7) : null), [weekStart])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string>(() =>
    typeof window !== 'undefined'
      ? (window.localStorage.getItem('ch_avatar_url') || '/avatar-athlete-placeholder.png')
      : '/avatar-athlete-placeholder.png'
  )
  const [avatarUploading, setAvatarUploading] = useState(false)
  const showUploadHint = avatarUrl.includes('placeholder')
  const [bookingNotice, setBookingNotice] = useState('')
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookingStep, setBookingStep] = useState<'details' | 'pay'>('details')
  const [bookingClientSecret, setBookingClientSecret] = useState('')
  const [bookingAmountCents, setBookingAmountCents] = useState(0)
  const [pendingBookingPayload, setPendingBookingPayload] = useState<BookingRequestPayload | null>(null)
  const [coachSessionRates, setCoachSessionRates] = useState<SessionRates | null>(null)
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
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>(defaultIntegrationSettings)
  const [metrics, setMetrics] = useState<AthleteMetric[]>([])
  const { canTransact, needsGuardianApproval } = useAthleteAccess()
  const [results, setResults] = useState<AthleteResult[]>([])
  const [media, setMedia] = useState<AthleteMedia[]>([])
  const [visibilityRows, setVisibilityRows] = useState<VisibilityRow[]>([])
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [savedNotes, setSavedNotes] = useState<Array<{ id: string; note: string; created_at: string }>>([])
  const [showAddMetric, setShowAddMetric] = useState(false)
  const [newMetricLabel, setNewMetricLabel] = useState('')
  const [newMetricValue, setNewMetricValue] = useState('')
  const [newMetricUnit, setNewMetricUnit] = useState('')
  const [addMetricLoading, setAddMetricLoading] = useState(false)
  const [showAddResult, setShowAddResult] = useState(false)
  const [newResultTitle, setNewResultTitle] = useState('')
  const [newResultDate, setNewResultDate] = useState('')
  const [newResultPlacement, setNewResultPlacement] = useState('')
  const [newResultDetail, setNewResultDetail] = useState('')
  const [addResultLoading, setAddResultLoading] = useState(false)
  const [showAddMedia, setShowAddMedia] = useState(false)
  const [newMediaUrl, setNewMediaUrl] = useState('')
  const [newMediaTitle, setNewMediaTitle] = useState('')
  const [addMediaLoading, setAddMediaLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [athleteSeason, setAthleteSeason] = useState<string | null>(null)
  const [athleteGradeLevel, setAthleteGradeLevel] = useState<string | null>(null)
  const [athleteBirthdate, setAthleteBirthdate] = useState<string | null>(null)
  const [bio, setBio] = useState<string | null>(null)
  const [guardianName, setGuardianName] = useState<string | null>(null)
  const [guardianEmail, setGuardianEmail] = useState<string | null>(null)
  const [guardianPhone, setGuardianPhone] = useState<string | null>(null)
  const [accountOwnerType, setAccountOwnerType] = useState<string | null>(null)
  const googleConnected = integrationSettings.connections.google.connected
  const zoomConnected = integrationSettings.connections.zoom.connected

  useEffect(() => {
    setToday(new Date())
  }, [])

  useEffect(() => {
    let mounted = true
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (mounted) {
        setCurrentUserId(data.user?.id ?? null)
      }
    }
    loadUser()
    return () => {
      mounted = false
    }
  }, [supabase])

  useEffect(() => {
    let mounted = true
    const loadAvatar = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', data.user.id)
        .maybeSingle()
      const avatarProfile = (profileRow || null) as { avatar_url?: string | null } | null
      if (mounted && avatarProfile?.avatar_url) {
        setAvatarUrl(avatarProfile.avatar_url)
        window.localStorage.setItem('ch_avatar_url', avatarProfile.avatar_url)
      }
    }
    const onAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as { url?: string } | undefined
      if (detail?.url) {
        setAvatarUrl(detail.url)
      }
    }
    loadAvatar()
    window.addEventListener('ch:avatar-updated', onAvatarUpdated)
    return () => {
      mounted = false
      window.removeEventListener('ch:avatar-updated', onAvatarUpdated)
    }
  }, [supabase])

  useEffect(() => {
    let mounted = true
    const resolveProfileName = async () => {
      const queryName = searchParams.get('name') || ''
      if (!athleteId) {
        if (queryName) {
          setProfileName(queryName)
        }
        return
      }

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name, athlete_season, athlete_grade_level, athlete_birthdate, bio, guardian_name, guardian_email, guardian_phone, account_owner_type')
        .eq('id', athleteId)
        .maybeSingle()
      const athleteProfileRow = (profileRow || null) as {
        full_name?: string | null
        athlete_season?: string | null
        athlete_grade_level?: string | null
        athlete_birthdate?: string | null
        bio?: string | null
        guardian_name?: string | null
        guardian_email?: string | null
        guardian_phone?: string | null
        account_owner_type?: string | null
      } | null

      if (!mounted) return

      setAthleteSeason(athleteProfileRow?.athlete_season || null)
      setAthleteGradeLevel(athleteProfileRow?.athlete_grade_level || null)
      setAthleteBirthdate(athleteProfileRow?.athlete_birthdate || null)
      setBio(athleteProfileRow?.bio || null)
      setGuardianName(athleteProfileRow?.guardian_name || null)
      setGuardianEmail(athleteProfileRow?.guardian_email || null)
      setGuardianPhone(athleteProfileRow?.guardian_phone || null)
      setAccountOwnerType(athleteProfileRow?.account_owner_type || null)

      if (athleteProfileRow?.full_name) {
        setProfileName(athleteProfileRow.full_name)
        return
      }

      if (queryName) {
        setProfileName(queryName)
      }
    }

    resolveProfileName()

    return () => {
      mounted = false
    }
  }, [athleteId, searchParams, supabase])

  useEffect(() => {
    let active = true
    const loadCoach = async () => {
      if (!profile.coach) return
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, integration_settings, coach_profile_settings')
        .eq('role', 'coach')
        .ilike('full_name', `%${profile.coach}%`)
        .limit(1)
      if (active) {
        const match = ((data || [])[0] || null) as {
          id?: string | null
          full_name?: string | null
          integration_settings?: unknown
          coach_profile_settings?: unknown
        } | null
        setCoachId(match?.id ?? null)
        const rates = (match?.coach_profile_settings as { rates?: SessionRates } | null)?.rates
        setCoachSessionRates(rates || null)
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
      }
    }
    loadCoach()
    return () => {
      active = false
    }
  }, [profile.coach, supabase])

  useEffect(() => {
    if (!athleteId) return
    let active = true
    const loadProfileData = async () => {
      const metricsQ = supabase
        .from('athlete_metrics')
        .select('id, athlete_id, label, value, unit, sort_order')
        .eq('athlete_id', athleteId)
        .order('sort_order', { ascending: true })
      const resultsQ = supabase
        .from('athlete_results')
        .select('id, athlete_id, title, event_date, placement, detail')
        .eq('athlete_id', athleteId)
        .order('event_date', { ascending: false })
      const mediaQ = supabase
        .from('athlete_media')
        .select('id, athlete_id, title, media_url, media_type')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false })
      const visibilityQ = supabase
        .from('profile_visibility')
        .select('section, visibility')
        .eq('athlete_id', athleteId)
      const [metricsRes, resultsRes, mediaRes, visibilityRes] = await Promise.all([
        subProfileId ? metricsQ.eq('sub_profile_id', subProfileId) : metricsQ.is('sub_profile_id', null),
        subProfileId ? resultsQ.eq('sub_profile_id', subProfileId) : resultsQ.is('sub_profile_id', null),
        subProfileId ? mediaQ.eq('sub_profile_id', subProfileId) : mediaQ.is('sub_profile_id', null),
        subProfileId ? visibilityQ.eq('sub_profile_id', subProfileId) : visibilityQ.is('sub_profile_id', null),
      ])

      if (!active) return
      setMetrics((metricsRes.data || []) as AthleteMetric[])
      setResults((resultsRes.data || []) as AthleteResult[])
      setMedia((mediaRes.data || []) as AthleteMedia[])
      setVisibilityRows((visibilityRes.data || []) as VisibilityRow[])
    }
    loadProfileData()
    return () => {
      active = false
    }
  }, [athleteId, subProfileId, supabase])

  useEffect(() => {
    if (!athleteId) return
    let active = true
    const loadNotes = async () => {
      const { data } = await supabase
        .from('athlete_progress_notes')
        .select('id, note, created_at')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false })
        .limit(10)
      if (active) setSavedNotes((data || []) as Array<{ id: string; note: string; created_at: string }>)
    }
    loadNotes()
    return () => { active = false }
  }, [athleteId, supabase])

  const visibilityMap = useMemo(() => {
    const map = new Map<string, string>()
    visibilityRows.forEach((row) => map.set(row.section, row.visibility))
    return map
  }, [visibilityRows])

  const isPublicSection = useCallback(
    (section: string) => {
      const value = visibilityMap.get(section) || 'public'
      return value === 'public'
    },
    [visibilityMap]
  )

  const handleBookingChange = (field: keyof typeof bookingForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setBookingForm((prev) => ({ ...prev, [field]: event.target.value }))
    if (bookingStep === 'pay') {
      setBookingStep('details')
      setBookingClientSecret('')
      setBookingAmountCents(0)
      setPendingBookingPayload(null)
    }
  }
  const selectedSessionRateCents = useMemo(() => {
    return resolveSessionRateCents({
      rates: coachSessionRates,
      sessionType: '1:1',
      meetingMode: bookingForm.meetingMode,
    })
  }, [bookingForm.meetingMode, coachSessionRates])

  const handleAvatarChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch('/api/storage/avatar', {
      method: 'POST',
      body: formData,
    })
    if (response.ok) {
      const data = await response.json()
      setAvatarUrl(data.url)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ch_avatar_url', data.url)
        window.dispatchEvent(new CustomEvent('ch:avatar-updated', { detail: { url: data.url } }))
      }
    }
    setAvatarUploading(false)
    event.target.value = ''
  }, [])

  const handleBookingSubmit = useCallback(async () => {
    setBookingNotice('')
    if (!currentUserId || !coachId) {
      setBookingNotice('Please sign in and choose a coach to book.')
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
    if (needsGuardianApproval) {
      const approvalResult = await requestGuardianApproval({
        target_type: 'coach',
        target_id: coachId,
        target_label: profile.coach || 'this coach',
        scope: 'transactions',
      })
      if (!approvalResult.ok) {
        setBookingNotice(approvalResult.error || 'Unable to request guardian approval.')
        return
      }
      if (approvalResult.status !== 'approved') {
        setBookingNotice(guardianPendingMessage)
        return
      }
    }

    const sessionRateCents = selectedSessionRateCents
    const payload: BookingRequestPayload = {
      coach_id: coachId,
      athlete_id: currentUserId,
      start_time: startTime.toISOString(),
      duration_minutes: Number(bookingForm.duration),
      session_type: '1:1',
      status: 'Scheduled',
      location: bookingForm.meetingMode === 'online' && bookingForm.meetingProvider === 'custom'
        ? bookingForm.meetingLink
        : bookingForm.location,
      notes: bookingForm.notes,
      title: `Session with ${profile.coach}`,
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
          setBookingNotice(data?.error || guardianPendingMessage)
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
        location: '',
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
          coachId,
          athleteId: currentUserId,
          sessionType: '1:1',
        },
      }),
    })
    const intentPayload = await intentResponse.json().catch(() => null)
    if (!intentResponse.ok || !intentPayload?.clientSecret) {
      if (isGuardianApprovalApiError(intentPayload)) {
        setBookingNotice(intentPayload?.error || guardianPendingMessage)
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
    bookingForm,
    coachId,
    currentUserId,
    googleConnected,
    integrationSettings,
    needsGuardianApproval,
    profile.coach,
    selectedSessionRateCents,
    zoomConnected,
  ])

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
        setBookingNotice(data?.error || guardianPendingMessage)
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
      location: '',
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
  }, [integrationSettings, pendingBookingPayload])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="relative block h-16 w-16 cursor-pointer rounded-full border-2 border-[#191919] bg-[#e8e8e8] bg-cover bg-center" style={{ backgroundImage: `url(${avatarUrl})` }}>
              {showUploadHint && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl font-semibold text-[#191919] opacity-30">
                  +
                </span>
              )}
              <input type="file" className="absolute inset-0 h-full w-full opacity-0 cursor-pointer" aria-label="Upload profile photo" onChange={handleAvatarChange} />
            </label>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athlete Profile</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">{displayName}</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">{displaySubtitle}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {profile.focus.map((item) => (
                <span key={item} className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                  {item}
                </span>
              ))}
              {avatarUploading && (
                <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs text-[#4a4a4a]">
                  Uploading...
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/athlete/messages" className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
              Message coach
            </Link>
            <Link href="/athlete/calendar" className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white hover:opacity-90 transition-opacity">
              Book session
            </Link>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-5">
              <h2 className="text-xl font-semibold text-[#191919]">About</h2>
              <p className="mt-3 text-sm text-[#4a4a4a]">
                {bio || profile.about}
              </p>
              {(athleteSeason || athleteGradeLevel || athleteBirthdate || accountOwnerType) && (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm">
                  {accountOwnerType && (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Account owner</p>
                      <p className="mt-1 font-semibold text-[#191919]">{formatAccountOwnerLabel(accountOwnerType)}</p>
                    </div>
                  )}
                  {athleteSeason && (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Season</p>
                      <p className="mt-1 font-semibold text-[#191919]">{athleteSeason}</p>
                    </div>
                  )}
                  {athleteGradeLevel && (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Grade level</p>
                      <p className="mt-1 font-semibold text-[#191919]">{athleteGradeLevel}</p>
                    </div>
                  )}
                  {athleteBirthdate && (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Date of birth</p>
                      <p className="mt-1 font-semibold text-[#191919]">{new Date(athleteBirthdate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                  )}
                </div>
              )}
              {(guardianName || guardianEmail || guardianPhone) && (
                <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Guardian</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <p className="font-semibold text-[#191919]">{guardianName || 'Not set'}</p>
                    <p className="text-[#4a4a4a]">{guardianEmail || 'No email listed'}</p>
                    <p className="text-[#4a4a4a]">{guardianPhone || 'No phone listed'}</p>
                  </div>
                </div>
              )}
            </section>

            {isPublicSection('metrics') && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-[#191919]">Performance metrics</h2>
                  <button
                    type="button"
                    onClick={() => setShowAddMetric((v) => !v)}
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    {showAddMetric ? 'Cancel' : 'Add metric'}
                  </button>
                </div>
                {showAddMetric && (
                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    <input
                      type="text"
                      placeholder="Label (e.g. 40-yard dash)"
                      value={newMetricLabel}
                      onChange={(e) => setNewMetricLabel(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Value (e.g. 4.8)"
                      value={newMetricValue}
                      onChange={(e) => setNewMetricValue(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Unit (e.g. sec)"
                      value={newMetricUnit}
                      onChange={(e) => setNewMetricUnit(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={addMetricLoading || !newMetricLabel.trim() || !newMetricValue.trim()}
                      onClick={async () => {
                        if (!athleteId) return
                        setAddMetricLoading(true)
                        const row: Record<string, unknown> = {
                          athlete_id: athleteId,
                          label: newMetricLabel.trim(),
                          value: newMetricValue.trim(),
                          sort_order: metrics.length,
                        }
                        if (newMetricUnit.trim()) row.unit = newMetricUnit.trim()
                        if (subProfileId) row.sub_profile_id = subProfileId
                        const { data: inserted, error } = await supabase
                          .from('athlete_metrics')
                          .insert(row)
                          .select('id, athlete_id, label, value, unit, sort_order')
                          .single()
                        setAddMetricLoading(false)
                        if (error) { setToast('Unable to add metric.'); return }
                        setMetrics((prev) => [...prev, inserted as AthleteMetric])
                        setNewMetricLabel(''); setNewMetricValue(''); setNewMetricUnit('')
                        setShowAddMetric(false)
                      }}
                      className="rounded-full bg-[#b80f0a] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
                    >
                      {addMetricLoading ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {metrics.length === 0 ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                      No metrics yet.
                    </div>
                  ) : (
                    metrics.map((metric) => (
                      <div key={metric.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">{metric.label}</p>
                        <p className="mt-1 text-lg font-semibold text-[#191919]">
                          {metric.value}{metric.unit ? ` ${metric.unit}` : ''}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {isPublicSection('results') && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-[#191919]">Recent results</h2>
                  <button
                    type="button"
                    onClick={() => setShowAddResult((v) => !v)}
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    {showAddResult ? 'Cancel' : 'Add result'}
                  </button>
                </div>
                {showAddResult && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <input
                      type="text"
                      placeholder="Event / competition name"
                      value={newResultTitle}
                      onChange={(e) => setNewResultTitle(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <input
                      type="date"
                      value={newResultDate}
                      onChange={(e) => setNewResultDate(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Placement (e.g. 1st, Top 10)"
                      value={newResultPlacement}
                      onChange={(e) => setNewResultPlacement(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Notes / detail (optional)"
                      value={newResultDetail}
                      onChange={(e) => setNewResultDetail(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={addResultLoading || !newResultTitle.trim()}
                      onClick={async () => {
                        if (!athleteId) return
                        setAddResultLoading(true)
                        const row: Record<string, unknown> = {
                          athlete_id: athleteId,
                          title: newResultTitle.trim(),
                        }
                        if (newResultDate) row.event_date = newResultDate
                        if (newResultPlacement.trim()) row.placement = newResultPlacement.trim()
                        if (newResultDetail.trim()) row.detail = newResultDetail.trim()
                        if (subProfileId) row.sub_profile_id = subProfileId
                        const { data: inserted, error } = await supabase
                          .from('athlete_results')
                          .insert(row)
                          .select('id, athlete_id, title, event_date, placement, detail')
                          .single()
                        setAddResultLoading(false)
                        if (error) { setToast('Unable to add result.'); return }
                        setResults((prev) => [inserted as AthleteResult, ...prev])
                        setNewResultTitle(''); setNewResultDate(''); setNewResultPlacement(''); setNewResultDetail('')
                        setShowAddResult(false)
                      }}
                      className="rounded-full bg-[#b80f0a] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity md:col-span-2"
                    >
                      {addResultLoading ? 'Saving...' : 'Save result'}
                    </button>
                  </div>
                )}
                <div className="mt-4 space-y-3 text-sm">
                  {results.length === 0 ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                      No results posted.
                    </div>
                  ) : (
                    results.map((result) => (
                      <div key={result.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <p className="font-semibold text-[#191919]">{result.title}</p>
                        <p className="text-xs text-[#4a4a4a]">
                          {result.event_date ? new Date(result.event_date).toLocaleDateString() : 'Date TBD'}
                          {result.placement ? ` · ${result.placement}` : ''}
                        </p>
                        {result.detail && (
                          <p className="mt-1 text-xs text-[#4a4a4a]">{result.detail}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {isPublicSection('media') && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-[#191919]">Highlights</h2>
                  <button
                    type="button"
                    onClick={() => setShowAddMedia((v) => !v)}
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    {showAddMedia ? 'Cancel' : 'Add highlight'}
                  </button>
                </div>
                {showAddMedia && (
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <input
                      type="url"
                      placeholder="Image or video URL"
                      value={newMediaUrl}
                      onChange={(e) => setNewMediaUrl(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none md:col-span-2"
                    />
                    <input
                      type="text"
                      placeholder="Title (optional)"
                      value={newMediaTitle}
                      onChange={(e) => setNewMediaTitle(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={addMediaLoading || !newMediaUrl.trim()}
                      onClick={async () => {
                        if (!athleteId) return
                        setAddMediaLoading(true)
                        const row: Record<string, unknown> = {
                          athlete_id: athleteId,
                          media_url: newMediaUrl.trim(),
                          media_type: 'image',
                        }
                        if (newMediaTitle.trim()) row.title = newMediaTitle.trim()
                        if (subProfileId) row.sub_profile_id = subProfileId
                        const { data: inserted, error } = await supabase
                          .from('athlete_media')
                          .insert(row)
                          .select('id, athlete_id, title, media_url, media_type')
                          .single()
                        setAddMediaLoading(false)
                        if (error) { setToast('Unable to add highlight.'); return }
                        setMedia((prev) => [inserted as AthleteMedia, ...prev])
                        setNewMediaUrl(''); setNewMediaTitle('')
                        setShowAddMedia(false)
                      }}
                      className="rounded-full bg-[#b80f0a] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity md:col-span-3"
                    >
                      {addMediaLoading ? 'Saving...' : 'Save highlight'}
                    </button>
                  </div>
                )}
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {media.length === 0 ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                      No highlights uploaded.
                    </div>
                  ) : (
                    media.slice(0, 6).map((item) => (
                      <a
                        key={item.id}
                        href={item.media_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-[#dcdcdc] bg-white p-3 text-sm hover:border-[#191919]"
                      >
                        <div className="relative h-24 w-full rounded-xl bg-[#f5f5f5]">
                          <Image
                            src={item.media_url}
                            alt={item.title || 'Highlight'}
                            fill
                            sizes="(max-width: 1024px) 100vw, 200px"
                            className="rounded-xl object-cover"
                          />
                        </div>
                        <p className="mt-2 text-xs font-semibold text-[#191919]">{item.title || 'Highlight'}</p>
                      </a>
                    ))
                  )}
                </div>
              </section>
            )}

            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[#191919]">Book a session</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Choose a time and duration to reserve with {profile.coach}.</p>
                </div>
                <Link href="/athlete/calendar" className="text-sm font-semibold text-[#191919] underline">
                  View calendar
                </Link>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Date</span>
                  <input
                    type="date"
                    value={bookingForm.date}
                    onChange={handleBookingChange('date')}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Time</span>
                  <input
                    type="time"
                    value={bookingForm.time}
                    onChange={handleBookingChange('time')}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Duration</span>
                  <select
                    value={bookingForm.duration}
                    onChange={handleBookingChange('duration')}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                  >
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                    <option value="90">90 min</option>
                  </select>
                </label>
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Session format</span>
                  <div className="flex flex-wrap gap-2">
                    {(['in_person', 'online'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setBookingForm((prev) => ({ ...prev, meetingMode: mode }))}
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
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Video provider</span>
                    <div className="flex flex-wrap gap-2">
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
                    <p className="text-xs text-[#4a4a4a]">
                      Coach must connect Google Meet or Zoom to enable those options.
                    </p>
                  </div>
                )}
                {bookingForm.meetingMode === 'online' && bookingForm.meetingProvider === 'custom' && (
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Meeting link</span>
                    <input
                      value={bookingForm.meetingLink}
                      onChange={handleBookingChange('meetingLink')}
                      placeholder="Paste a video link"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                    />
                  </label>
                )}
                {bookingForm.meetingMode === 'in_person' && (
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Location</span>
                    <input
                      value={bookingForm.location}
                      onChange={handleBookingChange('location')}
                      placeholder="Facility or address"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                    />
                  </label>
                )}
                <label className="md:col-span-2 space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Notes</span>
                  <textarea
                    rows={3}
                    value={bookingForm.notes}
                    onChange={handleBookingChange('notes')}
                    placeholder="Share any goals or prep notes."
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                  />
                </label>
                <div className="md:col-span-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2 text-xs text-[#4a4a4a]">
                  {selectedSessionRateCents > 0
                    ? `Session total: $${(selectedSessionRateCents / 100).toFixed(2)}`
                    : 'No payment required for this session.'}
                </div>
                {bookingNotice && (
                  <p className="md:col-span-2 text-xs text-[#4a4a4a]">{bookingNotice}</p>
                )}
                {bookingStep === 'details' ? (
                  <div className="md:col-span-2 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleBookingSubmit}
                      disabled={bookingLoading || !canTransact}
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:bg-[#b80f0a] disabled:text-white disabled:cursor-not-allowed"
                    >
                      {bookingLoading
                        ? 'Booking...'
                        : selectedSessionRateCents > 0
                          ? 'Continue to payment'
                          : 'Book session'}
                    </button>
                    <Link href="/athlete/messages" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]">
                      Message coach
                    </Link>
                  </div>
                ) : (
                  <div className="md:col-span-2 space-y-3">
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
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setBookingStep('details')
                          setBookingClientSecret('')
                          setBookingAmountCents(0)
                          setPendingBookingPayload(null)
                          setBookingNotice('')
                        }}
                        className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                      >
                        Back to details
                      </button>
                      <Link href="/athlete/messages" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]">
                        Message coach
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#191919]">Progress notes</h2>
                <button
                  type="button"
                  disabled={noteSaving}
                  onClick={async () => {
                    if (!noteText.trim()) {
                      setToast('Add a note before saving.')
                      return
                    }
                    if (!athleteId) return
                    setNoteSaving(true)
                    const { data: inserted, error } = await supabase
                      .from('athlete_progress_notes')
                      .insert({ athlete_id: athleteId, note: noteText.trim() })
                      .select('id, note, created_at')
                      .single()
                    setNoteSaving(false)
                    if (error) {
                      setToast('Unable to save note.')
                      return
                    }
                    const savedNote = inserted as { id: string; note: string; created_at: string }
                    setSavedNotes((prev) => [savedNote, ...prev])
                    setNoteText('')
                    setToast('Note saved.')
                  }}
                  className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                >
                  {noteSaving ? 'Saving...' : 'Save note'}
                </button>
              </div>
              <p className="mt-2 text-sm text-[#4a4a4a]">Track weekly wins, challenges, and adjustments.</p>
              <textarea
                rows={3}
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                className="mt-4 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                placeholder="Add a new progress note..."
              />
              <div className="mt-4 space-y-3 text-sm">
                {savedNotes.length === 0 ? (
                  <p className="text-xs text-[#4a4a4a]">No notes yet. Add your first note above.</p>
                ) : (
                  savedNotes.map((n) => (
                    <div key={n.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-sm text-[#191919]">{n.note}</p>
                      <p className="mt-1 text-xs text-[#4a4a4a]">{new Date(n.created_at).toLocaleDateString()}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
