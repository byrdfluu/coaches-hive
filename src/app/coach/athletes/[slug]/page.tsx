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
  sport?: string | null
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

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const toDisplayName = (fullName?: string | null, email?: string | null) => {
  const name = String(fullName || '').trim()
  if (name) return name
  const emailValue = String(email || '').trim()
  if (!emailValue) return 'Athlete'
  return emailValue.split('@')[0].trim() || 'Athlete'
}

export default function CoachAthleteDynamicPage() {
  const supabase = createClientComponentClient()
  const params = useParams()
  const slug = String(params.slug || '')
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Booking[]>([])
  const [notes, setNotes] = useState<CoachNote[]>([])

  useEffect(() => {
    let active = true
    const loadData = async () => {
      setLoading(true)
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData.user?.id ?? null
      if (active) setCoachId(uid)

      const membershipResponse = await fetch('/api/memberships')
      if (!membershipResponse.ok) { setLoading(false); return }
      const payload = await membershipResponse.json()
      const links = payload.links || []
      const athleteIds: string[] = Array.from(
        new Set(links.map((link: { athlete_id?: string }) => link.athlete_id).filter(Boolean))
      )

      if (athleteIds.length === 0) { setLoading(false); return }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, sport')
        .in('id', athleteIds)

      if (!active) return
      const athleteProfiles = (profiles || []) as AthleteProfile[]
      const match = athleteProfiles.find(
        (p) => slugify(toDisplayName(p.full_name, p.email)) === slug
      )
      setAthlete(match || null)

      if (match && uid) {
        const [bookingsRes, notesRes] = await Promise.all([
          supabase
            .from('bookings')
            .select('id, title, start_time, status, duration_minutes')
            .eq('coach_id', uid)
            .eq('athlete_id', match.id)
            .order('start_time', { ascending: false })
            .limit(5),
          supabase
            .from('coach_notes')
            .select('id, title, body, created_at, type')
            .eq('coach_id', uid)
            .ilike('athlete', `%${match.full_name || ''}%`)
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
    if (!slug) return 'Athlete'
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }, [athlete, slug])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />

        <div className="glass-card border border-[#191919] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athlete profile</p>
              <h1 className="mt-2 text-2xl font-semibold text-[#191919]">
                {loading ? 'Loading...' : displayName}
              </h1>
              {(athlete?.email || athlete?.sport) && (
                <p className="mt-1 text-sm text-[#4a4a4a]">
                  {[athlete.email, athlete.sport].filter(Boolean).join(' · ')}
                </p>
              )}
              {!loading && !athlete && (
                <p className="mt-1 text-sm text-[#4a4a4a]">Athlete not found or not linked to your account.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {athlete && (
                <Link
                  href={`/coach/athletes/book?athlete=${encodeURIComponent(athlete.full_name || slug)}`}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  Book session
                </Link>
              )}
              <Link href="/coach/athletes" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
                Back to athletes
              </Link>
            </div>
          </div>
        </div>

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
