'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import { getOrgTypeConfig, normalizeOrgType } from '@/lib/orgTypeConfig'

type SessionRow = {
  id: string
  start_time?: string | null
  end_time?: string | null
  title?: string | null
  coach_id?: string | null
  athlete_id?: string | null
  session_type?: string | null
  type?: string | null
  status?: string | null
  attendance_status?: string | null
  location?: string | null
  notes?: string | null
  duration_minutes?: number | null
  practice_plan_id?: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
}

type PracticePlan = {
  id: string
  title: string
}

type CalendarEvent = {
  id: string
  title: string
  dayKey: string
  startAt: string
  dayIndex: number
  startMinutes: number
  durationMinutes: number
  coachId: string | null
  coachName: string
  team: string
  type: string
  location: string
  rosterCount: number
  attendance: number
  status?: string | null
  notes?: string | null
  sessionId?: string
}

const teamOptions = ['Varsity', 'JV', 'Club', 'Travel']

const getMonday = (date: Date) => {
  const day = date.getDay()
  const diff = date.getDate() - ((day + 6) % 7)
  const monday = new Date(date)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export default function OrgCalendarPage() {
  const supabase = createClientComponentClient()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [coaches, setCoaches] = useState<ProfileRow[]>([])
  const [athletes, setAthletes] = useState<ProfileRow[]>([])
  const [practicePlans, setPracticePlans] = useState<PracticePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedTeams, setSelectedTeams] = useState<string[]>(['All teams'])
  const [selectedCoaches, setSelectedCoaches] = useState<string[]>(['All coaches'])
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['All types'])
  const [selectedLocations, setSelectedLocations] = useState<string[]>(['All locations'])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['All statuses'])
  const [orgType, setOrgType] = useState<string>('organization')
  const [customTeams, setCustomTeams] = useState<string[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null)
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')
  const [quickType, setQuickType] = useState('Training')
  const [quickDate, setQuickDate] = useState('')
  const [quickTime, setQuickTime] = useState('09:00')
  const [quickDuration, setQuickDuration] = useState('60')
  const [quickCoachId, setQuickCoachId] = useState('')
  const [quickAthleteId, setQuickAthleteId] = useState('')
  const [quickNotice, setQuickNotice] = useState('')
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [sessionNotice, setSessionNotice] = useState('')
  const [sessionSaving, setSessionSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [viewMode, setViewMode] = useState<'agenda' | 'week' | 'month'>('week')
  const [reminderSending, setReminderSending] = useState(false)
  const [notifySending, setNotifySending] = useState(false)
  const [rescheduleForm, setRescheduleForm] = useState({
    date: '',
    time: '',
    duration: '60',
  })

  useEffect(() => {
    if (!activeEvent) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [activeEvent])

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: coachRows } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'coach')

    const { data: athleteRows } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'athlete')

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .maybeSingle()

    if (membership?.org_id) {
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('org_type')
        .eq('id', membership.org_id)
        .maybeSingle()
      const organization = (orgRow || null) as { org_type?: string | null } | null
      if (organization?.org_type) {
        setOrgType(normalizeOrgType(organization.org_type))
      }
    }

    const { data: sessionRows } = await supabase
      .from('sessions')
      .select('id, start_time, end_time, title, coach_id, athlete_id, session_type, type, status, attendance_status, location, notes, duration_minutes, practice_plan_id')
      .order('start_time', { ascending: true })

    setCoaches((coachRows || []) as ProfileRow[])
    setAthletes((athleteRows || []) as ProfileRow[])
    setSessions((sessionRows || []) as SessionRow[])

    const planIds = Array.from(
      new Set((sessionRows || []).map((row) => row.practice_plan_id).filter(Boolean) as string[])
    )
    if (planIds.length > 0) {
      const { data: plans } = await supabase
        .from('practice_plans')
        .select('id, title')
        .in('id', planIds)
      setPracticePlans((plans || []) as PracticePlan[])
    } else {
      setPracticePlans([])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!quickCoachId && coaches.length > 0) {
      setQuickCoachId(coaches[0].id)
    }
    if (!quickAthleteId && athletes.length > 0) {
      setQuickAthleteId(athletes[0].id)
    }
  }, [athletes, coaches, quickAthleteId, quickCoachId])

  useEffect(() => {
    const channel = supabase
      .channel('org-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => loadData())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadData, supabase])

  const nameMap = useMemo(() => {
    const map = new Map<string, string>()
    coaches.forEach((coach) => {
      if (coach.full_name) map.set(coach.id, coach.full_name)
    })
    return map
  }, [coaches])

  const practicePlanMap = useMemo(() => {
    const map = new Map<string, PracticePlan>()
    practicePlans.forEach((plan) => map.set(plan.id, plan))
    return map
  }, [practicePlans])

  const [weekStart, setWeekStart] = useState<Date | null>(null)
  const [selectedDayKey, setSelectedDayKey] = useState('')

  useEffect(() => {
    const today = new Date()
    setWeekStart(getMonday(today))
    setSelectedDayKey(today.toISOString().slice(0, 10))
  }, [])

  const weekDays = useMemo(() => {
    if (!weekStart) return []
    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + index)
      return {
        label: date.toLocaleDateString(undefined, { weekday: 'short' }),
        date,
        dayKey: date.toISOString().slice(0, 10),
      }
    })
  }, [weekStart])

  useEffect(() => {
    if (!weekDays.some((day) => day.dayKey === selectedDayKey)) {
      setSelectedDayKey(weekDays[0]?.dayKey || selectedDayKey)
    }
  }, [selectedDayKey, weekDays])

  const handleWeekShift = (direction: 'prev' | 'next') => {
    setWeekStart((prev) => {
      if (!prev) return prev
      const nextDate = new Date(prev)
      nextDate.setDate(prev.getDate() + (direction === 'next' ? 7 : -7))
      const nextWeekStart = getMonday(nextDate)
      setSelectedDayKey(nextWeekStart.toISOString().slice(0, 10))
      return nextWeekStart
    })
  }

