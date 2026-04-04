'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CoachSidebar from '@/components/CoachSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Toast from '@/components/Toast'

type NoteType = 'session' | 'progress' | 'staff'

type NoteRow = {
  id: string
  type: NoteType
  athlete: string
  team: string
  date: string
  title: string
  body: string
  tags: string[]
  shared: boolean
  pinned: boolean
}

type LinkedAthleteOption = {
  id: string
  name: string
}

const typeTabs: Array<{ id: 'all' | NoteType | 'shared'; label: string }> = [
  { id: 'all', label: 'All notes' },
  { id: 'session', label: 'Session notes' },
  { id: 'progress', label: 'Progress notes' },
  { id: 'staff', label: 'Staff notes' },
  { id: 'shared', label: 'Shared with athlete' },
]

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const noteTemplates = [
  {
    id: 'session-recap',
    label: 'Session recap',
    type: 'session' as NoteType,
    title: 'Session recap',
    body: 'Highlight key wins, focus areas, and next-session priorities.',
    tags: ['session', 'follow-up'],
    shared: true,
  },
  {
    id: 'progress-check',
    label: 'Progress check-in',
    type: 'progress' as NoteType,
    title: 'Progress check-in',
    body: 'Capture changes since last week and what to reinforce next.',
    tags: ['progress'],
    shared: true,
  },
  {
    id: 'injury-update',
    label: 'Injury update',
    type: 'staff' as NoteType,
    title: 'Injury update',
    body: 'Status update, restrictions, and return-to-play plan.',
    tags: ['injury', 'care-plan'],
    shared: false,
  },
  {
    id: 'travel-note',
    label: 'Travel note',
    type: 'staff' as NoteType,
    title: 'Travel logistics',
    body: 'Confirm arrival times, location changes, and action items.',
    tags: ['travel', 'ops'],
    shared: false,
  },
]

