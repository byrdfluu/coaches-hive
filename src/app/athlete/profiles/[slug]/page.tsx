'use client'

export const dynamic = 'force-dynamic'

import Image from 'next/image'
import Link from 'next/link'
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import MetricsChart from '@/components/MetricsChart'
import LogMetricModal from '@/components/LogMetricModal'

type AthleteProfile = {
  id: string
  athlete_id: string
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

type SessionRow = {
  id: string
  title: string | null
  start_time: string | null
  status: string | null
  duration_minutes: number | null
  coach_name?: string | null
}

type ProfileNavItem = {
  key: string
  id: string | null
  name: string
  descriptor: string
  initials: string
  href: string
}

const tabs = ['Overview', 'Training', 'Metrics', 'Notes', 'Documents', 'Settings']

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'profile'

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'AT'

const toDisplayName = (name?: string | null, email?: string | null) => {
  const trimmedName = String(name || '').trim()
  if (trimmedName) return trimmedName
  const trimmedEmail = String(email || '').trim()
  return trimmedEmail ? trimmedEmail.split('@')[0] || 'Athlete' : 'Athlete'
}

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

const buildProfileHref = (name: string, athleteProfileId?: string | null) =>
  `/athlete/profiles/${slugify(name)}${athleteProfileId ? `?athlete_profile_id=${encodeURIComponent(athleteProfileId)}` : ''}`

export default function AthleteProfileDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  use(params)
  const searchParams = useSearchParams()
  const requestedProfileId = String(searchParams.get('athlete_profile_id') || searchParams.get('sub_profile_id') || '').trim()
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileNav, setProfileNav] = useState<ProfileNavItem[]>([])
  const [metrics, setMetrics] = useState<AthleteMetric[]>([])
  const [results, setResults] = useState<AthleteResult[]>([])
  const [media, setMedia] = useState<AthleteMedia[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [notes, setNotes] = useState<Array<{ id: string; note: string; created_at: string }>>([])
  const [snapshots, setSnapshots] = useState<Array<{ id: string; metric_label: string; value: string; unit?: string | null; recorded_at: string }>>([])
  const [visibility, setVisibility] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState('Overview')
  const [search, setSearch] = useState('')
  const [logMetricOpen, setLogMetricOpen] = useState(false)
  const resolvedAthleteProfileIdRef = useRef<string | null>(requestedProfileId || null)

  const loadSnapshots = useCallback(async (athleteProfileId?: string | null) => {
    const params = new URLSearchParams()
    if (athleteProfileId) params.set('athlete_profile_id', athleteProfileId)
    const response = await fetch(`/api/athlete/metrics${params.size ? `?${params.toString()}` : ''}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    setSnapshots(payload?.snapshots || [])
  }, [])

  useEffect(() => {
    let active = true

    const loadWorkspace = async () => {
      setLoading(true)

      const profileParams = new URLSearchParams()
      if (requestedProfileId) profileParams.set('athlete_profile_id', requestedProfileId)
      const profileResponse = await fetch(`/api/athlete/profile${profileParams.size ? `?${profileParams.toString()}` : ''}`, { cache: 'no-store' })
      if (!active) return

      if (!profileResponse.ok) {
        setAthlete(null)
        setLoading(false)
        return
      }

      const bundle = await profileResponse.json().catch(() => ({}))
      const profile = bundle.profile as AthleteProfile
      const resolvedProfileId = profile?.athlete_profile_id || requestedProfileId || null
      resolvedAthleteProfileIdRef.current = resolvedProfileId

      setAthlete(profile)
      setMetrics((bundle.metrics || []) as AthleteMetric[])
      setResults((bundle.results || []) as AthleteResult[])
      setMedia((bundle.media || []) as AthleteMedia[])
      setVisibility((bundle.visibility || {}) as Record<string, string>)

      const profilesResponse = await fetch('/api/athlete/profiles', { cache: 'no-store' }).catch(() => null)
      const childProfiles = profilesResponse?.ok ? await profilesResponse.json().catch(() => []) : []
      if (!active) return

      const primaryName = toDisplayName(profile?.full_name, profile?.email)
      const navRows: ProfileNavItem[] = [
        {
          key: 'primary',
          id: profile?.id || null,
          name: primaryName,
          descriptor: profile?.athlete_sport || 'Main profile',
          initials: getInitials(primaryName),
          href: buildProfileHref(primaryName),
        },
        ...(Array.isArray(childProfiles) ? childProfiles : []).map((item: any) => {
          const name = String(item.name || 'Athlete').trim() || 'Athlete'
          return {
            key: item.id,
            id: item.id,
            name,
            descriptor: item.sport || 'General',
            initials: getInitials(name),
            href: buildProfileHref(name, item.id),
          } satisfies ProfileNavItem
        }),
      ]
      setProfileNav(navRows)

      const sessionsParams = new URLSearchParams()
      if (resolvedProfileId) sessionsParams.set('athlete_profile_id', resolvedProfileId)
      else sessionsParams.set('sub_profile_scope', 'main')
      const sessionsResponse = await fetch(`/api/sessions?${sessionsParams.toString()}`, { cache: 'no-store' }).catch(() => null)
      const sessionsPayload = sessionsResponse?.ok ? await sessionsResponse.json().catch(() => ({})) : {}
      if (active) setSessions((sessionsPayload.sessions || []) as SessionRow[])

      const notesParams = new URLSearchParams()
      if (resolvedProfileId) notesParams.set('athlete_profile_id', resolvedProfileId)
      const notesResponse = await fetch(`/api/athlete/notes${notesParams.size ? `?${notesParams.toString()}` : ''}`, { cache: 'no-store' }).catch(() => null)
      const notesPayload = notesResponse?.ok ? await notesResponse.json().catch(() => ({})) : {}
      if (active) setNotes((notesPayload.notes || notesPayload.data || []) as Array<{ id: string; note: string; created_at: string }>)

      await loadSnapshots(resolvedProfileId)
      if (active) setLoading(false)
    }

    void loadWorkspace()
    return () => {
      active = false
    }
  }, [loadSnapshots, requestedProfileId])

  const displayName = toDisplayName(athlete?.full_name, athlete?.email)
  const selectedProfileKey = requestedProfileId || 'primary'
  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return profileNav
    return profileNav.filter((item) => `${item.name} ${item.descriptor}`.toLowerCase().includes(query))
  }, [profileNav, search])

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
  const latestMetrics = metrics.slice(0, 6)
  const isSectionVisible = (section: string) => (visibility[section] || 'public') === 'public'
  const hasGuardian = Boolean(athlete?.guardian_name || athlete?.guardian_email || athlete?.guardian_phone)

  return (
    <>
      <main className="min-h-screen bg-[#f7f7f7]">
        <div className="relative z-10 px-3 py-4 sm:px-4 lg:px-6">
          <RoleInfoBanner role="athlete" />
          <div className="grid min-h-[calc(100vh-2rem)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_340px]">
            <aside className="rounded-2xl border border-[#dcdcdc] bg-white lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-hidden">
              <div className="border-b border-[#e6e6e6] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6b5f55]">Profiles</p>
                <h1 className="mt-1 text-2xl font-semibold text-[#191919]">My workspace</h1>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search profile"
                  className="mt-4 h-11 w-full rounded-xl border border-[#dcdcdc] bg-[#f7f7f7] px-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                />
              </div>
              <div className="max-h-[360px] space-y-1 overflow-y-auto p-2 lg:max-h-[calc(100vh-156px)]">
                {filteredProfiles.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-[#6b5f55]">{loading ? 'Loading profiles...' : 'No profiles match.'}</p>
                ) : (
                  filteredProfiles.map((item) => {
                    const selected = selectedProfileKey === (item.id || 'primary')
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
                    <Link href="/athlete/marketplace" className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white">
                      Book session
                    </Link>
                    <Link href="/athlete/dashboard" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]">
                      Dashboard
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
                  Athlete profile data is not available yet.
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
                    <button
                      type="button"
                      onClick={() => setLogMetricOpen(true)}
                      className="rounded-full bg-[#191919] px-3 py-2 text-xs font-semibold text-white"
                    >
                      Log metric
                    </button>
                  </div>
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
                              {session.coach_name ? ` · ${session.coach_name}` : ''}
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
                      <p className="text-sm text-[#6b5f55]">No notes for this profile yet.</p>
                    ) : (
                      notes.map((note) => (
                        <div key={note.id} className="rounded-2xl border border-[#e6e6e6] bg-[#f7f7f7] p-4 text-sm">
                          <p className="text-[#191919]">{note.note}</p>
                          <p className="mt-2 text-xs text-[#6b5f55]">{formatDate(note.created_at)}</p>
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
                    This workspace is ready for the next module pass. Existing profile, metrics, sessions, notes, and highlight data are already connected.
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
                  <Link href="/athlete/messages" className="text-xs font-semibold text-[#b80f0a]">
                    Message
                  </Link>
                </div>
                <div className="space-y-3 p-5">
                  {notes.slice(0, 3).length === 0 ? (
                    <p className="rounded-xl border border-[#e6e6e6] bg-[#f7f7f7] p-3 text-sm text-[#6b5f55]">No notes yet.</p>
                  ) : (
                    notes.slice(0, 3).map((note) => (
                      <div key={note.id} className="rounded-xl border border-[#e6e6e6] bg-[#f7f7f7] p-3 text-sm">
                        <p className="line-clamp-2 text-xs text-[#6b5f55]">{note.note}</p>
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

      {logMetricOpen ? (
        <LogMetricModal
          athleteId={athlete?.athlete_id || athlete?.id || ''}
          existingLabels={Array.from(new Set(snapshots.map((snapshot) => snapshot.metric_label)))}
          endpoint={`/api/athlete/metrics${
            resolvedAthleteProfileIdRef.current
              ? `?athlete_profile_id=${encodeURIComponent(resolvedAthleteProfileIdRef.current)}`
              : ''
          }`}
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
              return [...prev, { athlete_id: athlete?.athlete_id || athlete?.id || '', label: snapshot.metric_label, value: snapshot.value, unit: snapshot.unit }]
            })
            if (resolvedAthleteProfileIdRef.current) void loadSnapshots(resolvedAthleteProfileIdRef.current)
          }}
          onClose={() => setLogMetricOpen(false)}
        />
      ) : null}
    </>
  )
}