const formatMinutes = (minutes: number) => {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`
}

const formatGoogleDate = (date: Date) =>
  date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

const buildGoogleCalendarUrl = (session: SessionRow, planTitle?: string) => {
  if (!session.start_time) return null
  const start = new Date(session.start_time)
  if (Number.isNaN(start.getTime())) return null
  const end = session.end_time ? new Date(session.end_time) : new Date(start.getTime() + 60 * 60 * 1000)
  const endDate = Number.isNaN(end.getTime()) ? new Date(start.getTime() + 60 * 60 * 1000) : end
  const title = session.title || session.session_type || session.type || 'Session'
  const details = [session.notes, planTitle ? `Practice plan: ${planTitle}` : null]
    .filter(Boolean)
    .join('\n')
  const location = session.location || ''
  const dates = `${formatGoogleDate(start)}/${formatGoogleDate(endDate)}`
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    title
  )}&dates=${dates}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`
}

const getStatusMeta = (status?: string | null) => {
  const value = String(status || 'Scheduled').trim()
  const normalized = value.toLowerCase()
  if (normalized === 'confirmed') return { label: 'Confirmed', dotClass: 'bg-[#1f9d63]' }
  if (normalized === 'canceled' || normalized === 'cancelled') return { label: 'Canceled', dotClass: 'bg-[#b80f0a]' }
  if (normalized === 'rescheduled') return { label: 'Rescheduled', dotClass: 'bg-[#b86a0a]' }
  if (normalized === 'scheduled') return { label: 'Scheduled', dotClass: 'bg-[#8a8a8a]' }
  return { label: value || 'Scheduled', dotClass: 'bg-[#8a8a8a]' }
}

const formatAttendanceLabel = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Not marked'
  if (normalized === 'present') return 'Present'
  if (normalized === 'absent') return 'Absent'
  if (normalized === 'excused') return 'Excused'
  return normalized
}

