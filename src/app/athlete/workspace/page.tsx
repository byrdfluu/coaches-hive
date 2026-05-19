'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import MetricsChart from '@/components/MetricsChart'
import { useAthleteProfile } from '@/components/AthleteProfileContext'

const tabs = ['Overview', 'Metrics']

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

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'AT'

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

type Snapshot = {
  id: string
  metric_label: string
  value: string
  unit?: string | null
  recorded_at: string
}

type ProfileData = {
  full_name: string | null
  email: string | null
  avatar_url: string | null
  bio: string | null
  athlete_location: string | null
  athlete_grade_level: string | null
  athlete_birthdate: string | null
  guardian_name: string | null
  guardian_email: string | null
  guardian_phone: string | null
}

export default function AthleteWorkspacePage() {
  const supabase = createClientComponentClient()
  const { activeSubProfileId, activeAthleteProfile, activeAthleteLabel } = useAthleteProfile()
  const [activeTab, setActiveTab] = useState('Overview')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [sessions, setSessions] = useState<Booking[]>([])
  const [metrics, setMetrics] = useState<AthleteMetric[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id ?? null
      if (!uid || !active) return
      setUserId(uid)

      const [profileRes, sessionsRes, metricsRes, snapshotsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, email, avatar_url, bio, athlete_location, athlete_grade_level, athlete_birthdate, guardian_name, guardian_email, guardian_phone')
          .eq('id', uid)
          .maybeSingle(),
        fetch(
          activeSubProfileId
            ? `/api/sessions?athlete_profile_id=${encodeURIComponent(activeSubProfileId)}`
            : '/api/sessions?sub_profile_scope=main',
        ),
        supabase
          .from('athlete_metrics')
          .select('athlete_id, label, value, unit')
          .eq('athlete_id', uid),
        supabase
          .from('athlete_metric_snapshots')
          .select('id, metric_label, value, unit, recorded_at')
          .eq('athlete_id', uid)
          .order('recorded_at', { ascending: true }),
      ])

      if (!active) return

      if (profileRes.data) setProfile(profileRes.data as ProfileData)

      if (sessionsRes.ok) {
        const payload = await sessionsRes.json().catch(() => ({}))
        setSessions((payload.sessions || []) as Booking[])
      }

      setMetrics((metricsRes.data || []) as AthleteMetric[])
      setSnapshots((snapshotsRes.data || []) as Snapshot[])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [supabase, activeSubProfileId])

  const displayName = useMemo(() => {
    if (profile?.full_name) return profile.full_name
    if (activeAthleteLabel) return activeAthleteLabel
    return 'Athlete'
  }, [profile, activeAthleteLabel])

  const avatarUrl = useMemo(
    () => profile?.avatar_url || activeAthleteProfile?.avatar_url || null,
    [profile, activeAthleteProfile],
  )

  const sport = useMemo(
    () => activeAthleteProfile?.sport || null,
    [activeAthleteProfile],
  )

  const location = profile?.athlete_location || activeAthleteProfile?.location || null
  const season = activeAthleteProfile?.season || null
  const subtitle = [sport, location, season].filter(Boolean).join(' · ') || 'General training profile'

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.start_time || 0).getTime() - new Date(a.start_time || 0).getTime()),
    [sessions],
  )
  const upcomingSessions = useMemo(
    () => sessions
      .filter((s) => s.start_time && new Date(s.start_time).getTime() >= Date.now())
      .sort((a, b) => new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime()),
    [sessions],
  )
  const recentSessions = sortedSessions.slice(0, 5)
  const lastSession = sortedSessions.find((s) => s.start_time && new Date(s.start_time).getTime() <= Date.now())

  const last7Count = sessions.filter((s) => {
    const t = new Date(s.start_time || 0).getTime()
    return t >= Date.now() - 7 * 86400000 && t <= Date.now()
  }).length
  const last30Count = sessions.filter((s) => {
    const t = new Date(s.start_time || 0).getTime()
    return t >= Date.now() - 30 * 86400000 && t <= Date.now()
  }).length
  const next7Count = sessions.filter((s) => {
    const t = new Date(s.start_time || 0).getTime()
    return t > Date.now() && t <= Date.now() + 7 * 86400000
  }).length

  const latestMetrics = useMemo(() => metrics.slice(0, 6), [metrics])
  const hasGuardian = Boolean(profile?.guardian_name || profile?.guardian_email || profile?.guardian_phone)

  return (
    <main className="min-h-screen bg-[#f7f7f7]">
      <div className="relative z-10 px-3 py-4 sm:px-4 lg:px-6">
        <RoleInfoBanner role="athlete" />
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="min-w-0 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">

          {/* Main content */}
          <section className="min-w-0 space-y-4">

            {/* Header card */}
            <header className="rounded-2xl border border-[#dcdcdc] bg-white">
              <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#191919] text-lg font-semibold text-white">
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
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
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6b5f55]">My workspace</p>
                    <h1 className="truncate text-2xl font-semibold text-[#191919]">
                      {loading ? 'Loading...' : displayName}
                    </h1>
                    <p className="truncate text-sm text-[#6b5f55]">{subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/athlete/calendar"
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Book session
                  </Link>
                  <Link
                    href="/athlete/settings"
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                  >
                    Edit profile
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

            {/* Training summary */}
            {activeTab === 'Overview' ? (
              <div className="rounded-2xl border border-[#dcdcdc] bg-white">
                <div className="border-b border-[#e6e6e6] px-5 py-4">
                  <h2 className="text-lg font-semibold text-[#191919]">Training summary</h2>
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
                  {lastSession?.start_time ? (
                    <span className="text-[#6b5f55]"> · {formatDate(lastSession.start_time)}</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Metrics */}
            <section className="rounded-2xl border border-[#dcdcdc] bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e6e6] px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Performance metrics</h2>
                  <p className="text-sm text-[#6b5f55]">Sport-neutral measurements and progress snapshots.</p>
                </div>
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

            {/* Recent sessions — Overview only */}
            {activeTab === 'Overview' ? (
              <section className="rounded-2xl border border-[#dcdcdc] bg-white">
                <div className="border-b border-[#e6e6e6] px-5 py-4">
                  <h2 className="text-lg font-semibold text-[#191919]">Recent sessions</h2>
                </div>
                <div className="space-y-3 p-5">
                  {recentSessions.length === 0 ? (
                    <p className="text-sm text-[#6b5f55]">No sessions recorded yet.</p>
                  ) : (
                    recentSessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e6e6e6] bg-[#f7f7f7] px-4 py-3 text-sm"
                      >
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
          </section>

          {/* Right panel */}
          <aside className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">

            {/* Profile */}
            <section className="rounded-2xl border border-[#dcdcdc] bg-white">
              <div className="flex items-center justify-between border-b border-[#e6e6e6] px-5 py-4">
                <h3 className="text-lg font-semibold text-[#191919]">Profile</h3>
                <Link href="/athlete/settings" className="text-xs font-semibold text-[#b80f0a]">Edit</Link>
              </div>
              <div className="space-y-2 p-5 text-sm text-[#4a4a4a]">
                <p className="break-all">{profile?.email || 'No email listed'}</p>
                <p>{location || 'No location listed'}</p>
                <p>{profile?.athlete_grade_level ? `Grade ${profile.athlete_grade_level}` : 'Grade not set'}</p>
                <p>{profile?.athlete_birthdate ? `Born ${formatDate(profile.athlete_birthdate)}` : 'Birthdate not set'}</p>
              </div>
              {(activeAthleteProfile?.bio || profile?.bio) ? (
                <div className="border-t border-[#e6e6e6] p-5">
                  <p className="text-sm text-[#6b5f55]">{activeAthleteProfile?.bio || profile?.bio}</p>
                </div>
              ) : (
                <div className="border-t border-[#e6e6e6] p-5">
                  <p className="text-sm text-[#6b5f55]">No bio added yet.</p>
                </div>
              )}
            </section>

            {/* Upcoming */}
            <section className="rounded-2xl border border-[#dcdcdc] bg-white">
              <div className="flex items-center justify-between border-b border-[#e6e6e6] px-5 py-4">
                <h3 className="text-lg font-semibold text-[#191919]">Upcoming</h3>
                <Link href="/athlete/calendar" className="text-xs font-semibold text-[#b80f0a]">Book</Link>
              </div>
              <div className="space-y-3 p-5">
                {upcomingSessions.slice(0, 3).length === 0 ? (
                  <p className="rounded-xl border border-[#e6e6e6] bg-[#f7f7f7] p-3 text-sm text-[#6b5f55]">
                    No upcoming sessions.
                  </p>
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

            {/* Quick links */}
            <section className="rounded-2xl border border-[#dcdcdc] bg-white">
              <div className="border-b border-[#e6e6e6] px-5 py-4">
                <h3 className="text-lg font-semibold text-[#191919]">Quick links</h3>
              </div>
              <div className="space-y-2 p-5">
                {[
                  { href: '/athlete/waivers', label: 'My waivers' },
                  { href: '/athlete/memberships', label: 'My memberships' },
                  { href: '/athlete/payments', label: 'Payments' },
                  { href: '/athlete/notes', label: 'My notes' },
                  { href: '/athlete/discover', label: 'Discover coaches' },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between rounded-xl border border-[#e6e6e6] bg-[#f7f7f7] px-3 py-2.5 text-sm font-semibold text-[#191919] transition-colors hover:border-[#191919]"
                  >
                    {link.label}
                    <span className="text-[#9a9a9a]">→</span>
                  </Link>
                ))}
              </div>
            </section>

            {/* Guardian — only if set */}
            {hasGuardian ? (
              <section className="rounded-2xl border border-[#dcdcdc] bg-white">
                <div className="border-b border-[#e6e6e6] px-5 py-4">
                  <h3 className="text-lg font-semibold text-[#191919]">Guardian</h3>
                </div>
                <div className="space-y-2 p-5 text-sm text-[#6b5f55]">
                  <p>{profile?.guardian_name || 'Name not set'}</p>
                  <p className="break-all">{profile?.guardian_email || 'Email not set'}</p>
                  <p>{profile?.guardian_phone || 'Phone not set'}</p>
                </div>
              </section>
            ) : null}
          </aside>
          </div>
        </div>
      </div>
    </main>
  )
}