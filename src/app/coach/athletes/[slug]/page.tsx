'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
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
  const slug = String(params.slug || '')
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Booking[]>([])
  const [notes, setNotes] = useState<CoachNote[]>([])

  useEffect(() => {
    let active = true
    const loadData = async () => {
      setLoading(true)
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData.user?.id ?? null
      // uid used below for fetching bookings/notes owned by this coach

      // Resolve athlete ID: if slug is a UUID use it directly,
      // otherwise resolve via memberships (legacy name-slug links)
      let athleteId: string | null = null
      if (isUuid(slug)) {
        athleteId = slug
      } else {
        const membershipResponse = await fetch('/api/memberships')
        if (membershipResponse.ok) {
          const payload = await membershipResponse.json()
          const links: Array<{ athlete_id?: string; profiles?: { id: string; full_name: string | null; email?: string | null } | null }> = payload.links || []
          const match = links.find((l) => {
            const name = toDisplayName(l.profiles?.full_name, l.profiles?.email)
            return slugify(name) === slug
          })
          athleteId = match?.athlete_id ?? null
        }
      }

      if (!athleteId) { setLoading(false); return }

      // Fetch full profile via server-side API (bypasses RLS)
      const profileResponse = await fetch(`/api/athletes/${athleteId}/profile`)
      if (!active) return
      if (profileResponse.ok) {
        const profileData = await profileResponse.json()
        setAthlete(profileData.profile as AthleteProfile)
      }

      if (uid && athleteId) {
        const [bookingsRes, notesRes] = await Promise.all([
          supabase
            .from('bookings')
            .select('id, title, start_time, status, duration_minutes')
            .eq('coach_id', uid)
            .eq('athlete_id', athleteId)
            .order('start_time', { ascending: false })
            .limit(5),
          supabase
            .from('coach_notes')
            .select('id, title, body, created_at, type')
            .eq('coach_id', uid)
            .order('created_at', { ascending: false })
            .limit(5),
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
  }, [slug, supabase])

  const displayName = useMemo(() => {
    if (athlete) return toDisplayName(athlete.full_name, athlete.email)
    if (!slug || isUuid(slug)) return 'Athlete'
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }, [athlete, slug])

  const subtitleParts = [athlete?.athlete_location, athlete?.athlete_sport].filter(Boolean)

  const hasGuardian = !!(athlete?.guardian_name || athlete?.guardian_email || athlete?.guardian_phone)

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
                  <img src={athlete.avatar_url} alt={displayName} className="h-16 w-16 rounded-full object-cover" />
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
                  href={`/coach/athletes/book?athlete=${encodeURIComponent(athlete.full_name || slug)}&athlete_id=${encodeURIComponent(athlete.id)}`}
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
            {/* Profile info — 3 columns */}
            <div className="mt-6 glass-card border border-[#191919] bg-white p-6">
              <div className="grid gap-6 md:grid-cols-3">
                {/* About */}
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">About</p>
                  <p className="mt-2 text-sm text-[#191919]">
                    {athlete.bio || <span className="text-[#4a4a4a] italic">No bio added.</span>}
                  </p>
                </div>

                {/* Info */}
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Info</p>
                  <div className="mt-2 space-y-1 text-sm">
                    {athlete.athlete_sport && (
                      <div className="flex justify-between gap-2">
                        <span className="text-[#4a4a4a]">Sport</span>
                        <span className="font-medium text-[#191919]">{athlete.athlete_sport}</span>
                      </div>
                    )}
                    {athlete.athlete_season && (
                      <div className="flex justify-between gap-2">
                        <span className="text-[#4a4a4a]">Season</span>
                        <span className="font-medium text-[#191919]">{athlete.athlete_season}</span>
                      </div>
                    )}
                    {athlete.athlete_grade_level && (
                      <div className="flex justify-between gap-2">
                        <span className="text-[#4a4a4a]">Grade</span>
                        <span className="font-medium text-[#191919]">{athlete.athlete_grade_level}</span>
                      </div>
                    )}
                    {athlete.athlete_birthdate && (
                      <div className="flex justify-between gap-2">
                        <span className="text-[#4a4a4a]">Date of birth</span>
                        <span className="font-medium text-[#191919]">
                          {new Date(athlete.athlete_birthdate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                    {athlete.athlete_location && (
                      <div className="flex justify-between gap-2">
                        <span className="text-[#4a4a4a]">Location</span>
                        <span className="font-medium text-[#191919]">{athlete.athlete_location}</span>
                      </div>
                    )}
                    {!athlete.athlete_sport && !athlete.athlete_season && !athlete.athlete_grade_level && !athlete.athlete_birthdate && !athlete.athlete_location && (
                      <p className="text-[#4a4a4a] italic">No info added yet.</p>
                    )}
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Contact</p>
                  <div className="mt-2 space-y-1 text-sm">
                    {athlete.email && (
                      <div className="flex justify-between gap-2">
                        <span className="text-[#4a4a4a]">Email</span>
                        <span className="font-medium text-[#191919] break-all">{athlete.email}</span>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/coach/messages?new=${slugify(displayName)}&type=athlete&id=${encodeURIComponent(athlete.id)}`}
                        className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        Message
                      </Link>
                      <Link
                        href={`/coach/notes?athlete=${encodeURIComponent(displayName)}`}
                        className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        Notes
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
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