const getTypeMeta = (value: string) => {
  const normalized = value.toLowerCase()
  if (normalized.includes('practice')) return { bg: 'bg-[#e8f4ff]', text: 'text-[#2563eb]', border: 'border-[#93c5fd]' }
  if (normalized.includes('training')) return { bg: 'bg-[#ecfdf3]', text: 'text-[#15803d]', border: 'border-[#86efac]' }
  if (normalized.includes('game') || normalized.includes('match')) return { bg: 'bg-[#fff7ed]', text: 'text-[#b45309]', border: 'border-[#fdba74]' }
  if (normalized.includes('meeting')) return { bg: 'bg-[#f5f3ff]', text: 'text-[#6d28d9]', border: 'border-[#c4b5fd]' }
  return { bg: 'bg-[#f4f4f4]', text: 'text-[#4a4a4a]', border: 'border-[#dcdcdc]' }
}

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

  const events = useMemo(() => {
    return sessions
      .map((session) => {
        const start = session.start_time ? new Date(session.start_time) : null
        if (!start || Number.isNaN(start.getTime())) return null
        const dayIndex = Math.max(0, (start.getDay() + 6) % 7)
        const dayKey = start.toISOString().slice(0, 10)
        const startMinutes = start.getHours() * 60 + start.getMinutes()
        const end = session.end_time ? new Date(session.end_time) : null
        const durationMinutes = end && !Number.isNaN(end.getTime())
          ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000))
          : session.duration_minutes || 60
        const rawType = String(session.session_type || session.type || 'Session')
        const typeLabel = rawType ? `${rawType.charAt(0).toUpperCase()}${rawType.slice(1)}` : 'Session'
        const coachName = session.coach_id ? nameMap.get(session.coach_id) || 'Coach' : 'Coach'
        return {
          id: session.id,
          sessionId: session.id,
          title: session.title || 'Session',
          dayKey,
          startAt: start.toISOString(),
          dayIndex,
          startMinutes,
          durationMinutes,
          coachId: session.coach_id || null,
          coachName,
          team: 'Org',
          type: typeLabel,
          location: session.location || 'TBD',
          rosterCount: 0,
          attendance: 0,
          status: session.status || 'Scheduled',
          notes: session.notes || undefined,
        }
      })
      .filter(Boolean) as CalendarEvent[]
  }, [nameMap, sessions])


  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matches =
          event.title.toLowerCase().includes(query) ||
          event.team.toLowerCase().includes(query) ||
          event.coachName.toLowerCase().includes(query)
        if (!matches) return false
      }
      if (!selectedTeams.includes('All teams') && !selectedTeams.includes(event.team)) return false
      if (!selectedCoaches.includes('All coaches') && !selectedCoaches.includes(event.coachName)) return false
      if (!selectedTypes.includes('All types') && !selectedTypes.includes(event.type)) return false
      if (!selectedLocations.includes('All locations') && !selectedLocations.includes(event.location)) return false
      if (
        !selectedStatuses.includes('All statuses') &&
        !selectedStatuses.includes(String(event.status || 'Scheduled'))
      )
        return false
      return true
    })
  }, [events, searchQuery, selectedCoaches, selectedTeams, selectedTypes, selectedLocations, selectedStatuses])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    return events
      .map((event) => {
        const start = new Date(event.startAt)
        if (Number.isNaN(start.getTime())) return null
        return {
          id: event.id,
          title: event.title,
          start,
          coachName: event.coachName,
          type: event.type,
          status: event.status || 'Scheduled',
          location: event.location || 'TBD',
        }
      })
      .filter((event): event is NonNullable<typeof event> => event !== null)
      .filter((event) => event.start >= now)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 5)
  }, [events])

  const todayKey = new Date().toISOString().slice(0, 10)

  const selectedDay = useMemo(() => {
    return weekDays.find((day) => day.dayKey === selectedDayKey) || weekDays[0]
  }, [selectedDayKey, weekDays])

  const selectedDayEvents = useMemo(() => {
    return filteredEvents
      .filter((event) => event.dayKey === selectedDay?.dayKey)
      .sort((a, b) => a.startMinutes - b.startMinutes)
  }, [filteredEvents, selectedDay])

  const weekRangeLabel = useMemo(() => {
    if (!weekDays.length) return ''
    return `${weekDays[0].date.toLocaleDateString()} - ${weekDays[6].date.toLocaleDateString()}`
  }, [weekDays])

  const nextEvent = useMemo(() => {
    const nowTime = Date.now()
    return (
      [...filteredEvents]
        .filter((event) => new Date(event.startAt).getTime() >= nowTime)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0] || null
    )
  }, [filteredEvents])

  const summaryStats = useMemo(() => {
    const now = new Date()
    const upcomingCount = events.filter((event) => {
      const start = new Date(event.startAt)
      return start >= now
    }).length
    const cancellations = sessions.filter((session) =>
      String(session.status || '').toLowerCase().includes('cancel')
    ).length
    const attendanceRows = sessions.filter((session) => session.attendance_status)
    const attendancePresent = attendanceRows.filter((session) =>
      String(session.attendance_status || '').toLowerCase() === 'present'
    ).length
    const attendancePercent = attendanceRows.length
      ? Math.round((attendancePresent / attendanceRows.length) * 100)
      : 0
    const nextEventLabel = nextEvent
      ? `${formatMinutes(nextEvent.startMinutes)} · ${nextEvent.title}`
      : '—'
    return [
      { label: 'Upcoming sessions', value: upcomingCount },
      { label: 'Cancellations', value: cancellations },
      { label: 'Attendance %', value: `${attendancePercent}%` },
      { label: 'Next event', value: nextEventLabel },
    ]
  }, [events, nextEvent, sessions])

  const orgConfig = useMemo(() => getOrgTypeConfig(orgType), [orgType])
  const sessionTypeOptions = useMemo(() => orgConfig.sessionTypes, [orgConfig.sessionTypes])
  const typeOptions = useMemo(() => ['All types', ...sessionTypeOptions], [sessionTypeOptions])
  const availableCoaches = useMemo(() => {
    if (coaches.length === 0) return []
    return coaches.map((coach) => coach.full_name || 'Coach')
  }, [coaches])

  const locationOptions = useMemo(() => {
    const locations = Array.from(
      new Set(sessions.map((session) => session.location || 'TBD').filter(Boolean))
    )
    return ['All locations', ...locations]
  }, [sessions])

  const statusOptions = useMemo(() => {
    const statuses = Array.from(
      new Set(sessions.map((session) => session.status || 'Scheduled'))
    )
    return ['All statuses', ...statuses]
  }, [sessions])

  const teamFilterOptions = useMemo(() => {
    if (orgType === 'school') {
      return ['Freshman', 'JV', 'Varsity']
    }
    if (orgType === 'club' || orgType === 'travel' || orgType === 'academy') {
      return customTeams.length ? customTeams : ['Team A', 'Team B']
    }
    return teamOptions
  }, [customTeams, orgType])

  useEffect(() => {
    if (sessionTypeOptions.length === 0) return
    if (!sessionTypeOptions.includes(quickType)) {
      setQuickType(sessionTypeOptions[0])
    }
  }, [quickType, sessionTypeOptions])

  const toggleSelection = (value: string, list: string[], setter: (value: string[]) => void, allLabel: string) => {
    if (value === allLabel) {
      setter([allLabel])
      return
    }
    const next = list.includes(value) ? list.filter((item) => item !== value) : [...list.filter((item) => item !== allLabel), value]
    setter(next.length ? next : [allLabel])
  }

  const closeActiveEvent = () => {
    setActiveEvent(null)
    setRescheduleOpen(false)
    setSessionNotice('')
  }

  const handleSendReminders = async () => {
    if (reminderSending) return
    setReminderSending(true)
    try {
      const response = await fetch('/api/org/calendar/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'org', total: filteredEvents.length }),
      })
      if (!response.ok) throw new Error('Failed')
      const data = await response.json().catch(() => null)
      setToast(data?.message || 'Reminders queued')
    } catch {
      setToast('Unable to send reminders')
    } finally {
      setReminderSending(false)
    }
  }

  const handleNotifyTeams = async () => {
    if (notifySending) return
    setNotifySending(true)
    try {
      const response = await fetch('/api/org/calendar/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'org', total: filteredEvents.length }),
      })
      if (!response.ok) throw new Error('Failed')
      const data = await response.json().catch(() => null)
      setToast(data?.message || 'Notifications sent')
    } catch {
      setToast('Unable to send notifications')
    } finally {
      setNotifySending(false)
    }
  }

  const handleQuickCreate = async () => {
    setQuickNotice('')
    if (!quickCoachId || !quickAthleteId) {
      setQuickNotice('Select a coach and athlete to create a session.')
      return
    }
    if (!quickDate || !quickTime) {
      setQuickNotice('Select a date and time.')
      return
    }
    const startTime = new Date(`${quickDate}T${quickTime}`)
    if (Number.isNaN(startTime.getTime())) {
      setQuickNotice('Enter a valid date and time.')
      return
    }

    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coach_id: quickCoachId,
        athlete_id: quickAthleteId,
        start_time: startTime.toISOString(),
        duration_minutes: Number(quickDuration),
        session_type: quickType.toLowerCase(),
        status: 'Scheduled',
        title: quickTitle.trim() || 'New session',
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      setQuickNotice(data?.error || 'Unable to create session.')
      return
    }

    setQuickTitle('')
    setQuickNotice('')
    setShowQuickCreate(false)
    setToast('Event created')
    await loadData()
  }

  const handleAddTeam = () => {
    const trimmed = newTeamName.trim()
    if (!trimmed) return
    setCustomTeams((prev) => Array.from(new Set([...prev, trimmed])))
    setNewTeamName('')
  }

  const sessionById = useMemo(() => {
    const map = new Map<string, SessionRow>()
    sessions.forEach((session) => map.set(session.id, session))
    return map
  }, [sessions])

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
      await loadData()
      setSessionSaving(false)
      return true
    },
    [loadData]
  )

  const openEvent = useCallback(
    (event: CalendarEvent) => {
      setActiveEvent(event)
      setRescheduleOpen(false)
      setSessionNotice('')
      const session = event.sessionId ? sessionById.get(event.sessionId) : null
      if (session?.start_time) {
        const start = new Date(session.start_time)
        const end = session.end_time ? new Date(session.end_time) : null
        const duration = end && !Number.isNaN(end.getTime())
          ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000))
          : session?.duration_minutes || 60
        setRescheduleForm({
          date: formatDateInput(session.start_time),
          time: formatTimeInput(session.start_time),
          duration: String(duration),
        })
      }
    },
    [sessionById]
  )

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Calendar</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">See sessions across all teams and coaches.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="flex items-center gap-1 rounded-full border border-[#191919] bg-white p-1 text-xs">
              {(['month', 'week', 'agenda'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-full px-3 py-1 font-semibold transition ${
                    viewMode === mode ? 'bg-[#191919] text-white' : 'text-[#191919]'
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            <input
              className="h-10 rounded-full border border-[#191919] bg-white px-4 text-sm"
              placeholder="Search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              aria-pressed={showFilters}
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
            >
              Filters
            </button>
            <Link
              href="/org/settings#export-center"
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Go to export center
            </Link>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="space-y-6">
            <div className="sticky top-4 z-10 rounded-3xl border border-[#191919] bg-white/95 p-4 shadow-sm backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Today</p>
                  <p className="mt-1 text-sm text-[#191919]">
                    {nextEvent
                      ? `${formatMinutes(nextEvent.startMinutes)} · ${nextEvent.title}`
                      : 'No upcoming events scheduled.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSendReminders}
                    disabled={reminderSending}
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] disabled:opacity-60"
                  >
                    {reminderSending ? 'Sending...' : 'Send reminders'}
                  </button>
                  <button
                    type="button"
                    onClick={handleNotifyTeams}
                    disabled={notifySending}
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] disabled:opacity-60"
                  >
                    {notifySending ? 'Notifying...' : 'Notify teams'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQuickCreate(true)}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Add event
                  </button>
                </div>
              </div>
            </div>

            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {summaryStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{stat.label}</p>
                  <p
                    className={`mt-3 font-semibold text-[#191919] ${
                      String(stat.value).length > 12 ? 'text-base' : 'text-2xl'
                    }`}
                  >
                    {stat.value}
                  </p>
                </div>
              ))}
            </section>

            {showFilters && (
              <div className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Filters</p>
                    <p className="mt-2 text-sm text-[#4a4a4a]">Narrow by team, coach, type, location, or status.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFilters(false)}
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-5">
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Teams</p>
                    <div className="space-y-2">
                      {['All teams', ...teamFilterOptions].map((team) => (
                        <label key={team} className="flex items-center gap-2 text-xs text-[#4a4a4a]">
                          <input
                            type="checkbox"
                            checked={selectedTeams.includes(team)}
                            onChange={() => toggleSelection(team, selectedTeams, setSelectedTeams, 'All teams')}
                          />
                          <span>{team}</span>
                        </label>
                      ))}
                    </div>
                    {(orgType === 'club' || orgType === 'travel') && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          className="w-full rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-xs"
                          placeholder="Add team name"
                          value={newTeamName}
                          onChange={(event) => setNewTeamName(event.target.value)}
                        />
                        <button
                          type="button"
                          className="rounded-full border border-[#191919] px-3 py-1 text-[10px] font-semibold text-[#191919]"
                          onClick={handleAddTeam}
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Coaches</p>
                    <div className="space-y-2">
                      {['All coaches', ...availableCoaches].map((coach) => (
                        <label key={coach} className="flex items-center gap-2 text-xs text-[#4a4a4a]">
                          <input
                            type="checkbox"
                            checked={selectedCoaches.includes(coach)}
                            onChange={() => toggleSelection(coach, selectedCoaches, setSelectedCoaches, 'All coaches')}
                          />
                          <span>{coach}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Events</p>
                    <div className="space-y-2">
                      {typeOptions.map((type) => (
                        <label key={type} className="flex items-center gap-2 text-xs text-[#4a4a4a]">
                          <input
                            type="checkbox"
                            checked={selectedTypes.includes(type)}
                            onChange={() => toggleSelection(type, selectedTypes, setSelectedTypes, 'All types')}
                          />
                          <span>{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Locations</p>
                    <div className="space-y-2">
                      {locationOptions.map((location) => (
                        <label key={location} className="flex items-center gap-2 text-xs text-[#4a4a4a]">
                          <input
                            type="checkbox"
                            checked={selectedLocations.includes(location)}
                            onChange={() => toggleSelection(location, selectedLocations, setSelectedLocations, 'All locations')}
                          />
                          <span>{location}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Status</p>
                    <div className="space-y-2">
                      {statusOptions.map((status) => (
                        <label key={status} className="flex items-center gap-2 text-xs text-[#4a4a4a]">
                          <input
                            type="checkbox"
                            checked={selectedStatuses.includes(status)}
                            onChange={() => toggleSelection(status, selectedStatuses, setSelectedStatuses, 'All statuses')}
                          />
                          <span>{status}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'agenda' && (
              <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Agenda</p>
                      <h2 className="mt-2 text-lg font-semibold text-[#191919]">
                        {selectedDay
                          ? selectedDay.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
                          : 'Select a day'}
                      </h2>
                      <p className="mt-1 text-xs text-[#4a4a4a]">{selectedDayEvents.length} events</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    {loading ? (
                      <LoadingState label="Loading sessions..." />
                    ) : selectedDayEvents.length === 0 ? (
                      <EmptyState title="No events for this day." description="Pick another day or add a new event." />
                    ) : (
                      selectedDayEvents.map((event) => {
                        const status = getStatusMeta(event.status)
                        const planTitle = event.sessionId
                          ? practicePlanMap.get(sessionById.get(event.sessionId)?.practice_plan_id || '')?.title
                          : undefined
                        const typeMeta = getTypeMeta(event.type)
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => openEvent(event)}
                            className="group relative flex w-full items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-left text-sm transition hover:border-[#b80f0a]"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${status.dotClass}`} />
                              <span className="text-xs text-[#4a4a4a]">{formatMinutes(event.startMinutes)}</span>
                              <div className="min-w-0">
                                <span className="block truncate font-semibold text-[#191919]">{event.title}</span>
                                {planTitle ? (
                                  <span className="block truncate text-[11px] text-[#4a4a4a]">Plan: {planTitle}</span>
                                ) : null}
                              </div>
                            </div>
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${typeMeta.border} ${typeMeta.text}`}>
                              {event.type}
                            </span>
                            <div className="pointer-events-none absolute right-4 top-full z-10 mt-2 hidden w-56 rounded-2xl border border-[#e5e5e5] bg-white p-3 text-xs text-[#4a4a4a] shadow-lg group-hover:block">
                              <p className="font-semibold text-[#191919]">{event.coachName}</p>
                              <p className="mt-1">{event.location}</p>
                              <p className="mt-1">Status: {status.label}</p>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </section>

                <aside className="glass-card border border-[#191919] bg-white p-5 lg:sticky lg:top-6">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Mini week</p>
                      <p className="mt-1 text-sm font-semibold text-[#191919]">{weekRangeLabel}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-full border border-[#191919] px-2 py-1 text-xs font-semibold text-[#191919]"
                        onClick={() => handleWeekShift('prev')}
                      >
                        ←
                      </button>
                      <button
                        className="rounded-full border border-[#191919] px-2 py-1 text-xs font-semibold text-[#191919]"
                        onClick={() => handleWeekShift('next')}
                      >
                        →
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-[#4a4a4a]">
                    {weekDays.map((day) => {
                      const isSelected = day.dayKey === selectedDayKey
                      const isToday = day.dayKey === todayKey
                      return (
                        <button
                          key={day.dayKey}
                          type="button"
                          onClick={() => setSelectedDayKey(day.dayKey)}
                          className={`flex w-full min-h-[56px] flex-col items-center justify-center rounded-2xl border px-2 py-2.5 text-[11px] font-semibold leading-tight ${
                            isSelected ? 'border-[#b80f0a] text-[#b80f0a]' : 'border-[#dcdcdc] text-[#4a4a4a]'
                          } ${isToday ? 'bg-[#191919] text-white' : 'bg-white'}`}
                        >
                          <span className="block whitespace-nowrap text-[9px] uppercase tracking-[0.12em] leading-none">{day.label}</span>
                          <span className="mt-1 block text-[12px] leading-none">{day.date.toLocaleDateString(undefined, { day: 'numeric' })}</span>
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date()
                      setWeekStart(getMonday(now))
                      setSelectedDayKey(now.toISOString().slice(0, 10))
                    }}
                    className="mt-4 w-full rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]"
                  >
                    Today
                  </button>
                </aside>
              </div>
            )}

            {viewMode === 'week' && (
              <section className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Week</p>
                    <p className="mt-2 text-lg font-semibold text-[#191919]">{weekRangeLabel}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={() => handleWeekShift('prev')}
                    >
                      Previous
                    </button>
                    <button
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={() => handleWeekShift('next')}
                    >
                      Next
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-7">
                  {weekDays.map((day) => {
                    const dayEvents = filteredEvents
                      .filter((event) => event.dayKey === day.dayKey)
                      .sort((a, b) => a.startMinutes - b.startMinutes)
                    return (
                      <div key={day.dayKey} className="rounded-2xl border border-[#e5e5e5] bg-white p-3">
                        <p className="text-xs font-semibold text-[#191919]">
                          {day.label} {day.date.getDate()}
                        </p>
                        <div className="mt-2 space-y-2 text-xs">
                          {dayEvents.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[#e5e5e5] px-2 py-3 text-[11px] text-[#9a9a9a]">
                              No events
                            </div>
                          ) : (
                            dayEvents.map((event) => {
                              const typeMeta = getTypeMeta(event.type)
                              return (
                                <button
                                  key={event.id}
                                  type="button"
                                  onClick={() => openEvent(event)}
                                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-2 py-2 text-left ${typeMeta.border} ${typeMeta.bg}`}
                                >
                                  <span className="truncate font-semibold text-[#191919]">{event.title}</span>
                                  <span className={`text-[10px] font-semibold ${typeMeta.text}`}>
                                    {formatMinutes(event.startMinutes)}
                                  </span>
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {viewMode === 'month' && (
              <section className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Month</p>
                    <p className="mt-2 text-lg font-semibold text-[#191919]">
                      {selectedDay?.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={() => handleWeekShift('prev')}
                    >
                      Previous
                    </button>
                    <button
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={() => handleWeekShift('next')}
                    >
                      Next
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-7 gap-2 text-xs text-[#4a4a4a]">
                  {weekDays.map((day) => (
                    <div key={`${day.dayKey}-label`} className="text-center text-[10px] uppercase tracking-[0.2em]">
                      {day.label}
                    </div>
                  ))}
                  {(() => {
                    const base = selectedDay?.date || new Date()
                    const monthStart = new Date(base.getFullYear(), base.getMonth(), 1)
                    const start = getMonday(monthStart)
                    return Array.from({ length: 42 }).map((_, index) => {
                      const date = new Date(start)
                      date.setDate(start.getDate() + index)
                      const dayKey = date.toISOString().slice(0, 10)
                      const dayEvents = filteredEvents.filter((event) => event.dayKey === dayKey)
                      const isCurrentMonth = date.getMonth() === base.getMonth()
                      const isSelected = dayKey === selectedDayKey
                      return (
                        <button
                          key={dayKey}
                          type="button"
                          onClick={() => setSelectedDayKey(dayKey)}
                          className={`flex min-h-[72px] flex-col items-start justify-between rounded-2xl border px-2 py-2 text-left ${
                            isSelected ? 'border-[#b80f0a]' : 'border-[#e5e5e5]'
                          } ${isCurrentMonth ? 'bg-white' : 'bg-[#f5f5f5] text-[#9a9a9a]'}`}
                        >
                          <span className="text-[11px] font-semibold">{date.getDate()}</span>
                          {dayEvents.length > 0 ? (
                            <span className="mt-2 rounded-full bg-[#191919] px-2 py-0.5 text-[10px] font-semibold text-white">
                              {dayEvents.length} events
                            </span>
                          ) : (
                            <span className="mt-2 text-[10px] text-[#b0b0b0]">—</span>
                          )}
                        </button>
                      )
                    })
                  })()}
                </div>
              </section>
            )}

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Upcoming</p>
                  <h2 className="mt-2 text-lg font-semibold text-[#191919]">Next events</h2>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Upcoming sessions across the organization.</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {upcomingEvents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f9f9f9] p-4 text-xs text-[#4a4a4a]">
                    No upcoming events yet. Add a session to populate the calendar.
                  </div>
                ) : (
                  <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                    {upcomingEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => {
                          const match = filteredEvents.find((item) => item.id === event.id)
                          if (match) openEvent(match)
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-left text-sm transition hover:border-[#b80f0a]"
                      >
                        <div>
                          <p className="font-semibold text-[#191919]">{event.title}</p>
                          <p className="mt-1 text-xs text-[#4a4a4a]">
                            {event.coachName} · {event.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {event.start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          </p>
                          <p className="mt-1 text-xs text-[#9a9a9a]">{event.location}</p>
                          {(() => {
                            const session = sessionById.get(event.id)
                            const planTitle = session?.practice_plan_id
                              ? practicePlanMap.get(session.practice_plan_id || '')?.title
                              : undefined
                            return planTitle ? (
                              <p className="mt-1 text-xs text-[#4a4a4a]">Plan: {planTitle}</p>
                            ) : null
                          })()}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-[11px] font-semibold text-[#4a4a4a]">
                            {event.status}
                          </span>
                          <span
                            className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
                              getTypeMeta(event.type).border
                            } ${getTypeMeta(event.type).text}`}
                          >
                            {event.type}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
        {showQuickCreate && (
          <div className="fixed inset-0 z-[480] flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">New event</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Add to calendar</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickCreate(false)}
                  className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                >
                  Close
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <select
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  value={quickCoachId}
                  onChange={(event) => setQuickCoachId(event.target.value)}
                >
                  <option value="">Select coach</option>
                  {coaches.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.full_name || 'Coach'}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  value={quickAthleteId}
                  onChange={(event) => setQuickAthleteId(event.target.value)}
                >
                  <option value="">Select athlete</option>
                  {athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.full_name || 'Athlete'}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  placeholder="Event title"
                  value={quickTitle}
                  onChange={(event) => setQuickTitle(event.target.value)}
                />
                <select
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  value={quickType}
                  onChange={(event) => setQuickType(event.target.value)}
                >
                  {sessionTypeOptions.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
                <input
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  type="date"
                  value={quickDate}
                  onChange={(event) => setQuickDate(event.target.value)}
                />
                <input
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  type="time"
                  value={quickTime}
                  onChange={(event) => setQuickTime(event.target.value)}
                />
                <select
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  value={quickDuration}
                  onChange={(event) => setQuickDuration(event.target.value)}
                >
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">60 min</option>
                  <option value="90">90 min</option>
                </select>
                {quickNotice && (
                  <p className="text-xs text-[#4a4a4a]">{quickNotice}</p>
                )}
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-white"
                    onClick={handleQuickCreate}
                  >
                    Create event
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-4 py-2 text-[#191919]"
                    onClick={() => setShowQuickCreate(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeEvent && (
          <div
            className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 p-6"
            onClick={closeActiveEvent}
          >
            {(() => {
              const status = getStatusMeta(activeEvent.status)
              return (
                <div
                  className="flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[#191919] bg-white shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-4 border-b border-[#e5e5e5] p-6">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Manage event</p>
                      <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{activeEvent.title}</h2>
                      <div className="mt-3 flex items-center gap-2 text-sm text-[#4a4a4a]">
                        <span className={`h-2 w-2 rounded-full ${status.dotClass}`} />
                        <span>{status.label}</span>
                      </div>
                    </div>
                    <button
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={closeActiveEvent}
                    >
                      Close
                    </button>
                  </div>
                  <div className="max-h-[calc(100vh-10rem)] flex-1 overflow-y-auto p-6">
                    <div className="space-y-2 text-sm text-[#4a4a4a]">
                      <p><span className="font-semibold text-[#191919]">Time:</span> {formatMinutes(activeEvent.startMinutes)} - {formatMinutes(activeEvent.startMinutes + activeEvent.durationMinutes)}</p>
                      <p><span className="font-semibold text-[#191919]">Type:</span> {activeEvent.type}</p>
                      <p><span className="font-semibold text-[#191919]">Team:</span> {activeEvent.team}</p>
                      <p><span className="font-semibold text-[#191919]">Coach:</span> {activeEvent.coachName}</p>
                      <p><span className="font-semibold text-[#191919]">Location:</span> {activeEvent.location}</p>
                      {activeEvent.sessionId && sessionById.get(activeEvent.sessionId)?.practice_plan_id && (
                        <p>
                          <span className="font-semibold text-[#191919]">Practice plan:</span>{' '}
                          {practicePlanMap.get(sessionById.get(activeEvent.sessionId)?.practice_plan_id || '')?.title || 'Linked plan'}
                        </p>
                      )}
                      {activeEvent.sessionId && (
                        <p>
                          <span className="font-semibold text-[#191919]">Attendance:</span>{' '}
                          {formatAttendanceLabel(sessionById.get(activeEvent.sessionId)?.attendance_status)}
                        </p>
                      )}
                      {activeEvent.notes && (
                        <p><span className="font-semibold text-[#191919]">Notes:</span> {activeEvent.notes}</p>
                      )}
                      {activeEvent.sessionId && (
                        (() => {
                          const session = sessionById.get(activeEvent.sessionId)
                          const planTitle = session?.practice_plan_id
                            ? practicePlanMap.get(session.practice_plan_id || '')?.title
                            : undefined
                          const url = session ? buildGoogleCalendarUrl(session, planTitle) : null
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
                    </div>
                    {rescheduleOpen && (
                      <div className="mt-4 rounded-2xl border border-[#e5e5e5] bg-[#f5f5f5] p-4 text-sm">
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
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                          <button
                            type="button"
                            disabled={sessionSaving}
                            onClick={async () => {
                              if (!activeEvent.sessionId) return
                              if (!rescheduleForm.date || !rescheduleForm.time) {
                                setSessionNotice('Add a new date and time.')
                                return
                              }
                              const startTime = new Date(`${rescheduleForm.date}T${rescheduleForm.time}`)
                              if (Number.isNaN(startTime.getTime())) {
                                setSessionNotice('Invalid date or time.')
                                return
                              }
                              const ok = await updateSession(activeEvent.sessionId, {
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
                  </div>
                  <div className="border-t border-[#e5e5e5] p-6">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
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
                          if (!activeEvent.sessionId) return
                          const ok = await updateSession(activeEvent.sessionId, { status: 'Canceled' })
                          if (ok) {
                            setSessionNotice('Session canceled.')
                            setToast('Session canceled')
                            setActiveEvent(null)
                            setRescheduleOpen(false)
                          }
                        }}
                        className="rounded-full bg-[#191919] px-4 py-2 text-white disabled:opacity-60"
                      >
                        Cancel session
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
