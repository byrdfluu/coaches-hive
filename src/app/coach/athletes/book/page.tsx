'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import Toast from '@/components/Toast'

type AthleteResult = {
  id: string
  full_name: string
  avatar_url: string | null
}

export default function BookAthleteSessionPage() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const [toast, setToast] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [athleteName, setAthleteName] = useState('')
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null)
  const [selectedSubProfileId, setSelectedSubProfileId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<AthleteResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [format, setFormat] = useState('1-on-1 session')
  const [duration, setDuration] = useState('60')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [focus, setFocus] = useState('')
  const [notes, setNotes] = useState('')
  const autocompleteRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const requestedAthlete = (searchParams?.get('athlete') || '').trim()
    const requestedAthleteId = (searchParams?.get('athlete_id') || '').trim()
    const requestedSubProfileId = (searchParams?.get('sub_profile_id') || '').trim()
    if (!requestedAthlete) return
    setAthleteName(requestedAthlete)
    if (requestedAthleteId) setSelectedAthleteId(requestedAthleteId)
    if (requestedSubProfileId) setSelectedSubProfileId(requestedSubProfileId)
  }, [searchParams])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Debounced search as the coach types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // If they selected from the dropdown and haven't changed the text, skip
    if (selectedAthleteId && athleteName) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    if (athleteName.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(athleteName.trim())}&role=athlete`)
        if (!res.ok) return
        const payload = await res.json().catch(() => null)
        const results: AthleteResult[] = payload?.users || []
        setSuggestions(results)
        setShowSuggestions(results.length > 0)
      } catch {
        // silently fail — user can still type a full name
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [athleteName, selectedAthleteId])

  const handleSelectSuggestion = (user: AthleteResult) => {
    setAthleteName(user.full_name)
    setSelectedAthleteId(user.id)
    setSelectedSubProfileId(null)
    setSuggestions([])
    setShowSuggestions(false)
  }

  const handleAthleteNameChange = (value: string) => {
    setAthleteName(value)
    // Clear the locked selection if they edit the name after picking
    if (selectedAthleteId) setSelectedAthleteId(null)
    if (selectedSubProfileId) setSelectedSubProfileId(null)
  }

  const resolveAthleteId = async (name: string) => {
    const response = await fetch('/api/messages/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: [name] }),
    })
    if (!response.ok) return null
    const payload = await response.json().catch(() => null)
    return payload?.ids?.[0] || null
  }

  const toSessionType = (label: string) => {
    if (label.toLowerCase().includes('group')) return 'group'
    if (label.toLowerCase().includes('team')) return 'team'
    if (label.toLowerCase().includes('assessment')) return 'assessment'
    if (label.toLowerCase().includes('virtual')) return 'virtual'
    return '1:1'
  }

  const handleConfirm = async () => {
    setNotice('')
    setSaving(true)
    const { data } = await supabase.auth.getUser()
    const coachId = data.user?.id
    if (!coachId) {
      setNotice('Please sign in to book.')
      setSaving(false)
      return
    }
    if (!athleteName.trim() || !date || !time) {
      setNotice('Select an athlete, date, and time.')
      setSaving(false)
      return
    }
    // Use the pre-resolved ID from autocomplete selection, or fall back to name resolution
    const athleteId = selectedAthleteId || await resolveAthleteId(athleteName)
    if (!athleteId) {
      setNotice('Could not find that athlete. Try selecting from the suggestions.')
      setSaving(false)
      return
    }
    const meetingMode = format === 'Virtual' ? 'online' : 'in_person'
    if (meetingMode === 'online' && !location.trim()) {
      setNotice('Add a video link for virtual sessions.')
      setSaving(false)
      return
    }
    const startTime = new Date(`${date}T${time}`)
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: focus || format,
        coach_id: coachId,
        athlete_id: athleteId,
        sub_profile_id: selectedSubProfileId,
        start_time: startTime.toISOString(),
        duration_minutes: Number(duration),
        session_type: toSessionType(format),
        status: 'Scheduled',
        location: location,
        notes,
        meeting_mode: meetingMode,
        meeting_provider: meetingMode === 'online' ? 'custom' : null,
        meeting_link: meetingMode === 'online' ? location : null,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setNotice(payload?.error || 'Unable to book session.')
      setSaving(false)
      return
    }
    setToast('Booking confirmed')
    setAthleteName('')
    setSelectedAthleteId(null)
    setSelectedSubProfileId(null)
    setSuggestions([])
    setFormat('1-on-1 session')
    setDuration('60')
    setDate('')
    setTime('')
    setLocation('')
    setFocus('')
    setNotes('')
    setSaving(false)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="glass-card space-y-6 border border-[#191919] bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Book session</p>
                <h1 className="mt-1 text-2xl font-semibold text-[#191919]">Schedule the next session</h1>
                <p className="mt-1 text-sm text-[#4a4a4a]">
                  Choose the athlete, format, time, and location. We&apos;ll drop it onto the calendar and notify them.
                </p>
              </div>
              <Link href="/coach/athletes" className="text-sm font-semibold text-[#b80f0a]">
                Back to athletes
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Athlete</span>
                <div ref={autocompleteRef} className="relative">
                  <input
                    className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="Start typing a name"
                    value={athleteName}
                    onChange={(e) => handleAthleteNameChange(e.target.value)}
                    onFocus={() => {
                      if (suggestions.length > 0) setShowSuggestions(true)
                    }}
                    autoComplete="off"
                  />
                  {showSuggestions && (
                    <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-[#dcdcdc] bg-white shadow-lg">
                      {suggestions.map((user) => (
                        <li key={user.id}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              // mousedown fires before blur; prevent blur from hiding list first
                              e.preventDefault()
                              handleSelectSuggestion(user)
                            }}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-[#191919] hover:bg-[#f5f5f5]"
                          >
                            {user.avatar_url ? (
                              <Image
                                src={user.avatar_url}
                                alt=""
                                width={24}
                                height={24}
                                className="h-6 w-6 rounded-full object-cover"
                              />
                            ) : (
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#191919] text-xs font-semibold text-white">
                                {user.full_name.charAt(0).toUpperCase()}
                              </span>
                            )}
                            {user.full_name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </label>
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Format</span>
                <select
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  value={format}
                  onChange={(event) => setFormat(event.target.value)}
                >
                  <option>1-on-1 session</option>
                  <option>Group session</option>
                  <option>Team session</option>
                  <option>Assessment</option>
                  <option>Virtual</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Duration</span>
                <select
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                >
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">60 min</option>
                  <option value="75">75 min</option>
                  <option value="90">90 min</option>
                  <option value="120">2 hours</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Date</span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Time</span>
                <input
                  type="time"
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Location</span>
                <input
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  placeholder="Gym address or virtual link"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm text-[#191919]">
                <span>Session focus</span>
                <input
                  className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  placeholder="Speed work, recovery, skills..."
                  value={focus}
                  onChange={(event) => setFocus(event.target.value)}
                />
              </label>
            </div>

            <label className="space-y-2 text-sm text-[#191919]">
              <span>Notes for the athlete</span>
              <textarea
                className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                rows={4}
                placeholder="Share prep instructions, equipment, or goals."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>

            {notice && <p className="text-xs text-[#b80f0a]">{notice}</p>}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                className="rounded-full bg-[#b80f0a] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                {saving ? 'Booking...' : 'Confirm booking'}
              </button>
              <Link
                href="/coach/athletes"
                className="rounded-full border border-[#191919] px-5 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