export default function CoachNotesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [linkedAthletes, setLinkedAthletes] = useState<LinkedAthleteOption[]>([])
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | NoteType | 'shared'>('all')
  const [athleteFilter, setAthleteFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [dateRange, setDateRange] = useState<'all' | '7' | '30' | '90'>('30')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [sharedOnly, setSharedOnly] = useState(false)
  const [tagFilter, setTagFilter] = useState('all')
  const [toast, setToast] = useState('')
  const [athleteModalOpen, setAthleteModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [allNotesOpen, setAllNotesOpen] = useState(false)
  const [showAthleteSuggestions, setShowAthleteSuggestions] = useState(false)
  const [newNote, setNewNote] = useState({
    type: 'session' as NoteType,
    athlete: '',
    team: '',
    title: '',
    body: '',
    tags: '',
    shared: true,
  })
  const athleteAutocompleteRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true
    const loadNotes = async () => {
      setLoadingNotes(true)
      const response = await fetch('/api/coach/notes')
      if (!response.ok || !active) { setLoadingNotes(false); return }
      const payload = await response.json().catch(() => null)
      if (!active) return
      const rows = (payload?.notes || []).map((row: { id: string; type: string; athlete: string; team: string; title: string; body: string; tags: string[] | null; shared: boolean; pinned: boolean; created_at: string }) => ({
        id: row.id,
        type: (row.type || 'session') as NoteType,
        athlete: row.athlete || '',
        team: row.team || '',
        date: row.created_at,
        title: row.title,
        body: row.body || '',
        tags: row.tags || [],
        shared: Boolean(row.shared),
        pinned: Boolean(row.pinned),
      }))
      setNotes(rows)
      setLoadingNotes(false)
    }
    loadNotes()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const loadLinkedAthletes = async () => {
      const response = await fetch('/api/memberships')
      if (!response.ok || !active) return
      const payload = await response.json().catch(() => null)
      if (!active) return
      const links = Array.isArray(payload?.links) ? payload.links : []
      const nextAthletes = links
        .map((link: { athlete_id?: string | null; profiles?: { full_name?: string | null } | null }) => {
          const id = typeof link.athlete_id === 'string' ? link.athlete_id : ''
          const name = typeof link.profiles?.full_name === 'string' ? link.profiles.full_name.trim() : ''
          if (!id || !name) return null
          return { id, name }
        })
        .filter((option: LinkedAthleteOption | null): option is LinkedAthleteOption => Boolean(option))

      const deduped = Array.from(
        new Map<string, LinkedAthleteOption>(
          nextAthletes.map((option: LinkedAthleteOption) => [option.name.toLowerCase(), option])
        ).values()
      )
      setLinkedAthletes(deduped)
    }

    loadLinkedAthletes()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (athleteAutocompleteRef.current && !athleteAutocompleteRef.current.contains(event.target as Node)) {
        setShowAthleteSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const tags = useMemo(() => {
    const list = notes.flatMap((note) => note.tags)
    return Array.from(new Set(list))
  }, [notes])

  const athletes = useMemo(() => Array.from(new Set(notes.map((note) => note.athlete))), [notes])
  const teams = useMemo(() => Array.from(new Set(notes.map((note) => note.team))), [notes])
  const athleteSuggestions = useMemo(() => {
    const query = newNote.athlete.trim().toLowerCase()
    if (!query) return []

    const options = [
      ...linkedAthletes,
      ...athletes
        .filter(Boolean)
        .map((name) => ({ id: name.toLowerCase(), name })),
    ]

    const deduped = Array.from(
      new Map<string, LinkedAthleteOption>(
        options.map((option: LinkedAthleteOption) => [option.name.toLowerCase(), option])
      ).values()
    )
    return deduped.filter((option) => option.name.toLowerCase().includes(query)).slice(0, 6)
  }, [athletes, linkedAthletes, newNote.athlete])

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase()
    const now = Date.now()
    return notes.filter((note) => {
      if (activeTab === 'shared' && !note.shared) return false
      if (activeTab !== 'all' && activeTab !== 'shared' && note.type !== activeTab) return false
      if (sharedOnly && !note.shared) return false
      if (pinnedOnly && !note.pinned) return false
      if (tagFilter !== 'all' && !note.tags.includes(tagFilter)) return false
      if (athleteFilter !== 'all' && note.athlete !== athleteFilter) return false
      if (teamFilter !== 'all' && note.team !== teamFilter) return false
      if (dateRange !== 'all') {
        const diffDays = (now - new Date(note.date).getTime()) / 86400000
        if (dateRange === '7' && diffDays > 7) return false
        if (dateRange === '30' && diffDays > 30) return false
        if (dateRange === '90' && diffDays > 90) return false
      }
      if (query) {
        const haystack = `${note.title} ${note.athlete} ${note.team} ${note.body}`.toLowerCase()
        return haystack.includes(query)
      }
      return true
    })
  }, [notes, search, activeTab, tagFilter, athleteFilter, teamFilter, dateRange, pinnedOnly, sharedOnly])

  const selectedNote = notes.find((note) => note.id === selectedId) || filteredNotes[0] || null

  const athleteParam = (searchParams?.get('athlete') || '').trim()
  const athleteSlug = athleteParam ? slugify(athleteParam) : ''
  const athleteNotes = useMemo(() => {
    if (!athleteSlug) return []
    return notes.filter((note) => slugify(note.athlete) === athleteSlug)
  }, [notes, athleteSlug])
  const athleteName = useMemo(() => {
    if (athleteNotes[0]?.athlete) return athleteNotes[0].athlete
    if (!athleteSlug) return ''
    return athleteSlug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }, [athleteNotes, athleteSlug])

  useEffect(() => {
    if (athleteSlug) {
      setAthleteModalOpen(true)
    } else {
      setAthleteModalOpen(false)
    }
  }, [athleteSlug])

  const closeAthleteModal = () => {
    setAthleteModalOpen(false)
    router.push('/coach/notes')
  }

  const summary = useMemo(() => {
    const now = Date.now()
    const lastSeven = notes.filter((note) => (now - new Date(note.date).getTime()) / 86400000 <= 7).length
    const followUps = notes.filter((note) => note.tags.some((tag) => tag.toLowerCase().includes('follow'))).length
    const athleteCounts = notes.reduce<Record<string, number>>((acc, note) => {
      acc[note.athlete] = (acc[note.athlete] || 0) + 1
      return acc
    }, {})
    const topAthlete = Object.entries(athleteCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
    const tagCounts = notes.flatMap((note) => note.tags).reduce<Record<string, number>>((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1
      return acc
    }, {})
    const topTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
    return { lastSeven, topAthlete, topTag, followUps }
  }, [notes])

  const handleTogglePin = useCallback((id: string) => {
    setNotes((prev) => {
      const note = prev.find((n) => n.id === id)
      if (!note) return prev
      const nextPinned = !note.pinned
      fetch('/api/coach/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, pinned: nextPinned }),
      }).catch(() => {})
      return prev.map((n) => (n.id === id ? { ...n, pinned: nextPinned } : n))
    })
  }, [])

  const handleToggleShared = useCallback((id: string) => {
    setNotes((prev) => {
      const note = prev.find((n) => n.id === id)
      if (!note) return prev
      const nextShared = !note.shared
      fetch('/api/coach/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, shared: nextShared }),
      }).catch(() => {})
      return prev.map((n) => (n.id === id ? { ...n, shared: nextShared } : n))
    })
  }, [])

  const handleCreateNote = async () => {
    if (!newNote.title.trim() || !newNote.body.trim()) {
      setToast('Add a title and note body.')
      return
    }
    const tags = newNote.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    const response = await fetch('/api/coach/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: newNote.type,
        athlete: newNote.athlete.trim() || 'Athlete',
        team: newNote.team.trim() || 'Team',
        title: newNote.title.trim(),
        body: newNote.body.trim(),
        tags,
        shared: newNote.shared,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.note) {
      setToast(payload?.error || 'Failed to save note.')
      return
    }
    const created: NoteRow = {
      id: payload.note.id,
      type: payload.note.type as NoteType,
      athlete: payload.note.athlete,
      team: payload.note.team,
      date: payload.note.created_at,
      title: payload.note.title,
      body: payload.note.body,
      tags: payload.note.tags || [],
      shared: payload.note.shared,
      pinned: payload.note.pinned,
    }
    setNotes((prev) => [created, ...prev])
    setSelectedId(created.id)
    setNewNote({ type: 'session', athlete: '', team: '', title: '', body: '', tags: '', shared: true })
    setToast('Note saved.')
  }

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId)
    const template = noteTemplates.find((item) => item.id === templateId)
    if (!template) return
    setNewNote((prev) => ({
      ...prev,
      type: template.type,
      title: template.title,
      body: template.body,
      tags: template.tags.join(', '),
      shared: template.shared,
    }))
  }

  const handleAthleteInputChange = (value: string) => {
    setNewNote((prev) => ({ ...prev, athlete: value }))
    setShowAthleteSuggestions(value.trim().length > 0)
  }

  const handleAthleteSuggestionSelect = (name: string) => {
    setNewNote((prev) => ({ ...prev, athlete: name }))
    setShowAthleteSuggestions(false)
  }

  const sortedAllNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
  }, [notes])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Notes hub</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">All coaching notes</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Session notes, progress updates, and internal staff notes.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="space-y-6">
            <section className="grid gap-3 md:grid-cols-4">
              {[
                { label: 'Notes in last 7 days', value: summary.lastSeven.toString() },
                { label: 'Most active athlete', value: summary.topAthlete },
                { label: 'Top tag', value: summary.topTag },
                { label: 'Needs follow-up', value: summary.followUps.toString() },
              ].map((item) => (
                <div key={item.label} className="glass-card border border-[#191919] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{item.value}</p>
                </div>
              ))}
            </section>

            <section className="glass-card border border-[#191919] bg-white p-5 text-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#191919]">Filters</h2>
                <span className="text-xs text-[#6b5f55]">Refine notes</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-semibold text-[#191919]">Type</span>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {typeTabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={`rounded-full border px-3 py-1 font-semibold ${
                            activeTab === tab.id ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Athlete</span>
                    <select
                      value={athleteFilter}
                      onChange={(event) => setAthleteFilter(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                    >
                      <option value="all">All athletes</option>
                      {athletes.map((athlete) => (
                        <option key={athlete} value={athlete}>
                          {athlete}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Team</span>
                    <select
                      value={teamFilter}
                      onChange={(event) => setTeamFilter(event.target.value)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                    >
                      <option value="all">All teams</option>
                      {teams.map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Date range</span>
                    <select
                      value={dateRange}
                      onChange={(event) => setDateRange(event.target.value as 'all' | '7' | '30' | '90')}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                    >
                      <option value="7">Last 7 days</option>
                      <option value="30">Last 30 days</option>
                      <option value="90">Last 90 days</option>
                      <option value="all">All time</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-[#6b5f55]">
                    <input
                      type="checkbox"
                      checked={pinnedOnly}
                      onChange={(event) => setPinnedOnly(event.target.checked)}
                    />
                    Pinned only
                  </label>
                  <label className="flex items-center gap-2 text-xs text-[#6b5f55]">
                    <input
                      type="checkbox"
                      checked={sharedOnly}
                      onChange={(event) => setSharedOnly(event.target.checked)}
                    />
                    Shared only
                  </label>
                  <div className="space-y-2 md:col-span-2">
                    <span className="text-xs font-semibold text-[#191919]">Tags</span>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setTagFilter('all')}
                        className={`rounded-full border px-3 py-1 font-semibold ${
                          tagFilter === 'all' ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
                        }`}
                      >
                        All tags
                      </button>
                      {tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setTagFilter(tag)}
                          className={`rounded-full border px-3 py-1 font-semibold ${
                            tagFilter === tag ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.9fr]">
              <section className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[#191919]">Recent notes</h2>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setAllNotesOpen(true)}
                      className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      All notes
                    </button>
                    <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                      {filteredNotes.length} notes
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search notes, athletes, teams"
                    className="w-full rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919]"
                  />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {loadingNotes ? (
                    <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] px-4 py-5 text-sm text-[#6b5f55] md:col-span-2">
                      Loading notes…
                    </div>
                  ) : filteredNotes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] px-4 py-5 text-sm text-[#6b5f55] md:col-span-2">
                      No notes yet. Create your first note below.
                    </div>
                  ) : (
                    filteredNotes.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => setSelectedId(note.id)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                          selectedNote?.id === note.id
                            ? 'border-[#191919] bg-white'
                            : 'border-[#dcdcdc] bg-[#f5f5f5] hover:border-[#191919]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[#191919]">{note.title}</p>
                            <p className="mt-1 text-xs text-[#6b5f55]">
                              {note.athlete} · {note.team}
                            </p>
                          </div>
                          <div className="text-[11px] uppercase tracking-[0.3em] text-[#6b5f55]">
                            {note.type}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6b5f55]">
                          <span>{new Date(note.date).toLocaleDateString()}</span>
                          {note.pinned ? (
                            <span className="rounded-full border border-[#191919] px-2 py-0.5 text-[10px] font-semibold text-[#191919]">
                              Pinned
                            </span>
                          ) : null}
                          {note.shared ? (
                            <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] text-[#6b5f55]">
                              Shared
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </section>

              <section className="glass-card border border-[#191919] bg-white p-5">
                {selectedNote ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Note detail</p>
                        <h2 className="mt-2 text-xl font-semibold text-[#191919]">{selectedNote.title}</h2>
                        <p className="mt-1 text-xs text-[#6b5f55]">
                          {selectedNote.athlete} · {selectedNote.team} · {new Date(selectedNote.date).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(selectedNote.id)}
                          className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                        >
                          {selectedNote.pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleShared(selectedNote.id)}
                          className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                        >
                          {selectedNote.shared ? 'Shared' : 'Share with athlete'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                      {selectedNote.body}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {selectedNote.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[#6b5f55]">Select a note to see details.</p>
                )}
              </section>
            </div>

            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#191919]">Add a note</h3>
                <button
                  type="button"
                  onClick={handleCreateNote}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                >
                  Save note
                </button>
              </div>
              <div className="mt-3 grid gap-3 text-sm">
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#191919]">Template</span>
                  <select
                    value={selectedTemplate}
                    onChange={(event) => handleTemplateSelect(event.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  >
                    <option value="">Select a template</option>
                    {noteTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Type</span>
                    <select
                      value={newNote.type}
                      onChange={(event) => setNewNote((prev) => ({ ...prev, type: event.target.value as NoteType }))}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    >
                      <option value="session">Session note</option>
                      <option value="progress">Progress note</option>
                      <option value="staff">Staff note</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Athlete</span>
                    <div ref={athleteAutocompleteRef} className="relative">
                      <input
                        value={newNote.athlete}
                        onChange={(event) => handleAthleteInputChange(event.target.value)}
                        onFocus={() => {
                          if (newNote.athlete.trim() && athleteSuggestions.length > 0) {
                            setShowAthleteSuggestions(true)
                          }
                        }}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        placeholder="Start typing an athlete name"
                        autoComplete="off"
                      />
                      {showAthleteSuggestions && athleteSuggestions.length > 0 ? (
                        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-2xl border border-[#dcdcdc] bg-white shadow-lg">
                          {athleteSuggestions.map((athlete) => (
                            <button
                              key={`${athlete.id}-${athlete.name}`}
                              type="button"
                              onClick={() => handleAthleteSuggestionSelect(athlete.name)}
                              className="block w-full border-b border-[#f1f1f1] px-3 py-2 text-left text-sm text-[#191919] transition hover:bg-[#f5f5f5] last:border-b-0"
                            >
                              {athlete.name}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Team</span>
                    <input
                      value={newNote.team}
                      onChange={(event) => setNewNote((prev) => ({ ...prev, team: event.target.value }))}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      placeholder="Team or program"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#191919]">Tags (comma separated)</span>
                    <input
                      value={newNote.tags}
                      onChange={(event) => setNewNote((prev) => ({ ...prev, tags: event.target.value }))}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      placeholder="speed, technique"
                    />
                  </label>
                </div>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#191919]">Title</span>
                  <input
                    value={newNote.title}
                    onChange={(event) => setNewNote((prev) => ({ ...prev, title: event.target.value }))}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    placeholder="Short summary"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#191919]">Note</span>
                  <textarea
                    value={newNote.body}
                    onChange={(event) => setNewNote((prev) => ({ ...prev, body: event.target.value }))}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    rows={3}
                    placeholder="Write the note..."
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-[#6b5f55]">
                  <input
                    type="checkbox"
                    checked={newNote.shared}
                    onChange={(event) => setNewNote((prev) => ({ ...prev, shared: event.target.checked }))}
                  />
                  Share with athlete
                </label>
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {tags.slice(0, 6).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setNewNote((prev) => ({
                            ...prev,
                            tags: prev.tags
                              ? `${prev.tags}, ${tag}`
                              : tag,
                          }))
                        }
                        className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#6b5f55] hover:text-[#191919]"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </div>
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
      {allNotesOpen ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4 py-10">
          <div className="w-full max-w-4xl rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">All notes</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Complete notes list</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">{sortedAllNotes.length} total notes</p>
              </div>
              <button
                type="button"
                onClick={() => setAllNotesOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close all notes"
              >
                ×
              </button>
            </div>
            <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-2">
              {sortedAllNotes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#6b5f55]">
                  No notes to display yet.
                </div>
              ) : (
                sortedAllNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(note.id)
                      setAllNotesOpen(false)
                    }}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white p-4 text-left text-sm transition hover:border-[#191919]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#191919]">{note.title}</p>
                        <p className="mt-1 text-xs text-[#6b5f55]">
                          {note.athlete} · {note.team} · {new Date(note.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#6b5f55]">
                        <span>{note.type}</span>
                        {note.pinned ? <span className="rounded-full border border-[#191919] px-2 py-0.5">Pinned</span> : null}
                        {note.shared ? <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5">Shared</span> : null}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-[#6b5f55] line-clamp-2">{note.body}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
      {athleteModalOpen ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4 py-10">
          <div className="w-full max-w-3xl rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Athlete notes</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{athleteName || 'Athlete'}</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">{athleteNotes.length} notes</p>
              </div>
              <button
                type="button"
                onClick={closeAthleteModal}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close notes"
              >
                ×
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-2">
              {athleteNotes.length === 0 ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#6b5f55]">
                  No notes yet for this athlete.
                </div>
              ) : (
                athleteNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(note.id)
                      setAthleteModalOpen(false)
                      router.push('/coach/notes')
                    }}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white p-4 text-left text-sm transition hover:border-[#191919]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#191919]">{note.title}</p>
                        <p className="mt-1 text-xs text-[#6b5f55]">
                          {note.team} · {new Date(note.date).toLocaleString()}
                        </p>
                      </div>
                      <span className="text-[11px] uppercase tracking-[0.3em] text-[#6b5f55]">{note.type}</span>
                    </div>
                    <p className="mt-2 text-xs text-[#6b5f55]">{note.body}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
