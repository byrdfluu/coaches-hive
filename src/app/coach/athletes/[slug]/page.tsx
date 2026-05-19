'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import MetricsChart from '@/components/MetricsChart'
import LogMetricModal from '@/components/LogMetricModal'

type AthleteProfile = {
  id: string
  athlete_profile_id?: string | null
  full_name: string | null
  email: string | null
  avatar_url: string | null
  bio: string | null
  athlete_sport: string | null
  athlete_location: string | null
  athlete_season: string | null
  athlete_grade_level: string | null
  athlete_birthdate: string | null
  guardian_name: string | null
  guardian_email: string | null
  guardian_phone: string | null
}

type Booking = {
  id: string
  title: string | null
  start_time: string | null
  status: string | null
  duration_minutes: number | null
}

type AthleteMetric = {
  athlete_id: string
  label: string
  value: string
  unit?: string | null
}

type AthleteResult = {
  athlete_id: string
  title: string
  event_date?: string | null
  placement?: string | null
  detail?: string | null
}

type AthleteMedia = {
  athlete_id: string
  title?: string | null
  media_url: string
  media_type?: string | null
}

type CoachNote = {
  id: string
  title: string
  body: string
  created_at: string
  type: string
}

type RosterAthlete = {
  key: string
  athleteId?: string
  subProfileId?: string | null
  name: string
  status: string
  label: string
  descriptor: string
  initials: string
  href: string
}

const tabs = ['Overview', 'Training', 'Metrics', 'Notes', 'Documents', 'Settings']

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

const toDisplayName = (fullName?: string | null, email?: string | null) => {
  const name = String(fullName || '').trim()
  if (name) return name
  const emailValue = String(email || '').trim()
  if (!emailValue) return 'Athlete'
  return emailValue.split('@')[0].trim() || 'Athlete'
}

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'AT'

const formatDate = (value?: string | null) => {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBD'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const getDaysUntil = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.ceil((date.getTime() - Date.now()) / 86400000)
}

const buildAthleteHref = (name: string, athleteId?: string, subProfileId?: string | null) =>
  `/coach/athletes/${slugify(name)}?${new URLSearchParams({
    ...(athleteId ? { athlete_id: athleteId } : {}),
    ...(subProfileId ? { athlete_profile_id: subProfileId } : {}),
  }).toString()}`

