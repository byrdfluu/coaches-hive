'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AthleteSidebar from '@/components/AthleteSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import { useAthleteProfile } from '@/components/AthleteProfileContext'
import { formatWeekLabel, getWeekStart } from '@/lib/dateUtils'

type AthleteNote = {
  id: string
  coach: string
  authoredByCurrentUser: boolean
  program: string
  date: string
  title: string
  body: string
  tags: string[]
}

type ProgressNote = {
  id: string
  author_id?: string | null
  author_name?: string | null
  authored_by_current_user?: boolean
  note: string
  created_at?: string | null
}

const formatNoteTitle = (note: string) => {
  const firstLine = note.split('\n')[0]?.trim()
  if (!firstLine) return 'Progress note'
  return firstLine.length > 48 ? `${firstLine.slice(0, 48)}...` : firstLine
}

const formatNotePreview = (note: string) => {
  const cleaned = note.replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  if (cleaned.length <= 90) return cleaned
  return `${cleaned.slice(0, 90)}...`
}

const noteTemplates = [
  {
    id: 'weekly-recap',
    label: 'Weekly recap',
    body: 'Wins this week:\nChallenges:\nWhat I will focus on next:',
  },
  {
    id: 'training-goal',
    label: 'Training goal',
    body: 'Goal for the next session:\nHow I will measure progress:',
  },
  {
    id: 'recovery-note',
    label: 'Recovery note',
    body: 'How recovery felt:\nAnything to adjust before next session:',
  },
]

