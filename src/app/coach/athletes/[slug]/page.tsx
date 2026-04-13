'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type AthleteProfile = {
  id: string
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

export default function CoachAthleteDynamicPage() {
  const supabase = createClientComponentClient()
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = String(params.slug || '')
  const requestedAthleteId = String(searchParams.get('athlete_id') || '').trim()
  const requestedSubProfileId = String(searchParams.get('athlete_profile_id') || searchParams.get('sub_profile_id') || '').trim()
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Booking[]>([])
  const [notes, setNotes] = useState<CoachNote[]>([])
  const [metrics, setMetrics] = useState<AthleteMetric[]>([])
  const [results, setResults] = useState<AthleteResult[]>([])
  const [media, setMedia] = useState<AthleteMedia[]>([])
  const [visibility, setVisibility] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true
    const loadData = async () => {
      setLoading(true)
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData.user?.id ?? null
      // uid used below for fetching bookings/notes owned by this coach

      // Resolve athlete ID: if slug is a UUID use it directly,
      // otherwise resolve via memberships (legacy name-slug links)
      let athleteId: string | null = requestedAthleteId || null
      if (!athleteId && isUuid(slug)) {
        athleteId = slug
      } else if (!athleteId) {
        const membershipResponse = await fetch('/api/memberships')
        if (membershipResponse.ok) {
          const payload = await membershipResponse.json()
          const links: Array<{
            athlete_id?: string
            profiles?: { id: string; full_name: string | null; email?: string | null } | null
            sub_profiles?: Array<{ id: string; name: string }>
          }> = payload.links || []
          const match = links.find((l) => {
            const name = toDisplayName(l.profiles?.full_name, l.profiles?.email)
            if (slugify(name) === slug) return true
            return Boolean((l.sub_profiles || []).find((subProfile) => slugify(subProfile.name || '') === slug))
          })
          athleteId = match?.athlete_id ?? null
        }
      }

      if (!athleteId) { setLoading(false); return }

      // Fetch full profile via server-side API (bypasses RLS)
      const profilePath = requestedSubProfileId
        ? `/api/athletes/${athleteId}/profile?athlete_profile_id=${encodeURIComponent(requestedSubProfileId)}`
        : `/api/athletes/${athleteId}/profile`
      const profileResponse = await fetch(profilePath)
      if (!active) return

      let athleteName = ''
      if (profileResponse.ok) {
        const profileData = await profileResponse.json()
        const profile = profileData.profile as AthleteProfile
        setAthlete(profile)
        setMetrics((profileData.metrics || []) as AthleteMetric[])
        setResults((profileData.results || []) as AthleteResult[])
        setMedia((profileData.media || []) as AthleteMedia[])
        setVisibility((profileData.visibility || {}) as Record<string, string>)
        athleteName = toDisplayName(profile.full_name, profile.email)
      } else {
        setAthlete(null)
        setMetrics([])
        setResults([])
        setMedia([])
        setVisibility({})
      }

      if (uid && athleteId) {
        const bookingsQuery = supabase
          .from('bookings')
          .select('id, title, start_time, status, duration_minutes')
          .eq('coach_id', uid)
          .eq('athlete_id', athleteId)
          .order('start_time', { ascending: false })
          .limit(5)
        const noteQuery = athleteName
          ? supabase
              .from('coach_notes')
              .select('id, title, body, created_at, type')
              .eq('coach_id', uid)
              .ilike('athlete', `%${athleteName}%`)
              .order('created_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] })

        const [bookingsRes, notesRes] = await Promise.all([
          requestedSubProfileId
            ? bookingsQuery.eq('athlete_profile_id', requestedSubProfileId)
            : bookingsQuery.eq('athlete_profile_id', athleteId),
          noteQuery,
        ])
        if (active) {
          setSessions((bookingsRes.data || []) as Booking[])
          setNotes((notesRes.data || []) as CoachNote[])
        }
      }

      setLoading(false)
    }
    loadData()
    return () => { active = false }
  }, [requestedAthleteId, requestedSubProfileId, slug, supabase])

  const displayName = useMemo(() => {
    if (athlete) return toDisplayName(athlete.full_name, athlete.email)
    if (!slug || isUuid(slug)) return 'Athlete'
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }, [athlete, slug])

  const subtitleParts = [athlete?.athlete_location, athlete?.athlete_sport].filter(Boolean)

  const hasGuardian = !!(athlete?.guardian_name || athlete?.guardian_email || athlete?.guardian_phone)
  const isSectionVisible = (section: string) => (visibility[section] || 'public') === 'public'

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />

        {/* Hero card */}
        <div className="glass-card border border-[#191919] bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#191919] text-xl font-bold text-white">
                {athlete?.avatar_url ? (
                  <Image
                    src={athlete.avatar_url}
                    alt={displayName}
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  displayName.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'AT'
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athlete Profile</p>
                <h1 className="mt-1 text-2xl font-semibold text-[#191919]">
                  {loading ? 'Loading...' : displayName}
                </h1>
                {subtitleParts.length > 0 && (
                  <p className="mt-0.5 text-sm text-[#4a4a4a]">{subtitleParts.join(' · ')}</p>
                )}
                {!loading && !athlete && (
                  <p className="mt-1 text-sm text-[#4a4a4a]">Athlete not found or not linked to your account.</p>
                )}
                {athlete && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {athlete.athlete_sport && (
                      <span className="rounded-full border border-[#191919] px-3 py-0.5 text-xs font-semibold text-[#191919]">
                        {athlete.athlete_sport}
                      </span>
                    )}
                    {athlete.athlete_season && (
                      <span className="rounded-full border border-[#191919] px-3 py-0.5 text-xs font-semibold text-[#191919]">
                        {athlete.athlete_season}
                      </span>
                    )}
                    {athlete.athlete_grade_level && (
                      <span className="rounded-full border border-[#191919] px-3 py-0.5 text-xs font-semibold text-[#191919]">
                        Grade {athlete.athlete_grade_level}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {athlete && (
                <Link
                  href={`/coach/athletes/book?${new URLSearchParams({
                    athlete: athlete.full_name || slug,
                    athlete_id: athlete.id,
                    ...(requestedSubProfileId ? { athlete_profile_id: requestedSubProfileId } : {}),
                  }).toString()}`}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  Book session
                </Link>
              )}
              <Link
                href="/coach/athletes"
                className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
              >
                Back to athletes
              </Link>
            </div>
          </div>
        </div>

        {athlete && (
          <>
            <div className="mt-6 space-y-6">
              {isSectionVisible('about') && (
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <h2 className="text-xl font-semibold text-[#191919]">About</h2>
                  <p className="mt-3 text-sm text-[#4a4a4a]">
                    {athlete.bio || 'This athlete has not added a bio yet.'}
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm">
                    {athlete.athlete_season ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Season</p>
                        <p className="mt-1 font-semibold text-[#191919]">{athlete.athlete_season}</p>
                      </div>
                    ) : null}
                    {athlete.athlete_grade_level ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Grade level</p>
                        <p className="mt-1 font-semibold text-[#191919]">{athlete.athlete_grade_level}</p>
                      </div>
                    ) : null}
                    {athlete.athlete_birthdate ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Date of birth</p>
                        <p className="mt-1 font-semibold text-[#191919]">
                          {new Date(athlete.athlete_birthdate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    ) : null}
                    {athlete.athlete_location ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Location</p>
                        <p className="mt-1 font-semibold text-[#191919]">{athlete.athlete_location}</p>
                      </div>
                    ) : null}
                  </div>
                </section>
              )}

              {isSectionVisible('metrics') && (
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-[#191919]">Performance metrics</h2>
                    <span className="text-xs font-semibold text-[#4a4a4a]">Read only</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {metrics.length === 0 ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                        No metrics yet.
                      </div>
                    ) : (
                      metrics.map((metric) => (
                        <div key={`${metric.label}-${metric.value}`} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
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

              {isSectionVisible('results') && (
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-[#191919]">Recent results</h2>
                    <span className="text-xs font-semibold text-[#4a4a4a]">Read only</span>
                  </div>
                  <div className="mt-4 space-y-3 text-sm">
                    {results.length === 0 ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                        No results posted.
                      </div>
                    ) : (
                      results.map((result) => (
                        <div key={`${result.title}-${result.event_date || 'na'}`} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          <p className="font-semibold text-[#191919]">{result.title}</p>
                          <p className="text-xs text-[#4a4a4a]">
                            {result.event_date ? new Date(result.event_date).toLocaleDateString() : 'Date TBD'}
                            {result.placement ? ` · ${result.placement}` : ''}
                          </p>
                          {result.detail ? <p className="mt-1 text-xs text-[#4a4a4a]">{result.detail}</p> : null}
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )}

              {isSectionVisible('media') && (
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-[#191919]">Highlights</h2>
                    <span className="text-xs font-semibold text-[#4a4a4a]">Read only</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {media.length === 0 ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                        No highlights uploaded.
                      </div>
                    ) : (
                      media.slice(0, 6).map((item) => (
                        <a
                          key={`${item.media_url}-${item.title || 'highlight'}`}
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
                              unoptimized
                            />
                          </div>
                          <p className="mt-2 text-xs font-semibold text-[#191919]">{item.title || 'Highlight'}</p>
                        </a>
                      ))
                    )}
                  </div>
                </section>
              )}

              <section className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-[#191919]">Coach actions</h2>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/coach/messages?new=${slugify(displayName)}&type=athlete&id=${encodeURIComponent(athlete.id)}`}
                      className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Message athlete
                    </Link>
                    <Link
                      href={`/coach/notes?athlete=${encodeURIComponent(displayName)}`}
                      className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Add note
                    </Link>
                  </div>
                </div>
                {athlete.email ? (
                  <p className="mt-3 text-sm text-[#4a4a4a]">
                    Contact email: <span className="font-semibold text-[#191919] break-all">{athlete.email}</span>
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-[#4a4a4a]">No athlete email listed.</p>
                )}
              </section>
            </div>

            {/* Guardian — conditional */}
            {hasGuardian && (
              <div className="mt-6 glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#4a4a4a]">Guardian</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.15em] text-[#4a4a4a]">Name</p>
                    <p className="mt-1 text-sm font-semibold text-[#191919]">{athlete.guardian_name || '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.15em] text-[#4a4a4a]">Email</p>
                    <p className="mt-1 text-sm font-semibold text-[#191919]">{athlete.guardian_email || '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.15em] text-[#4a4a4a]">Phone</p>
                    <p className="mt-1 text-sm font-semibold text-[#191919]">{athlete.guardian_phone || '—'}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Sessions + Notes */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="glass-card border border-[#191919] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#191919]">Recent sessions</h2>
            <div className="mt-4 space-y-3 text-sm">
              {loading ? (
                <p className="text-xs text-[#4a4a4a]">Loading...</p>
              ) : sessions.length === 0 ? (
                <p className="text-xs text-[#4a4a4a]">No sessions recorded yet.</p>
              ) : (
                sessions.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <p className="font-semibold text-[#191919]">{s.title || 'Session'}</p>
                    <p className="text-xs text-[#4a4a4a]">
                      {s.start_time ? new Date(s.start_time).toLocaleDateString() : 'Date TBD'}
                      {s.duration_minutes ? ` · ${s.duration_minutes} min` : ''}
                      {s.status ? ` · ${s.status}` : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
            <Link href="/coach/bookings" className="mt-4 block text-xs font-semibold text-[#b80f0a]">
              View all bookings →
            </Link>
          </div>

          <div className="glass-card border border-[#191919] bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#191919]">Notes</h2>
              <Link
                href={`/coach/notes?athlete=${encodeURIComponent(athlete?.full_name || slug)}`}
                className="text-xs font-semibold text-[#b80f0a]"
              >
                Add note →
              </Link>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {loading ? (
                <p className="text-xs text-[#4a4a4a]">Loading...</p>
              ) : notes.length === 0 ? (
                <p className="text-xs text-[#4a4a4a]">No notes for this athlete yet.</p>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <p className="font-semibold text-[#191919]">{n.title}</p>
                    {n.body && <p className="mt-1 text-xs text-[#4a4a4a] line-clamp-2">{n.body}</p>}
                    <p className="mt-1 text-xs text-[#4a4a4a]">{new Date(n.created_at).toLocaleDateString()} · {n.type}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
