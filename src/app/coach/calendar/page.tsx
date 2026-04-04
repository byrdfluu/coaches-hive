'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

type SessionRow = {
  id: string
  title?: string | null
  start_time?: string | null
  end_time?: string | null
  session_type?: string | null
  type?: string | null
  status?: string | null
  attendance_status?: string | null
  location?: string | null
  notes?: string | null
  duration_minutes?: number | null
  athlete_id?: string | null
  practice_plan_id?: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  role?: string | null
}

type IntegrationSettings = {
  videoProvider: 'zoom' | 'google_meet' | 'custom'
  customVideoLink: string
  connections: {
    google: { connected: boolean }
    zoom: { connected: boolean }
  }
}

type PracticePlan = {
  id: string
  title: string
  team_id?: string | null
  athlete_id?: string | null
}

const defaultIntegrationSettings: IntegrationSettings = {
  videoProvider: 'zoom',
  customVideoLink: '',
  connections: {
    google: { connected: false },
    zoom: { connected: false },
  },
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

type CalendarEvent = {
  day: number
  label: string
  type: '1:1' | 'group' | 'camp' | 'task' | 'availability'
  sessionId?: string
  status?: string | null
}

type CalendarSubscriptionLinks = {
  feedUrl: string
  webcalUrl: string
  googleSubscribeUrl: string
}

const attendanceOptions = [
  { value: '', label: 'Not marked' },
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'excused', label: 'Excused' },
]