export default function AthleteNotesPage() {
  const { activeSubProfileId } = useAthleteProfile()
  const [today, setToday] = useState<Date | null>(null)
  const weekStart = useMemo(() => (today ? getWeekStart(today) : null), [today])
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteNotice, setNoteNotice] = useState('')
  const [progressNotes, setProgressNotes] = useState<ProgressNote[]>([])
  const notes = useMemo<AthleteNote[]>(
    () =>
      progressNotes.map((entry) => ({
        id: entry.id,
        coach: entry.author_name || 'Coach',
        authoredByCurrentUser: Boolean(entry.authored_by_current_user),
        program: 'Progress note',
        date: entry.created_at || new Date().toISOString(),
        title: formatNoteTitle(entry.note),
        body: entry.note,
        tags: [entry.authored_by_current_user ? 'private' : 'coach feedback'],
      })),
    [progressNotes],
  )
  const [search, setSearch] = useState('')
  const [coachFilter, setCoachFilter] = useState('all')
  const [programFilter, setProgramFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [dateRange, setDateRange] = useState<'all' | '7' | '30' | '90'>('30')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [selectedTimelineId, setSelectedTimelineId] = useState('')
  const [allNotesOpen, setAllNotesOpen] = useState(false)

  useEffect(() => {
    setToday(new Date())
  }, [])

  const loadNotes = useCallback(
    async () => {
      const url = activeSubProfileId
        ? `/api/athlete/notes?athlete_profile_id=${encodeURIComponent(activeSubProfileId)}`
        : '/api/athlete/notes'
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) {
        setNoteNotice('Unable to load progress notes.')
        return
      }
      const payload = await response.json().catch(() => ({}))
      const rows = (payload.notes || []) as ProgressNote[]
      setProgressNotes(rows)
    },
    [activeSubProfileId],
  )

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  const handleSaveNote = useCallback(async () => {
    const trimmed = noteText.trim()
    if (!trimmed) return
    setNoteSaving(true)
    setNoteNotice('')
    const response = await fetch('/api/athlete/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: trimmed, athlete_profile_id: activeSubProfileId || null }),
    })
    if (!response.ok) {
      setNoteNotice('Unable to save progress note.')
      setNoteSaving(false)
      return
    }
    setNoteText('')
    setNoteNotice('Note saved.')
    await loadNotes()
    setNoteSaving(false)
  }, [activeSubProfileId, loadNotes, noteText])

  const handleDeleteNote = useCallback(async (id: string) => {
    const response = await fetch(`/api/athlete/notes?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (response.ok) {
      setProgressNotes((prev) => prev.filter((n) => n.id !== id))
      if (selectedTimelineId === id) setSelectedTimelineId('')
    } else {
      const payload = await response.json().catch(() => ({}))
      setNoteNotice(payload?.error || 'Unable to delete note.')
    }
  }, [selectedTimelineId])

  const coaches = useMemo(() => Array.from(new Set(notes.map((note) => note.coach))), [notes])
  const programs = useMemo(() => Array.from(new Set(notes.map((note) => note.program))), [notes])
  const tags = useMemo(() => Array.from(new Set(notes.flatMap((note) => note.tags))), [notes])

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase()
    const now = Date.now()
    return notes.filter((note) => {
      if (coachFilter !== 'all' && note.coach !== coachFilter) return false
      if (programFilter !== 'all' && note.program !== programFilter) return false
      if (tagFilter !== 'all' && !note.tags.includes(tagFilter)) return false
      if (dateRange !== 'all') {
        const diffDays = (now - new Date(note.date).getTime()) / 86400000
        if (dateRange === '7' && diffDays > 7) return false
        if (dateRange === '30' && diffDays > 30) return false
        if (dateRange === '90' && diffDays > 90) return false
      }
      if (query) {
        const haystack = `${note.title} ${note.body} ${note.coach} ${note.program}`.toLowerCase()
        return haystack.includes(query)
      }
      return true
    })
  }, [notes, search, coachFilter, programFilter, tagFilter, dateRange])

  const selectedTimelineNote =
    filteredNotes.find((note) => note.id === selectedTimelineId) || filteredNotes[0] || null

  const summary = useMemo(() => {
    const tagCounts = notes.flatMap((note) => note.tags).reduce<Record<string, number>>((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1
      return acc
    }, {})
    const topTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
    const coachCounts = notes.reduce<Record<string, number>>((acc, note) => {
      acc[note.coach] = (acc[note.coach] || 0) + 1
      return acc
    }, {})
    const topCoach = Object.entries(coachCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
    return {
      recent: notes.length,
      coaches: coaches.length,
      programs: programs.length,
      topTag,
      topCoach,
    }
  }, [notes, coaches, programs])

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId)
    const template = noteTemplates.find((item) => item.id === templateId)
    if (!template) return
    setNoteText(template.body)
  }

  const sortedAllNotes = useMemo(() => {
    return [...notes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [notes])

  useEffect(() => {
    if (filteredNotes.length === 0) return
    if (!filteredNotes.some((note) => note.id === selectedTimelineId)) {
      setSelectedTimelineId(filteredNotes[0].id)
    }
  }, [filteredNotes, selectedTimelineId])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Notes</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Progress notes</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Your saved notes and coach feedback stay here after refresh.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">
            <section className="grid gap-3 md:grid-cols-4">
              {[
                { label: 'Notes this season', value: summary.recent.toString() },
                { label: 'Coaches engaged', value: summary.coaches.toString() },
                { label: 'Active programs', value: summary.programs.toString() },
                { label: 'Top tag', value: summary.topTag },
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
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#191919]">Coach</span>
                  <select
                    value={coachFilter}
                    onChange={(event) => setCoachFilter(event.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                  >
                    <option value="all">All coaches</option>
                    {coaches.map((coach) => (
                      <option key={coach} value={coach}>
                        {coach}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#191919]">Program</span>
                  <select
                    value={programFilter}
                    onChange={(event) => setProgramFilter(event.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                  >
                    <option value="all">All programs</option>
                    {programs.map((program) => (
                      <option key={program} value={program}>
                        {program}
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
                <div className="space-y-2 md:col-span-2">
                  <span className="text-xs font-semibold text-[#191919]">Tags</span>
                  <div className="flex flex-wrap gap-2 text-[11px]">
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
                    placeholder="Search notes"
                    className="w-full rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919]"
                  />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {filteredNotes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] px-4 py-5 text-sm text-[#6b5f55] md:col-span-2">
                      No notes yet.
                    </div>
                  ) : (
                    filteredNotes.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => setSelectedTimelineId(note.id)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                          selectedTimelineNote?.id === note.id
                            ? 'border-[#191919] bg-white'
                            : 'border-[#dcdcdc] bg-[#f5f5f5] hover:border-[#191919]'
                        }`}
                      >
                        <p className="font-semibold text-[#191919]">{note.title}</p>
                        <p className="mt-1 text-xs text-[#6b5f55]">
                          {note.coach} · {note.program}
                        </p>
                        <p className="mt-2 text-xs text-[#6b5f55]">
                          {new Date(note.date).toLocaleDateString()}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </section>

              <section className="glass-card border border-[#191919] bg-white p-5">
                {selectedTimelineNote ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Note detail</p>
                        <h2 className="mt-2 text-xl font-semibold text-[#191919]">{selectedTimelineNote.title}</h2>
                        <p className="mt-1 text-xs text-[#6b5f55]">
                          {selectedTimelineNote.coach} · {selectedTimelineNote.program} ·{' '}
                          {new Date(selectedTimelineNote.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                      {selectedTimelineNote.body}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {selectedTimelineNote.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                          {tag}
                        </span>
                      ))}
                    </div>
                    {selectedTimelineNote.authoredByCurrentUser ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteNote(selectedTimelineNote.id)}
                        className="mt-4 rounded-full border border-[#b80f0a] px-4 py-2 text-xs font-semibold text-[#b80f0a] hover:bg-[#b80f0a] hover:text-white transition-colors"
                      >
                        Delete note
                      </button>
                    ) : (
                      <p className="mt-4 text-xs text-[#6b5f55]">
                        Coach-created notes are read-only in your athlete portal.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[#6b5f55]">Select a note to see details.</p>
                )}
              </section>
            </div>

            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#191919]">Progress notes</h3>
                <button
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  onClick={handleSaveNote}
                  disabled={noteSaving || !noteText.trim()}
                >
                  {noteSaving ? 'Saving...' : 'Save note'}
                </button>
              </div>
              <p className="mt-2 text-sm text-[#4a4a4a]">Save private progress notes here. Linked coaches can add feedback you can review, but only your own notes can be deleted.</p>
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
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-[#191919]">Note</span>
                  <textarea
                    rows={3}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                    placeholder="Add a new progress note..."
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                  />
                </label>
              </div>
              {noteNotice && <p className="mt-3 text-xs text-[#4a4a4a]">{noteNotice}</p>}
              <div className="mt-4 space-y-3 text-sm">
                {progressNotes.length === 0 ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                    No notes yet. Save one above to start tracking progress.
                  </div>
                ) : (
                  progressNotes.map((note) => {
                    const createdAt = note.created_at ? new Date(note.created_at) : null
                    const noteWeek = createdAt ? formatWeekLabel(getWeekStart(createdAt)) : ''
                    return (
                      <div key={note.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <p className="font-semibold text-[#191919]">{formatNoteTitle(note.note)}</p>
                        <p className="mt-1 text-xs text-[#4a4a4a]">
                          {noteWeek || (weekStart ? formatWeekLabel(weekStart) : 'Week of —')}
                          {formatNotePreview(note.note) ? ` · ${formatNotePreview(note.note)}` : ''}
                        </p>
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
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
                  No notes yet.
                </div>
              ) : (
                sortedAllNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => {
                      setSelectedTimelineId(note.id)
                      setAllNotesOpen(false)
                    }}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white p-4 text-left text-sm transition hover:border-[#191919]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#191919]">{note.title}</p>
                        <p className="mt-1 text-xs text-[#6b5f55]">
                          {note.coach} · {note.program} · {new Date(note.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#6b5f55]">
                        {note.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="rounded-full border border-[#dcdcdc] px-2 py-0.5">
                            {tag}
                          </span>
                        ))}
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
    </main>
  )
}