export default function CoachAthleteDynamicPage() {
  const supabase = createClientComponentClient()
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = String(params.slug || '')
  const requestedAthleteId = String(searchParams.get('athlete_id') || '').trim()
  const requestedSubProfileId = String(searchParams.get('athlete_profile_id') || searchParams.get('sub_profile_id') || '').trim()
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [rosterLoading, setRosterLoading] = useState(true)
  const [roster, setRoster] = useState<RosterAthlete[]>([])
  const [rosterSearch, setRosterSearch] = useState('')
  const [sessions, setSessions] = useState<Booking[]>([])
  const [notes, setNotes] = useState<CoachNote[]>([])
  const [metrics, setMetrics] = useState<AthleteMetric[]>([])
  const [results, setResults] = useState<AthleteResult[]>([])
  const [media, setMedia] = useState<AthleteMedia[]>([])
  const [visibility, setVisibility] = useState<Record<string, string>>({})
  const [snapshots, setSnapshots] = useState<Array<{ id: string; metric_label: string; value: string; unit?: string | null; recorded_at: string }>>([])
  const [activeTab, setActiveTab] = useState('Overview')
  const [logMetricOpen, setLogMetricOpen] = useState(false)
  const [metricsImportNotice, setMetricsImportNotice] = useState('')
  const metricsImportRef = useRef<HTMLInputElement | null>(null)
  const resolvedAthleteIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    const loadRoster = async () => {
      setRosterLoading(true)
      const membershipResponse = await fetch('/api/memberships', { cache: 'no-store' })
      if (!membershipResponse.ok) {
        if (active) setRosterLoading(false)
        return
      }
      const payload = await membershipResponse.json().catch(() => ({ links: [] }))
      const links: Array<{
        athlete_id?: string
        status?: string | null
        profiles?: { id: string; full_name: string | null; email?: string | null } | null
        sub_profiles?: Array<{ id: string; name: string; sport?: string | null }>
      }> = Array.isArray(payload.links) ? payload.links : []

      const rows = links.flatMap((link) => {
        const athleteId = link.athlete_id || undefined
        const baseName = toDisplayName(link.profiles?.full_name, link.profiles?.email)
        const status = link.status || 'Active'
        const mainRow: RosterAthlete = {
          key: `${athleteId || baseName}:main`,
          athleteId,
          subProfileId: null,
          name: baseName,
          status,
          label: status,
          descriptor: 'Main profile',
          initials: getInitials(baseName),
          href: buildAthleteHref(baseName, athleteId, null),
        }
        const subRows = (link.sub_profiles || []).map((subProfile) => {
          const subName = String(subProfile.name || '').trim() || baseName
          return {
            key: `${athleteId || baseName}:${subProfile.id}`,
            athleteId,
            subProfileId: subProfile.id,
            name: subName,
            status,
            label: 'Linked athlete',
            descriptor: subProfile.sport || 'General',
            initials: getInitials(subName),
            href: buildAthleteHref(subName, athleteId, subProfile.id),
          } satisfies RosterAthlete
        })
        return [mainRow, ...subRows]
      })

      if (!active) return
      setRoster(rows)
      setRosterLoading(false)
    }
    void loadRoster()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadData = async () => {
      setLoading(true)
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData.user?.id ?? null

      let athleteId: string | null = requestedAthleteId || null
      let rosterFallbackName = ''
      let rosterFallbackDescriptor = ''
      if (!athleteId && isUuid(slug)) {
        athleteId = slug
      } else if (!athleteId) {
        const membershipResponse = await fetch('/api/memberships')
        if (membershipResponse.ok) {
          const payload = await membershipResponse.json().catch(() => ({ links: [] }))
          const links: Array<{
            athlete_id?: string
            profiles?: { id: string; full_name: string | null; email?: string | null } | null
            sub_profiles?: Array<{ id: string; name: string }>
          }> = payload.links || []
          const match = links.find((link) => {
            const name = toDisplayName(link.profiles?.full_name, link.profiles?.email)
            if (slugify(name) === slug) return true
            return Boolean((link.sub_profiles || []).find((subProfile) => slugify(subProfile.name || '') === slug))
          })
          athleteId = match?.athlete_id ?? null
          if (match) {
            const subProfile = (match.sub_profiles || []).find((item) => slugify(item.name || '') === slug)
            rosterFallbackName = subProfile?.name || toDisplayName(match.profiles?.full_name, match.profiles?.email)
          }
        }
      }

      if (!athleteId) {
        if (active) setLoading(false)
        return
      }

      const matchingRosterRow = roster.find((item) =>
        item.athleteId === athleteId
        && ((requestedSubProfileId && item.subProfileId === requestedSubProfileId) || (!requestedSubProfileId && !item.subProfileId))
      ) || roster.find((item) => item.athleteId === athleteId)
      rosterFallbackName = rosterFallbackName || matchingRosterRow?.name || slug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) || 'Athlete'
      rosterFallbackDescriptor = matchingRosterRow?.descriptor || ''

      const profilePath = requestedSubProfileId
        ? `/api/athletes/${athleteId}/profile?athlete_profile_id=${encodeURIComponent(requestedSubProfileId)}`
        : `/api/athletes/${athleteId}/profile`
      const profileResponse = await fetch(profilePath, { cache: 'no-store' })
      if (!active) return

      let athleteName = ''
      let resolvedAthleteProfileId: string | null = requestedSubProfileId || null
      if (profileResponse.ok) {
        const profileData = await profileResponse.json()
        const profile = profileData.profile as AthleteProfile
        setAthlete(profile)
        setMetrics((profileData.metrics || []) as AthleteMetric[])
        setResults((profileData.results || []) as AthleteResult[])
        setMedia((profileData.media || []) as AthleteMedia[])
        setVisibility((profileData.visibility || {}) as Record<string, string>)
        athleteName = toDisplayName(profile.full_name, profile.email)
        resolvedAthleteProfileId =
          typeof profile.athlete_profile_id === 'string' && profile.athlete_profile_id.trim()
            ? profile.athlete_profile_id.trim()
            : resolvedAthleteProfileId
      } else {
        setAthlete({
          id: athleteId,
          athlete_profile_id: requestedSubProfileId || null,
          full_name: rosterFallbackName,
          email: null,
          avatar_url: null,
          bio: null,
          athlete_sport: rosterFallbackDescriptor === 'Main profile' ? null : rosterFallbackDescriptor || null,
          athlete_location: null,
          athlete_season: null,
          athlete_grade_level: null,
          athlete_birthdate: null,
          guardian_name: null,
          guardian_email: null,
          guardian_phone: null,
        })
        setMetrics([])
        setResults([])
        setMedia([])
        setVisibility({})
      }

      if (uid && athleteId) {
        let bookingsQuery = supabase
          .from('bookings')
          .select('id, title, start_time, status, duration_minutes')
          .eq('coach_id', uid)
          .eq('athlete_id', athleteId)
          .order('start_time', { ascending: false })
          .limit(200)
        if (resolvedAthleteProfileId) {
          bookingsQuery = bookingsQuery.eq('athlete_profile_id', resolvedAthleteProfileId)
        }

        const noteQuery = athleteName
          ? supabase
              .from('coach_notes')
              .select('id, title, body, created_at, type')
              .eq('coach_id', uid)
              .ilike('athlete', `%${athleteName}%`)
              .order('created_at', { ascending: false })
              .limit(12)
          : Promise.resolve({ data: [] })

        const [bookingsRes, notesRes] = await Promise.all([bookingsQuery, noteQuery])
        if (active) {
          setSessions((bookingsRes.data || []) as Booking[])
          setNotes((notesRes.data || []) as CoachNote[])
        }
      }

      resolvedAthleteIdRef.current = athleteId
      setLoading(false)
    }
    void loadData()
    return () => {
      active = false
    }
  }, [requestedAthleteId, requestedSubProfileId, roster, slug, supabase])

  const loadSnapshots = useCallback(async (athleteId: string) => {
    const res = await fetch(`/api/coach/athletes/${athleteId}/metrics`)
    const data = await res.json().catch(() => ({}))
    setSnapshots(data?.snapshots || [])
  }, [])

  useEffect(() => {
    if (!loading && resolvedAthleteIdRef.current) {
      void loadSnapshots(resolvedAthleteIdRef.current)
    }
  }, [loading, loadSnapshots])

  const displayName = useMemo(() => {
    if (athlete) return toDisplayName(athlete.full_name, athlete.email)
    if (!slug || isUuid(slug)) return 'Athlete'
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }, [athlete, slug])

  const selectedRosterKey = `${requestedAthleteId || athlete?.id || ''}:${requestedSubProfileId || 'main'}`
  const filteredRoster = useMemo(() => {
    const query = rosterSearch.trim().toLowerCase()
    if (!query) return roster
    return roster.filter((item) => `${item.name} ${item.descriptor} ${item.label}`.toLowerCase().includes(query))
  }, [roster, rosterSearch])

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.start_time || 0).getTime() - new Date(a.start_time || 0).getTime()),
    [sessions],
  )
  const upcomingSessions = useMemo(
    () => sessions
      .filter((session) => session.start_time && new Date(session.start_time).getTime() >= Date.now())
      .sort((a, b) => new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime()),
    [sessions],
  )
  const recentSessions = sortedSessions.slice(0, 5)
  const lastSession = sortedSessions.find((session) => session.start_time && new Date(session.start_time).getTime() <= Date.now())
  const last7Count = sessions.filter((session) => {
    const time = new Date(session.start_time || 0).getTime()
    return time >= Date.now() - 7 * 86400000 && time <= Date.now()
  }).length
  const last30Count = sessions.filter((session) => {
    const time = new Date(session.start_time || 0).getTime()
    return time >= Date.now() - 30 * 86400000 && time <= Date.now()
  }).length
  const next7Count = sessions.filter((session) => {
    const time = new Date(session.start_time || 0).getTime()
    return time > Date.now() && time <= Date.now() + 7 * 86400000
  }).length
  const latestMetrics = useMemo(() => metrics.slice(0, 6), [metrics])
  const hasGuardian = Boolean(athlete?.guardian_name || athlete?.guardian_email || athlete?.guardian_phone)
  const isSectionVisible = (section: string) => (visibility[section] || 'public') === 'public'

  return (
    <>
      <main className="min-h-screen bg-[#f7f7f7]">
        <div className="relative z-10 px-3 py-4 sm:px-4 lg:px-6">
          <RoleInfoBanner role="coach" />
          <div className="grid min-h-[calc(100vh-2rem)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_340px]">
            <aside className="rounded-2xl border border-[#dcdcdc] bg-white lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-hidden">
              <div className="border-b border-[#e6e6e6] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6b5f55]">Athletes</p>
                <h1 className="mt-1 text-2xl font-semibold text-[#191919]">Your roster</h1>
                <div className="mt-4">
                  <input
                    value={rosterSearch}
                    onChange={(event) => setRosterSearch(event.target.value)}
                    placeholder="Search athlete"
                    className="h-11 w-full rounded-xl border border-[#dcdcdc] bg-[#f7f7f7] px-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                  />
                </div>
              </div>
              <div className="max-h-[360px] space-y-1 overflow-y-auto p-2 lg:max-h-[calc(100vh-156px)]">
                {rosterLoading ? (
                  <p className="px-3 py-4 text-sm text-[#6b5f55]">Loading athletes...</p>
                ) : filteredRoster.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-[#6b5f55]">No athletes match.</p>
                ) : (
                  filteredRoster.map((item) => {
                    const selected = item.key === selectedRosterKey
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition ${
                          selected ? 'bg-[#f5f5f5] shadow-sm' : 'hover:bg-[#f7f7f7]'
                        }`}
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#191919] text-sm font-semibold text-white">
                          {item.initials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-[#191919]">{item.name}</span>
                          <span className="block truncate text-xs text-[#6b5f55]">{item.descriptor}</span>
                        </span>
                        <span className="shrink-0 text-xs text-[#6b5f55]">{item.label === 'Linked athlete' ? 'Linked' : item.status}</span>
                      </Link>
                    )
                  })
                )}
              </div>
            </aside>

            <section className="min-w-0 space-y-4">
              <header className="rounded-2xl border border-[#dcdcdc] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#191919] text-lg font-semibold text-white">
                      {athlete?.avatar_url ? (
                        <Image
                          src={athlete.avatar_url}
                          alt={displayName}
                          width={56}
                          height={56}
                          className="h-14 w-14 rounded-full object-cover"
                          unoptimized
                        />
                      ) : (
                        getInitials(displayName)
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6b5f55]">Athlete workspace</p>
                      <h2 className="truncate text-2xl font-semibold text-[#191919]">{loading ? 'Loading...' : displayName}</h2>
                      <p className="truncate text-sm text-[#6b5f55]">
                        {[athlete?.athlete_sport, athlete?.athlete_location, athlete?.athlete_season].filter(Boolean).join(' · ') || 'General training profile'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {athlete ? (
                      <Link
                        href={`/coach/athletes/book?${new URLSearchParams({
                          athlete: athlete.full_name || displayName,
                          athlete_id: athlete.id,
                          ...(requestedSubProfileId ? { athlete_profile_id: requestedSubProfileId } : {}),
                        }).toString()}`}
                        className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
                      >
                        Book session
                      </Link>
                    ) : null}
                    <Link href="/coach/athletes" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]">
                      All athletes
                    </Link>
                  </div>
                </div>
                <nav className="flex gap-6 overflow-x-auto border-t border-[#e6e6e6] px-4 sm:px-6">
                  {tabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`shrink-0 border-b-2 py-3 text-sm font-semibold ${
                        activeTab === tab ? 'border-[#b80f0a] text-[#191919]' : 'border-transparent text-[#9a9a9a]'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </nav>
              </header>

              {!loading && !athlete ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-6 text-sm text-[#6b5f55]">
                  Athlete not found or not linked to your account.
                </div>
              ) : null}

              {activeTab === 'Overview' || activeTab === 'Training' ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-white">
                  <div className="border-b border-[#e6e6e6] px-5 py-4">
                    <h3 className="text-lg font-semibold text-[#191919]">Training summary</h3>
                  </div>
                  <div className="grid divide-y divide-[#e6e6e6] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    {[
                      { label: 'Last 7 days', value: String(last7Count), detail: 'sessions recorded' },
                      { label: 'Last 30 days', value: String(last30Count), detail: 'sessions recorded' },
                      { label: 'Next 7 days', value: String(next7Count), detail: next7Count ? 'scheduled' : 'none scheduled' },
                    ].map((item) => (
                      <div key={item.label} className="p-5 text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">{item.label}</p>
                        <p className="mt-3 text-4xl font-semibold text-[#191919]">{item.value}</p>
                        <p className="mt-1 text-sm text-[#6b5f55]">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-[#e6e6e6] px-5 py-4 text-sm">
                    <span className="font-semibold text-[#b80f0a]">Last session:</span>{' '}
                    <span className="font-semibold text-[#191919]">{lastSession?.title || 'No completed sessions yet'}</span>
                    {lastSession?.start_time ? <span className="text-[#6b5f55]"> · {formatDate(lastSession.start_time)}</span> : null}
                  </div>
                </div>
              ) : null}

              {activeTab === 'Overview' || activeTab === 'Metrics' ? (
                <section className="rounded-2xl border border-[#dcdcdc] bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e6e6] px-5 py-4">
                    <div>
                      <h3 className="text-lg font-semibold text-[#191919]">Performance metrics</h3>
                      <p className="text-sm text-[#6b5f55]">Sport-neutral measurements and progress snapshots.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setLogMetricOpen(true)}
                        className="rounded-full bg-[#191919] px-3 py-2 text-xs font-semibold text-white"
                      >
                        Log metric
                      </button>
                      <button
                        type="button"
                        onClick={() => metricsImportRef.current?.click()}
                        className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]"
                      >
                        Import CSV
                      </button>
                      <input
                        ref={metricsImportRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={async (event) => {
                          const file = event.target.files?.[0]
                          if (!file || !resolvedAthleteIdRef.current) return
                          const text = await file.text()
                          const lines = text.trim().split('\n')
                          const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''))
                          const labelIdx = header.findIndex((h) => h === 'metric_name' || h === 'metric_label' || h === 'label')
                          const valueIdx = header.findIndex((h) => h === 'value')
                          const unitIdx = header.findIndex((h) => h === 'unit')
                          const dateIdx = header.findIndex((h) => h === 'date' || h === 'recorded_at')
                          if (labelIdx < 0 || valueIdx < 0) {
                            setMetricsImportNotice('CSV must have metric_name and value columns.')
                            return
                          }
                          const rows = lines.slice(1).map((line) => {
                            const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''))
                            return {
                              metric_label: cols[labelIdx] || '',
                              value: cols[valueIdx] || '',
                              unit: unitIdx >= 0 ? cols[unitIdx] || '' : '',
                              recorded_at: dateIdx >= 0 ? cols[dateIdx] || '' : '',
                            }
                          }).filter((row) => row.metric_label && row.value)
                          if (rows.length === 0) {
                            setMetricsImportNotice('No valid rows found.')
                            return
                          }
                          setMetricsImportNotice('Importing...')
                          const res = await fetch(`/api/coach/athletes/${resolvedAthleteIdRef.current}/metrics/import`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ rows }),
                          })
                          const data = await res.json().catch(() => ({}))
                          event.target.value = ''
                          if (!res.ok) {
                            setMetricsImportNotice(data?.error || 'Import failed.')
                            return
                          }
                          setMetricsImportNotice(`Imported ${data.imported} data point${data.imported !== 1 ? 's' : ''}.`)
                          if (resolvedAthleteIdRef.current) void loadSnapshots(resolvedAthleteIdRef.current)
                        }}
                      />
                    </div>
                  </div>
                  {metricsImportNotice ? <p className="px-5 pt-4 text-xs text-[#6b5f55]">{metricsImportNotice}</p> : null}
                  <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
                    {latestMetrics.length === 0 ? (
                      <div className="rounded-2xl border border-[#e6e6e6] bg-[#f7f7f7] px-4 py-3 text-sm text-[#6b5f55]">
                        No metrics yet.
                      </div>
                    ) : (
                      latestMetrics.map((metric) => (
                        <div key={`${metric.label}-${metric.value}`} className="rounded-2xl border border-[#e6e6e6] bg-[#f7f7f7] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b5f55]">{metric.label}</p>
                          <p className="mt-3 text-3xl font-semibold text-[#191919]">
                            {metric.value}{metric.unit ? ` ${metric.unit}` : ''}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                  {snapshots.length > 0 ? (
                    <div className="border-t border-[#e6e6e6] p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b5f55]">Progress over time</p>
                      <MetricsChart snapshots={snapshots} />
                    </div>
                  ) : null}
                </section>
              ) : null}

              {activeTab === 'Overview' || activeTab === 'Training' ? (
                <section className="rounded-2xl border border-[#dcdcdc] bg-white">
                  <div className="border-b border-[#e6e6e6] px-5 py-4">
                    <h3 className="text-lg font-semibold text-[#191919]">Recent sessions</h3>
                  </div>
                  <div className="space-y-3 p-5">
                    {recentSessions.length === 0 ? (
                      <p className="text-sm text-[#6b5f55]">No sessions recorded yet.</p>
                    ) : (
                      recentSessions.map((session) => (
                        <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e6e6e6] bg-[#f7f7f7] px-4 py-3 text-sm">
                          <div>
                            <p className="font-semibold text-[#191919]">{session.title || 'Session'}</p>
                            <p className="text-xs text-[#6b5f55]">
                              {formatDate(session.start_time)}
                              {session.duration_minutes ? ` · ${session.duration_minutes} min` : ''}
                            </p>
                          </div>
                          <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                            {session.status || 'Scheduled'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ) : null}

              {activeTab === 'Notes' ? (
                <section className="rounded-2xl border border-[#dcdcdc] bg-white p-5">
                  <h3 className="text-lg font-semibold text-[#191919]">Notes</h3>
                  <div className="mt-4 space-y-3">
                    {notes.length === 0 ? (
                      <p className="text-sm text-[#6b5f55]">No notes for this athlete yet.</p>
                    ) : (
                      notes.map((note) => (
                        <div key={note.id} className="rounded-2xl border border-[#e6e6e6] bg-[#f7f7f7] p-4 text-sm">
                          <p className="font-semibold text-[#191919]">{note.title}</p>
                          {note.body ? <p className="mt-1 line-clamp-3 text-[#6b5f55]">{note.body}</p> : null}
                          <p className="mt-2 text-xs text-[#6b5f55]">{formatDate(note.created_at)} · {note.type}</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ) : null}

              {activeTab === 'Documents' || activeTab === 'Settings' ? (
                <section className="rounded-2xl border border-[#dcdcdc] bg-white p-5">
                  <h3 className="text-lg font-semibold text-[#191919]">{activeTab}</h3>
                  <p className="mt-2 text-sm text-[#6b5f55]">
                    This section is ready for the next module pass. Existing profile, notes, metrics, and session data are already available in this workspace.
                  </p>
                </section>
              ) : null}
            </section>

            <aside className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
              <section className="rounded-2xl border border-[#dcdcdc] bg-white">
                <div className="border-b border-[#e6e6e6] px-5 py-4">
                  <h3 className="text-lg font-semibold text-[#191919]">Profile</h3>
                </div>
                <div className="space-y-3 p-5 text-sm text-[#4a4a4a]">
                  <p className="break-all">{athlete?.email || 'No email listed'}</p>
                  <p>{athlete?.athlete_location || 'No location listed'}</p>
                  <p>{athlete?.athlete_grade_level ? `Grade ${athlete.athlete_grade_level}` : 'Grade not set'}</p>
                  <p>{athlete?.athlete_birthdate ? `Born ${formatDate(athlete.athlete_birthdate)}` : 'Birthdate not set'}</p>
                </div>
                <div className="border-t border-[#e6e6e6] p-5">
                  <p className="text-sm text-[#6b5f55]">{athlete?.bio || 'No athlete bio added yet.'}</p>
                </div>
              </section>

              <section className="rounded-2xl border border-[#dcdcdc] bg-white">
                <div className="flex items-center justify-between border-b border-[#e6e6e6] px-5 py-4">
                  <h3 className="text-lg font-semibold text-[#191919]">Notes</h3>
                  <Link href={`/coach/notes?athlete=${encodeURIComponent(displayName)}`} className="text-xs font-semibold text-[#b80f0a]">
                    Add
                  </Link>
                </div>
                <div className="space-y-3 p-5">
                  {notes.slice(0, 3).length === 0 ? (
                    <p className="rounded-xl border border-[#e6e6e6] bg-[#f7f7f7] p-3 text-sm text-[#6b5f55]">No notes yet.</p>
                  ) : (
                    notes.slice(0, 3).map((note) => (
                      <div key={note.id} className="rounded-xl border border-[#e6e6e6] bg-[#f7f7f7] p-3 text-sm">
                        <p className="font-semibold text-[#191919]">{note.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-[#6b5f55]">{note.body}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-[#dcdcdc] bg-white">
                <div className="border-b border-[#e6e6e6] px-5 py-4">
                  <h3 className="text-lg font-semibold text-[#191919]">Upcoming</h3>
                </div>
                <div className="space-y-3 p-5">
                  {upcomingSessions.slice(0, 3).length === 0 ? (
                    <p className="rounded-xl border border-[#e6e6e6] bg-[#f7f7f7] p-3 text-sm text-[#6b5f55]">No upcoming sessions.</p>
                  ) : (
                    upcomingSessions.slice(0, 3).map((session) => {
                      const daysUntil = getDaysUntil(session.start_time)
                      return (
                        <div key={session.id} className="rounded-xl border border-[#e6e6e6] bg-[#f7f7f7] p-3 text-sm">
                          <p className="font-semibold text-[#191919]">{session.title || 'Session'}</p>
                          <p className="mt-1 text-xs text-[#6b5f55]">
                            {formatDate(session.start_time)}
                            {daysUntil !== null ? ` · ${daysUntil <= 0 ? 'Today' : `${daysUntil}d`}` : ''}
                          </p>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>

              {hasGuardian ? (
                <section className="rounded-2xl border border-[#dcdcdc] bg-white">
                  <div className="border-b border-[#e6e6e6] px-5 py-4">
                    <h3 className="text-lg font-semibold text-[#191919]">Guardian</h3>
                  </div>
                  <div className="space-y-2 p-5 text-sm text-[#6b5f55]">
                    <p>{athlete?.guardian_name || 'Name not set'}</p>
                    <p className="break-all">{athlete?.guardian_email || 'Email not set'}</p>
                    <p>{athlete?.guardian_phone || 'Phone not set'}</p>
                  </div>
                </section>
              ) : null}

              {isSectionVisible('media') ? (
                <section className="rounded-2xl border border-[#dcdcdc] bg-white">
                  <div className="border-b border-[#e6e6e6] px-5 py-4">
                    <h3 className="text-lg font-semibold text-[#191919]">Highlights</h3>
                  </div>
                  <div className="space-y-3 p-5">
                    {media.length === 0 ? (
                      <p className="rounded-xl border border-[#e6e6e6] bg-[#f7f7f7] p-3 text-sm text-[#6b5f55]">No highlights uploaded.</p>
                    ) : (
                      media.slice(0, 2).map((item) => (
                        <a key={`${item.media_url}-${item.title || 'highlight'}`} href={item.media_url} target="_blank" rel="noreferrer" className="block rounded-xl border border-[#e6e6e6] bg-[#f7f7f7] p-3 text-sm">
                          <p className="font-semibold text-[#191919]">{item.title || 'Highlight'}</p>
                          <p className="mt-1 text-xs text-[#6b5f55]">Open media</p>
                        </a>
                      ))
                    )}
                  </div>
                </section>
              ) : null}
            </aside>
          </div>
        </div>
      </main>

      {logMetricOpen && resolvedAthleteIdRef.current ? (
        <LogMetricModal
          athleteId={resolvedAthleteIdRef.current}
          existingLabels={Array.from(new Set(snapshots.map((snapshot) => snapshot.metric_label)))}
          endpoint={`/api/coach/athletes/${resolvedAthleteIdRef.current}/metrics`}
          onSave={(snapshot) => {
            setSnapshots((prev) => [...prev, { id: Date.now().toString(), ...snapshot }])
            setMetrics((prev) => {
              const existing = prev.find((metric) => metric.label === snapshot.metric_label)
              if (existing) {
                return prev.map((metric) =>
                  metric.label === snapshot.metric_label
                    ? { ...metric, value: snapshot.value, unit: snapshot.unit || metric.unit }
                    : metric,
                )
              }
              return [...prev, { athlete_id: resolvedAthleteIdRef.current!, label: snapshot.metric_label, value: snapshot.value, unit: snapshot.unit }]
            })
          }}
          onClose={() => setLogMetricOpen(false)}
        />
      ) : null}
    </>
  )
}