const formatSessionTypeLabel = (value: string) => {
  if (value === '1:1') return '1:1'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const formatTime = (value?: string | null) => {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBD'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
  if (raw.includes('group')) return 'group'
  if (raw.includes('camp')) return 'camp'
  if (raw.includes('availability')) return 'availability'
  if (raw.includes('task') || raw.includes('reminder')) return 'task'
  return '1:1'
}

const formatGoogleDate = (date: Date) =>
  date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

const buildGoogleCalendarUrl = (session: SessionRow, athleteName?: string, planTitle?: string) => {
  if (!session.start_time) return null
  const start = new Date(session.start_time)
  if (Number.isNaN(start.getTime())) return null
  const end = session.end_time ? new Date(session.end_time) : new Date(start.getTime() + 60 * 60 * 1000)
  const endDate = Number.isNaN(end.getTime()) ? new Date(start.getTime() + 60 * 60 * 1000) : end
  const titleBase = session.title || session.session_type || session.type || 'Session'
  const title = athleteName ? `${titleBase} with ${athleteName}` : titleBase
  const details = [session.notes, planTitle ? `Practice plan: ${planTitle}` : null]
    .filter(Boolean)
    .join('\n')
  const location = session.location || ''
  const dates = `${formatGoogleDate(start)}/${formatGoogleDate(endDate)}`
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    title
  )}&dates=${dates}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`
}


export default function CoachCalendarPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [payoutCadence, setPayoutCadence] = useState('Weekly')
  const [payoutDay, setPayoutDay] = useState('Monday')
  const [typeFilter, setTypeFilter] = useState<'All' | '1:1' | 'group' | 'camp' | 'task' | 'availability'>('All')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({})
  const [practicePlans, setPracticePlans] = useState<PracticePlan[]>([])
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [formType, setFormType] = useState<'Task' | 'Reminder' | 'Training'>('Training')
  const [formData, setFormData] = useState({
    title: '',
    date: '',
    time: '',
    athletes: '',
    location: '',
    notes: '',
    meetingMode: 'in_person',
    meetingProvider: 'zoom',
    meetingLink: '',
    practicePlanId: '',
  })
  const [saving, setSaving] = useState(false)
  const [formNotice, setFormNotice] = useState('')
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>(defaultIntegrationSettings)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [sessionNotice, setSessionNotice] = useState('')
  const [sessionSaving, setSessionSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [calendarSubscribing, setCalendarSubscribing] = useState(false)
  const [calendarSubscriptionLinks, setCalendarSubscriptionLinks] = useState<CalendarSubscriptionLinks | null>(null)
  const [rescheduleForm, setRescheduleForm] = useState({
    date: '',
    time: '',
    duration: '60',
  })
  const [followupOpen, setFollowupOpen] = useState(false)
  const [followupNotice, setFollowupNotice] = useState('')
  const [followupForm, setFollowupForm] = useState({
    title: '',
    date: '',
    time: '',
    type: 'Check-in',
    note: '',
  })
  const [availabilityFilters, setAvailabilityFilters] = useState({
    sessionType: 'All',
    location: 'All',
  })
  const googleConnected = integrationSettings.connections.google.connected
  const zoomConnected = integrationSettings.connections.zoom.connected

  const [monthCursor, setMonthCursor] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const monthName = monthCursor.toLocaleString('en-US', { month: 'long' })
  const monthYear = String(monthCursor.getFullYear())
  const monthDays = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate()
  const startOffset = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1).getDay()
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  useEffect(() => {
    const stored = window.localStorage.getItem('ch_payout_cadence')
    if (stored) setPayoutCadence(stored)
    const storedDay = window.localStorage.getItem('ch_payout_day')
    if (storedDay) setPayoutDay(storedDay)

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ch_payout_cadence' && event.newValue) {
        setPayoutCadence(event.newValue)
      }
      if (event.key === 'ch_payout_day' && event.newValue) {
        setPayoutDay(event.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const followupParam = (searchParams?.get('followup') || '').trim()
  const followupSlug = followupParam ? followupParam.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : ''
  const followupName = followupSlug
    ? followupSlug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    : ''

  useEffect(() => {
    if (followupSlug) {
      setFollowupOpen(true)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateValue = tomorrow.toISOString().slice(0, 10)
      setFollowupForm((prev) => ({
        ...prev,
        title: prev.title || `Follow-up with ${followupName || 'athlete'}`,
        date: prev.date || dateValue,
      }))
    } else {
      setFollowupOpen(false)
      setFollowupNotice('')
      setFollowupForm({ title: '', date: '', time: '', type: 'Check-in', note: '' })
    }
  }, [followupSlug, followupName])

  const closeFollowupModal = () => {
    setFollowupOpen(false)
    setFollowupNotice('')
    setFollowupForm({ title: '', date: '', time: '', type: 'Check-in', note: '' })
    router.push('/coach/calendar')
  }

  useEffect(() => {
    if (!currentUserId) return
    const loadPayoutFromProfile = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('payout_schedule, payout_day, integration_settings')
        .eq('id', currentUserId)
        .maybeSingle()
      const profileRow = (profile || null) as {
        payout_schedule?: string | null
        payout_day?: string | null
        integration_settings?: unknown
      } | null
      if (profileRow?.payout_schedule) {
        setPayoutCadence(profileRow.payout_schedule)
        window.localStorage.setItem('ch_payout_cadence', profileRow.payout_schedule)
      }
      if (profileRow?.payout_day) {
        setPayoutDay(profileRow.payout_day)
        window.localStorage.setItem('ch_payout_day', profileRow.payout_day)
      }
      if (profile?.integration_settings && typeof profile.integration_settings === 'object') {
        const raw = profile.integration_settings as Partial<IntegrationSettings>
        setIntegrationSettings({
          videoProvider: raw.videoProvider || defaultIntegrationSettings.videoProvider,
          customVideoLink: raw.customVideoLink || defaultIntegrationSettings.customVideoLink,
          connections: {
            google: { connected: Boolean(raw.connections?.google?.connected) },
            zoom: { connected: Boolean(raw.connections?.zoom?.connected) },
          },
        })
        setFormData((prev) => ({
          ...prev,
          meetingProvider: raw.videoProvider || prev.meetingProvider,
          meetingLink: prev.meetingLink || raw.customVideoLink || '',
        }))
      }
    }
    loadPayoutFromProfile()
  }, [currentUserId, supabase])

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

  const loadSessions = useCallback(async () => {
    if (!currentUserId) return
    setLoading(true)
    const response = await fetch('/api/sessions')
    const payload = response.ok ? await response.json() : { sessions: [] }
    const rows = (payload.sessions || []) as SessionRow[]
    setSessions(rows)

    const athleteIds = Array.from(new Set(rows.map((row) => row.athlete_id).filter(Boolean) as string[]))
    if (athleteIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', athleteIds)
      const athleteProfiles = (profiles || []) as ProfileRow[]
      const nameMap: Record<string, string> = {}
      athleteProfiles.forEach((profile) => {
        if (profile.full_name) {
          nameMap[profile.id] = profile.full_name
        }
      })
      setAthleteNames(nameMap)
    } else {
      setAthleteNames({})
    }
    setLoading(false)
  }, [currentUserId, supabase])

  useEffect(() => {
    if (!currentUserId) return
    loadSessions()
  }, [currentUserId, loadSessions])

  // Real-time: reload sessions whenever any session row for this coach changes.
  useEffect(() => {
    if (!currentUserId) return
    const channel = supabase
      .channel(`coach-sessions-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `coach_id=eq.${currentUserId}` },
        () => loadSessions(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId, loadSessions, supabase])

  useEffect(() => {
    if (!currentUserId) return
    const loadAvailability = async () => {
      const response = await fetch('/api/availability')
      const payload = response.ok ? await response.json() : { availability: [] }
      const rows = (payload.availability || []) as AvailabilityBlock[]
      setAvailability(rows)
    }
    loadAvailability()
  }, [currentUserId])

  useEffect(() => {
    if (!currentUserId) return
    const loadPlans = async () => {
      const response = await fetch('/api/practice-plans')
      const payload = response.ok ? await response.json() : { plans: [] }
      const rows = (payload.plans || []) as PracticePlan[]
      setPracticePlans(rows)
    }
    loadPlans()
  }, [currentUserId])

  const events = useMemo<CalendarEvent[]>(() => {
    return sessions
      .map((session) => {
        if (!session.start_time) return null
        const start = new Date(session.start_time)
        if (start.getMonth() !== monthCursor.getMonth() || start.getFullYear() !== monthCursor.getFullYear()) return null
        const athleteName = session.athlete_id ? athleteNames[session.athlete_id] : ''
        const labelBase = session.title || session.session_type || session.type || 'Session'
        const label = `${formatTime(session.start_time)} · ${labelBase}${athleteName ? ` · ${athleteName}` : ''}`
        return {
          day: start.getDate(),
          label,
          type: normalizeType(session.session_type || session.type),
          sessionId: session.id,
          status: session.status || null,
        }
      })
      .filter(Boolean) as CalendarEvent[]
  }, [sessions, athleteNames, monthCursor])

  const practicePlanMap = useMemo(() => {
    const map = new Map<string, PracticePlan>()
    practicePlans.forEach((plan) => map.set(plan.id, plan))
    return map
  }, [practicePlans])

  const filteredEvents = useMemo(() => {
    return events.filter((item) => {
      const matchesType = typeFilter === 'All' || item.type === typeFilter
      const matchesSearch = item.label.toLowerCase().includes(search.toLowerCase())
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
    const openSlots = availability.length
    return [
      { label: 'This week', value: weekCount },
      { label: 'Next 7 days', value: upcomingCount },
      { label: 'Confirmed', value: confirmedCount },
      { label: 'Open slots', value: openSlots, helper: 'From availability' },
    ]
  }, [availability.length, sessions])

  const upcomingSessions = useMemo(() => {
    const now = new Date()
    return sessions
      .map((session) => {
        if (!session.start_time) return null
        const start = new Date(session.start_time)
        if (Number.isNaN(start.getTime())) return null
        const athleteName = session.athlete_id ? athleteNames[session.athlete_id] || '' : ''
        return {
          id: session.id,
          title: session.title || session.session_type || session.type || 'Session',
          start,
          athleteName,
          status: session.status || 'Scheduled',
          location: session.location || 'TBD',
          practicePlanId: session.practice_plan_id || null,
        }
      })
      .filter((session): session is NonNullable<typeof session> => session !== null)
      .filter((session) => session.start >= now)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 5)
  }, [athleteNames, sessions])

  const selectedEvents = useMemo(() => {
    if (selectedDay === null) {
      return []
    }
    return filteredEvents.filter((event) => event.day === selectedDay)
  }, [filteredEvents, selectedDay])

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

  const selectedDate = useMemo(() => {
    if (selectedDay === null) return null
    return new Date(monthCursor.getFullYear(), monthCursor.getMonth(), selectedDay)
  }, [selectedDay, monthCursor])

  const selectedDayAvailability = useMemo(() => {
    if (!selectedDate) return []
    const dayOfWeek = selectedDate.getDay()
    return availabilityByDay[dayOfWeek] || []
  }, [availabilityByDay, selectedDate])

  const slotDuration = 60

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

  const sessionById = useMemo(() => {
    const map = new Map<string, SessionRow>()
    sessions.forEach((session) => {
      map.set(session.id, session)
    })
    return map
  }, [sessions])

  const handleFormChange = (field: keyof typeof formData) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const selectDate = useCallback((date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateValue = `${year}-${month}-${day}`
    setMonthCursor(new Date(year, date.getMonth(), 1))
    setSelectedDay(date.getDate())
    setFormData((prev) => ({ ...prev, date: dateValue }))
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

  const buildCalendarSubscriptionLinks = useCallback((origin: string, token: string): CalendarSubscriptionLinks => {
    const query = new URLSearchParams({ token }).toString()
    const feedUrl = `${origin}/api/calendar/ical?${query}`
    const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://')
    const googleSubscribeUrl = `https://www.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`
    return { feedUrl, webcalUrl, googleSubscribeUrl }
  }, [])

  const handleSubscribeCalendar = useCallback(async () => {
    if (!currentUserId || typeof window === 'undefined') {
      setToast('Please sign in to subscribe to your calendar feed.')
      return
    }
    setCalendarSubscribing(true)
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('calendar_feed_token')
        .eq('id', currentUserId)
        .maybeSingle()
      const calendarProfile = (profile || null) as { calendar_feed_token?: string | null } | null
      if (profileError) {
        setToast('Unable to load calendar feed link.')
        return
      }

      const token = calendarProfile?.calendar_feed_token
        || (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${currentUserId}-${Date.now()}`)

      if (!profile?.calendar_feed_token) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ calendar_feed_token: token })
          .eq('id', currentUserId)
        if (updateError) {
          setToast('Unable to create calendar feed link.')
          return
        }
      }

      const links = buildCalendarSubscriptionLinks(window.location.origin, token)
      setCalendarSubscriptionLinks(links)
      try {
        await navigator.clipboard.writeText(links.feedUrl)
        setToast('Calendar feed link copied. Choose Apple or Google to subscribe.')
      } catch {
        setToast('Choose Apple or Google to subscribe to your calendar feed.')
      }
    } finally {
      setCalendarSubscribing(false)
    }
  }, [buildCalendarSubscriptionLinks, currentUserId, supabase])

  const handleOpenAppleCalendar = useCallback(() => {
    if (!calendarSubscriptionLinks || typeof window === 'undefined') return
    window.location.href = calendarSubscriptionLinks.webcalUrl
    setToast('Opening Apple Calendar subscription.')
  }, [calendarSubscriptionLinks])

  const handleOpenGoogleCalendar = useCallback(() => {
    if (!calendarSubscriptionLinks || typeof window === 'undefined') return
    window.open(calendarSubscriptionLinks.googleSubscribeUrl, '_blank', 'noopener,noreferrer')
    setToast('Opening Google Calendar subscription.')
  }, [calendarSubscriptionLinks])

  const handleCopyCalendarFeedLink = useCallback(async () => {
    if (!calendarSubscriptionLinks) return
    try {
      await navigator.clipboard.writeText(calendarSubscriptionLinks.feedUrl)
      setToast('Calendar feed link copied.')
    } catch {
      setToast('Unable to copy calendar feed link.')
    }
  }, [calendarSubscriptionLinks])

  const handleSummaryCardClick = useCallback((label: string) => {
    if (label === 'Open slots') {
      router.push('/coach/availability')
      return
    }
    if (label === 'This week') {
      jumpToToday()
      return
    }
    if (label === 'Next 7 days') {
      jumpToTomorrow()
      return
    }
    if (label === 'Confirmed') {
      const nextConfirmed = sessions.find((session) => {
        if (!session.start_time) return false
        const status = String(session.status || '').toLowerCase()
        const start = new Date(session.start_time)
        return !Number.isNaN(start.getTime()) && start >= new Date() && (status.includes('confirmed') || status.includes('scheduled'))
      })
      if (nextConfirmed?.start_time) {
        selectDate(new Date(nextConfirmed.start_time))
      }
      const upcoming = document.getElementById('upcoming-sessions')
      if (upcoming) {
        upcoming.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [jumpToToday, jumpToTomorrow, router, selectDate, sessions])

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

  const resolveAthleteId = useCallback(async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return null
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .ilike('full_name', `%${trimmed}%`)
      .eq('role', 'athlete')
      .limit(1)
    return data?.[0]?.id ?? null
  }, [supabase])

  const handleSaveSession = useCallback(async () => {
    if (!currentUserId) return
    if (!formData.title.trim() || !formData.date) {
      setFormNotice('Add a title and date to save.')
      return
    }
    if (formType === 'Training' && !formData.time) {
      setFormNotice('Add a time to save.')
      return
    }
    if (formType === 'Training' && formData.meetingMode === 'online') {
      if (!formData.meetingProvider) {
        setFormNotice('Select a video provider for online sessions.')
        return
      }
      if (formData.meetingProvider === 'custom' && !formData.meetingLink.trim()) {
        setFormNotice('Add a meeting link for online sessions.')
        return
      }
      if (formData.meetingProvider === 'google_meet' && !integrationSettings.connections.google.connected) {
        setFormNotice('Connect Google Meet in settings to use it for online sessions.')
        return
      }
      if (formData.meetingProvider === 'zoom' && !integrationSettings.connections.zoom.connected) {
        setFormNotice('Connect Zoom in settings to use it for online sessions.')
        return
      }
    }

    setSaving(true)
    setFormNotice('')

    const startTime = new Date(`${formData.date}T${formData.time || '00:00'}`)
    const athleteInput = (formData.athletes.split(',')[0] || '').trim()
    const athleteId = athleteInput ? await resolveAthleteId(athleteInput) : null

    if (athleteInput && !athleteId) {
      setFormNotice('Could not find that athlete. Use a linked athlete name.')
      setSaving(false)
      return
    }

    if (formType === 'Training' && !athleteId) {
      setFormNotice('Tag one athlete before saving a training session.')
      setSaving(false)
      return
    }

    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formData.title,
        coach_id: currentUserId,
        athlete_id: athleteId,
        start_time: startTime.toISOString(),
        duration_minutes: 60,
        session_type: formType.toLowerCase(),
        status: 'Scheduled',
        location: formData.meetingMode === 'online' && formData.meetingProvider === 'custom'
          ? formData.meetingLink
          : formData.location,
        notes: formData.notes,
        meeting_mode: formData.meetingMode,
        meeting_provider: formData.meetingMode === 'online' ? formData.meetingProvider : null,
        meeting_link: formData.meetingMode === 'online' ? formData.meetingLink : null,
        practice_plan_id: formData.practicePlanId || null,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      setFormNotice(data?.error || 'Could not save session. Check required fields or database columns.')
      setSaving(false)
      return
    }

    setFormData({
      title: '',
      date: '',
      time: '',
      athletes: '',
      location: '',
      notes: '',
      meetingMode: 'in_person',
      meetingProvider: integrationSettings.videoProvider || 'zoom',
      meetingLink: integrationSettings.customVideoLink || '',
      practicePlanId: '',
    })
    setFormType('Training')
    setSaving(false)
    setFormNotice('Saved to calendar.')
    await loadSessions()
  }, [currentUserId, formData, formType, integrationSettings, loadSessions, resolveAthleteId])

  const handleNotifyAthletes = useCallback(async () => {
    setNotifyLoading(true)
    const response = await fetch('/api/coach/notify-athletes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'calendar',
        title: formData.title,
        date: formData.date,
        time: formData.time,
        notes: formData.notes,
        location: formData.location,
        type: formType,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setToast(payload?.error || 'Unable to notify athletes')
      setNotifyLoading(false)
      return
    }
    const count = payload?.count || 0
    setToast(count ? `Notified ${count} athletes` : 'No linked athletes to notify')
    setNotifyLoading(false)
  }, [formData, formType])

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

  useEffect(() => {
    if (!currentUserId) return
    const channel = supabase
      .channel(`coach-sessions-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `coach_id=eq.${currentUserId}` },
        () => loadSessions()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId, loadSessions, supabase])

  return (
    <main className="page-shell">
      {calendarSubscriptionLinks && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-[#dcdcdc] bg-white p-6 shadow-[0_24px_80px_rgba(25,25,25,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Calendar feed ready</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Subscribe in Apple or Google Calendar</h2>
                <p className="mt-2 text-sm text-[#4a4a4a]">
                  Choose your calendar app below. Your private feed link is already copied for manual paste if needed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCalendarSubscriptionLinks(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dcdcdc] text-lg text-[#191919] hover:bg-[#f5f5f5]"
                aria-label="Close calendar subscription options"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={handleOpenAppleCalendar}
                className="rounded-full border border-[#191919] px-4 py-3 text-sm font-semibold text-[#191919] transition hover:bg-[#191919] hover:text-[#b80f0a]"
              >
                Open Apple Calendar
              </button>
              <button
                type="button"
                onClick={handleOpenGoogleCalendar}
                className="rounded-full border border-[#191919] px-4 py-3 text-sm font-semibold text-[#191919] transition hover:bg-[#191919] hover:text-[#b80f0a]"
              >
                Open Google Calendar
              </button>
              <button
                type="button"
                onClick={handleCopyCalendarFeedLink}
                className="rounded-full border border-[#dcdcdc] px-4 py-3 text-sm font-semibold text-[#4a4a4a] hover:bg-[#f5f5f5]"
              >
                Copy feed link
              </button>
            </div>

            <p className="mt-4 text-xs text-[#7a7a7a]">
              Apple opens a live calendar subscription. Google opens its calendar subscribe screen and may take time to refresh updates.
            </p>
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto max-w-6xl px-3 py-6 sm:px-5 sm:py-8 lg:px-6 lg:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Calendar</p>
            <h1 className="display text-2xl font-semibold text-[#191919] sm:text-3xl">Scheduling and availability</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Manage sessions, reminders, and availability in one place.</p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
            <button
              type="button"
              onClick={handleSubscribeCalendar}
              disabled={calendarSubscribing}
              className="w-full rounded-full border border-[#dcdcdc] px-4 py-2 text-sm font-semibold text-[#4a4a4a] hover:bg-[#f5f5f5] disabled:opacity-60 sm:w-auto"
            >
              {calendarSubscribing ? 'Preparing feed...' : 'Subscribe in Apple/Google Calendar'}
            </button>
            <Link href="/coach/availability" className="w-full rounded-full border border-[#191919] px-4 py-2 text-center text-sm font-semibold text-[#191919] hover:bg-[#f5f5f5] sm:w-auto">
              Set availability
            </Link>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="min-w-0 space-y-5 sm:space-y-6">
            <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {summaryStats.map((stat) => (
                <button
                  key={stat.label}
                  type="button"
                  onClick={() => handleSummaryCardClick(stat.label)}
                  className="rounded-2xl border border-[#e5e5e5] bg-white p-4 text-left transition hover:border-[#191919]"
                >
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{stat.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                  {stat.helper && (
                    <p className="mt-1 text-xs text-[#9a9a9a]">{stat.helper}</p>
                  )}
                </button>
              ))}
            </section>
            <section id="full-schedule" className="glass-card border border-[#191919] bg-white p-4 sm:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Schedule</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-sm font-semibold text-[#191919] md:justify-start">
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
                </div>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-xs text-[#4a4a4a] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
                  <Link href="/coach/settings#payouts" className="shrink-0 rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#191919] hover:border-[#191919] hover:bg-[#f5f5f5]">
                    Payout cadence: {payoutCadence}
                  </Link>
                  {(['All', '1:1', 'group', 'camp', 'task', 'availability'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setTypeFilter(type)}
                      className={`shrink-0 rounded-full border px-3 py-1 font-semibold transition ${
                        typeFilter === type ? 'border-[#191919] text-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] text-[#191919]'
                      }`}
                    >
                      {type === '1:1' ? '1:1' : type[0].toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sessions, tasks, or athletes"
                  className="w-full rounded-2xl border border-[#dcdcdc] px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none md:w-80"
                />
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-xs md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
                  <button
                    type="button"
                    onClick={() => setTypeFilter('All')}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 ${
                      typeFilter === 'All' || typeFilter === '1:1' || typeFilter === 'group' || typeFilter === 'camp'
                        ? 'border-[#191919] bg-[#f5f5f5]'
                        : 'border-[#dcdcdc]'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-[#b80f0a]" /> 1:1 / group / camp
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('task')}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 ${
                      typeFilter === 'task' ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc]'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-[#4a4a4a]" /> Tasks
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('availability')}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 ${
                      typeFilter === 'availability' ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc]'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-[#9c9c9c]" /> Availability blocks
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3 text-xs md:flex-row md:flex-wrap md:items-center md:justify-between">
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
                    className="w-full rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-left font-semibold text-[#191919] md:w-auto md:text-center"
                  >
                    Next open block: {nextAvailableLabel}
                  </button>
                ) : (
                  <Link href="/coach/availability" className="text-[#9a9a9a] underline underline-offset-2">
                    Publish availability to see next open block
                  </Link>
                )}
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 sm:p-4 text-sm text-[#191919]">
                <div className="min-w-[440px] md:min-w-[560px]">
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
                    const payoutDayIndex = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(payoutDay)
                    const isPayoutDay = payoutDayIndex === new Date(monthCursor.getFullYear(), monthCursor.getMonth(), dayNumber).getDay()
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
                          {isPayoutDay && <span className="h-2 w-2 rounded-full bg-[#191919]" />}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-[#9a9a9a]">
                          <span>{dayEvents.length ? `${dayEvents.length} items` : '—'}</span>
                          {dayAvailability.length > 0 && <span className="text-[#191919]">Open</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
                </div>
              </div>

              <p className="mt-3 text-xs text-[#4a4a4a]">Timezone: {localTimezone}</p>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Available times</p>
                    <span className="text-xs text-[#4a4a4a]">
                      {selectedDate ? selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Select a day'}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
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
                  ) : !selectedDay ? (
                    <p className="mt-3 text-xs text-[#9a9a9a]">Pick a day to view your open blocks.</p>
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
                                    setFormData((prev) => ({
                                      ...prev,
                                      date: dateValue,
                                      time: slot.time,
                                      location: slot.block.location || prev.location,
                                    }))
                                    setFormNotice('Prefilled new session from availability.')
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
                  <div className="mt-3">
                    <Link href="/coach/availability" className="text-xs font-semibold text-[#b80f0a] underline">
                      Adjust availability
                    </Link>
                  </div>
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
                        <p className="text-xs text-[#4a4a4a]">Type: {event.type === '1:1' ? '1:1' : event.type}</p>
                        {event.status && (
                          <p className="text-xs text-[#4a4a4a]">Status: {event.status}</p>
                        )}
                        {event.sessionId && sessionById.get(event.sessionId)?.practice_plan_id && (
                          <p className="text-xs text-[#4a4a4a]">
                            Practice plan:{' '}
                            {practicePlanMap.get(sessionById.get(event.sessionId)?.practice_plan_id || '')?.title ||
                              'Linked plan'}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
                          {event.sessionId && (
                            (() => {
                              const session = sessionById.get(event.sessionId)
                              const athleteName = session?.athlete_id ? athleteNames[session.athlete_id] : undefined
                              const planTitle = session?.practice_plan_id
                                ? practicePlanMap.get(session.practice_plan_id || '')?.title
                                : undefined
                              const url = session ? buildGoogleCalendarUrl(session, athleteName, planTitle) : null
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
                        {selectedDay ? 'No sessions scheduled for this day.' : 'Pick a day to review sessions.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section id="upcoming-sessions" className="glass-card border border-[#191919] bg-white p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Upcoming</p>
                  <h2 className="mt-2 text-lg font-semibold text-[#191919]">Next sessions</h2>
                  <p className="mt-1 text-xs text-[#4a4a4a]">A quick view of the next five sessions.</p>
                </div>
                <Link href="#full-schedule" className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
                  View all
                </Link>
              </div>
              <div className="mt-4 space-y-3">
                {upcomingSessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f9f9f9] p-4 text-xs text-[#4a4a4a]">
                    No upcoming sessions yet. Add a session or open availability.
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
                            {session.athleteName ? `${session.athleteName} · ` : ''}{session.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {formatTime(session.start.toISOString())}
                          </p>
                          <p className="mt-1 text-xs text-[#9a9a9a]">{session.location}</p>
                          {session.practicePlanId ? (
                            <p className="mt-1 text-xs text-[#4a4a4a]">
                              Practice plan: {practicePlanMap.get(session.practicePlanId)?.title || 'Linked plan'}
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
                    <div className="pt-1">
                      <p className="text-sm text-[#4a4a4a]">
                        <span className="font-semibold text-[#191919]">Attendance:</span>
                      </p>
                      <select
                        className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        value={sessionById.get(activeSessionId)?.attendance_status || ''}
                        disabled={sessionSaving}
                        onChange={async (event) => {
                          const nextValue = event.target.value
                          const ok = await updateSession(activeSessionId, {
                            attendance_status: nextValue || null,
                          })
                          if (ok) {
                            setToast('Attendance updated')
                          }
                        }}
                      >
                        {attendanceOptions.map((option) => (
                          <option key={option.value || 'none'} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p><span className="font-semibold text-[#191919]">Location:</span> {sessionById.get(activeSessionId)?.location || 'TBD'}</p>
                    {practicePlans.length > 0 ? (
                      <div className="pt-1">
                        <p className="text-sm text-[#4a4a4a]">
                          <span className="font-semibold text-[#191919]">Practice plan:</span>
                        </p>
                        <select
                          className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                          value={sessionById.get(activeSessionId)?.practice_plan_id || ''}
                          disabled={sessionSaving}
                          onChange={async (event) => {
                            const nextValue = event.target.value || null
                            const ok = await updateSession(activeSessionId, {
                              practice_plan_id: nextValue,
                            })
                            if (ok) {
                              setToast('Practice plan updated')
                            }
                          }}
                        >
                          <option value="">No plan linked</option>
                          {practicePlans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.title}
                            </option>
                          ))}
                        </select>
                        {sessionById.get(activeSessionId)?.practice_plan_id ? (
                          <a
                            href={`/coach/plans/${sessionById.get(activeSessionId)?.practice_plan_id}`}
                            className="mt-2 inline-flex text-xs font-semibold text-[#b80f0a] underline"
                          >
                            View practice plan
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                    {sessionById.get(activeSessionId)?.notes && (
                      <p><span className="font-semibold text-[#191919]">Notes:</span> {sessionById.get(activeSessionId)?.notes}</p>
                    )}
                  </div>

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

            {followupOpen && (
              <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4">
                <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Follow-up</p>
                      <p className="text-lg font-semibold text-[#191919]">
                        {followupName ? `Follow-up with ${followupName}` : 'Schedule follow-up'}
                      </p>
                      <p className="mt-1 text-xs text-[#4a4a4a]">
                        Create a quick reminder or task for this athlete.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeFollowupModal}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Title</span>
                      <input
                        value={followupForm.title}
                        onChange={(event) => setFollowupForm((prev) => ({ ...prev, title: event.target.value }))}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        placeholder="Follow-up title"
                      />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-[#191919]">Date</span>
                        <input
                          type="date"
                          value={followupForm.date}
                          onChange={(event) => setFollowupForm((prev) => ({ ...prev, date: event.target.value }))}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-[#191919]">Time</span>
                        <input
                          type="time"
                          value={followupForm.time}
                          onChange={(event) => setFollowupForm((prev) => ({ ...prev, time: event.target.value }))}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        />
                      </label>
                    </div>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Follow-up type</span>
                      <select
                        value={followupForm.type}
                        onChange={(event) => setFollowupForm((prev) => ({ ...prev, type: event.target.value }))}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      >
                        {['Check-in', 'Program update', 'Form review', 'Payment reminder', 'Scheduling'].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Notes</span>
                      <textarea
                        rows={3}
                        value={followupForm.note}
                        onChange={(event) => setFollowupForm((prev) => ({ ...prev, note: event.target.value }))}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        placeholder="Add context for the follow-up..."
                      />
                    </label>
                    {followupNotice ? <p className="text-xs text-[#b80f0a]">{followupNotice}</p> : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!followupForm.title.trim()) {
                          setFollowupNotice('Add a follow-up title.')
                          return
                        }
                        setToast(`Follow-up scheduled for ${followupName || 'athlete'}.`)
                        closeFollowupModal()
                      }}
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Save follow-up
                    </button>
                    <button
                      type="button"
                      onClick={closeFollowupModal}
                      className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <section className="glass-card border border-[#191919] bg-white p-4 sm:p-6">
              <h2 className="text-xl font-semibold text-[#191919]">Create task / reminder / session</h2>
              <p className="mt-2 text-sm text-[#4a4a4a]">Tag athletes, add location, and choose type.</p>
              <form className="mt-4 grid gap-4 lg:grid-cols-2 text-sm" onSubmit={(event) => event.preventDefault()}>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Title</label>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="Session or task title"
                    value={formData.title}
                    onChange={handleFormChange('title')}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Type</label>
                  <div className="flex flex-wrap gap-2">
                    {(['Task', 'Reminder', 'Training'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFormType(t)}
                        className={`rounded-full border px-3 py-1 font-semibold text-[#191919] ${
                          formType === t ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Date</label>
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                    value={formData.date}
                    onChange={handleFormChange('date')}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Time</label>
                  <input
                    type="time"
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                    value={formData.time}
                    onChange={handleFormChange('time')}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Tag athlete(s)</label>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="Tagged athletes or teams"
                    value={formData.athletes}
                    onChange={handleFormChange('athletes')}
                  />
                  <p className="text-xs text-[#4a4a4a]">Tagged athletes will be notified and see it on their calendar.</p>
                </div>
                {formType === 'Training' && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#4a4a4a]">Session format</label>
                    <div className="flex flex-wrap gap-2">
                      {(['in_person', 'online'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, meetingMode: mode }))}
                          className={`rounded-full border px-3 py-1 font-semibold text-[#191919] ${
                            formData.meetingMode === mode ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc]'
                          }`}
                        >
                          {mode === 'in_person' ? 'In-person' : 'Online'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {formType === 'Training' && formData.meetingMode === 'online' && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#4a4a4a]">Video provider</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, meetingProvider: 'google_meet' }))}
                        disabled={!googleConnected}
                        className={`rounded-full border px-3 py-1 font-semibold ${
                          formData.meetingProvider === 'google_meet'
                            ? 'border-[#191919] bg-[#f5f5f5] text-[#191919]'
                            : 'border-[#dcdcdc] text-[#191919]'
                        } ${!googleConnected ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        Google Meet
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, meetingProvider: 'zoom' }))}
                        disabled={!zoomConnected}
                        className={`rounded-full border px-3 py-1 font-semibold ${
                          formData.meetingProvider === 'zoom'
                            ? 'border-[#191919] bg-[#f5f5f5] text-[#191919]'
                            : 'border-[#dcdcdc] text-[#191919]'
                        } ${!zoomConnected ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        Zoom
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, meetingProvider: 'custom' }))}
                        className={`rounded-full border px-3 py-1 font-semibold ${
                          formData.meetingProvider === 'custom'
                            ? 'border-[#191919] bg-[#f5f5f5] text-[#191919]'
                            : 'border-[#dcdcdc] text-[#191919]'
                        }`}
                      >
                        Custom link
                      </button>
                    </div>
                    <p className="text-xs text-[#4a4a4a]">Connect Google Meet or Zoom in settings to auto-create links.</p>
                  </div>
                )}
                {formType === 'Training' && formData.meetingMode === 'online' && formData.meetingProvider === 'custom' && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#4a4a4a]">Meeting link</label>
                    <input
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                      placeholder="Paste a video link"
                      value={formData.meetingLink}
                      onChange={handleFormChange('meetingLink')}
                    />
                  </div>
                )}
                {(formType !== 'Training' || formData.meetingMode === 'in_person') && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#4a4a4a]">Location</label>
                    <input
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                      placeholder="Facility or address"
                      value={formData.location}
                      onChange={handleFormChange('location')}
                    />
                  </div>
                )}
                {formType === 'Training' && practicePlans.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#4a4a4a]">Practice plan</label>
                    <select
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                      value={formData.practicePlanId}
                      onChange={(event) =>
                        setFormData((prev) => ({ ...prev, practicePlanId: event.target.value }))
                      }
                    >
                      <option value="">No plan linked</option>
                      {practicePlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Notes</label>
                  <textarea
                    rows={3}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="Details, agenda, or reminders"
                    value={formData.notes}
                    onChange={handleFormChange('notes')}
                  />
                  <p className="text-[11px] text-[#4a4a4a]">Visible to tagged athletes when you notify them.</p>
                </div>
                {formNotice && (
                  <p className="md:col-span-2 text-xs text-[#4a4a4a]">{formNotice}</p>
                )}
                <div className="md:col-span-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSaveSession}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b80f0a]"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save to calendar'}
                  </button>
                  <button
                    type="button"
                    onClick={handleNotifyAthletes}
                    disabled={notifyLoading}
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                  >
                    {notifyLoading ? 'Notifying...' : 'Notify athletes'}
                  </button>
                </div>
              </form>
            </section>

          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
