'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import OrgSidebar from '@/components/OrgSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Toast from '@/components/Toast'

type NoteType = 'team' | 'compliance' | 'staff'

type OrgNote = {
  id: string
  type: NoteType
  team: string
  author: string
  date: string
  title: string
  body: string
  tags: string[]
  shared: boolean
}

const typeTabs: Array<{ id: 'all' | NoteType | 'shared'; label: string }> = [
  { id: 'all', label: 'All notes' },
  { id: 'team', label: 'Team notes' },
  { id: 'compliance', label: 'Compliance notes' },
  { id: 'staff', label: 'Staff notes' },
  { id: 'shared', label: 'Shared with families' },
]

const noteTemplates = [
  {
    id: 'team-update',
    label: 'Team update',
    type: 'team' as NoteType,
    title: 'Team update',
    body: 'Share a quick update for the team and key action items.',
    tags: ['update'],
    shared: true,
  },
  {
    id: 'compliance-check',
    label: 'Compliance check',
    type: 'compliance' as NoteType,
    title: 'Compliance check',
    body: 'Outline missing items, deadlines, and follow-up steps.',
    tags: ['compliance', 'follow-up'],
    shared: false,
  },
  {
    id: 'staff-coverage',
    label: 'Staff coverage',
    type: 'staff' as NoteType,
    title: 'Staff coverage',
    body: 'Capture schedule gaps and who is covering.',
    tags: ['staffing'],
    shared: false,
  },
  {
    id: 'roster-update',
    label: 'Roster update',
    type: 'team' as NoteType,
    title: 'Roster update',
    body: 'Log roster adds, removals, and next steps.',
    tags: ['roster', 'ops'],
    shared: true,
  },
]

export default function OrgNotesPage() {
  const [notes, setNotes] = useState<OrgNote[]>([])
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | NoteType | 'shared'>('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [dateRange, setDateRange] = useState<'all' | '7' | '30' | '90'>('30')
  const [sharedOnly, setSharedOnly] = useState(false)
  const [toast, setToast] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [allNotesOpen, setAllNotesOpen] = useState(false)
  const [newNote, setNewNote] = useState({
    type: 'team' as NoteType,
    team: '',
    title: '',
    body: '',
    tags: '',
    shared: false,
  })

  useEffect(() => {
    let active = true
    const loadNotes = async () => {
      setLoadingNotes(true)
      const response = await fetch('/api/org/notes')
      if (!response.ok || !active) { setLoadingNotes(false); return }
      const payload = await response.json().catch(() => null)
      if (!active) return
      const rows = (payload?.notes || []).map((row: { id: string; type: string; team: string; author: string; date: string; title: string; body: string; tags: string[] | null; shared: boolean }) => ({
        id: row.id,
        type: (row.type || 'team') as NoteType,
        team: row.team || '',
        author: row.author || 'Org admin',
        date: row.date,
        title: row.title,
        body: row.body || '',
        tags: row.tags || [],
        shared: Boolean(row.shared),
      }))
      setNotes(rows)
      setLoadingNotes(false)
    }
    loadNotes()
    return () => { active = false }
  }, [])

  const teams = useMemo(() => Array.from(new Set(notes.map((note) => note.team))), [notes])
  const tags = useMemo(() => Array.from(new Set(notes.flatMap((note) => note.tags))), [notes])

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase()
    const now = Date.now()
    return notes.filter((note) => {
      if (activeTab === 'shared' && !note.shared) return false
      if (activeTab !== 'all' && activeTab !== 'shared' && note.type !== activeTab) return false
      if (sharedOnly && !note.shared) return false
      if (teamFilter !== 'all' && note.team !== teamFilter) return false
      if (tagFilter !== 'all' && !note.tags.includes(tagFilter)) return false
      if (dateRange !== 'all') {
        const diffDays = (now - new Date(note.date).getTime()) / 86400000
        if (dateRange === '7' && diffDays > 7) return false
        if (dateRange === '30' && diffDays > 30) return false
        if (dateRange === '90' && diffDays > 90) return false
      }
      if (query) {
        const haystack = `${note.title} ${note.team} ${note.body} ${note.author}`.toLowerCase()
        return haystack.includes(query)
      }
      return true
    })
  }, [notes, activeTab, teamFilter, search, tagFilter, dateRange, sharedOnly])

  const selectedNote = notes.find((note) => note.id === selectedId) || filteredNotes[0] || null
  const recentNotes = filteredNotes.slice(0, 4)
  const detailNotes = selectedNote ? [selectedNote] : filteredNotes.slice(0, 1)
  const getDetailTags = (note: OrgNote | null) => {
    if (!note) return { tags: [], extra: 0 }
    const tags = note.tags.slice(0, 2)
    return { tags, extra: Math.max(note.tags.length - tags.length, 0) }
  }
  const sortedAllNotes = useMemo(() => {
    return [...notes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [notes])

  const summary = useMemo(() => {
    const now = Date.now()
    const lastSeven = notes.filter((note) => (now - new Date(note.date).getTime()) / 86400000 <= 7).length
    const sharedCount = notes.filter((note) => note.shared).length
    const followUps = notes.filter((note) => note.tags.some((tag) => tag.toLowerCase().includes('follow'))).length
    return { lastSeven, sharedCount, teamsWithNotes: teams.length, followUps }
  }, [notes, teams.length])

  const handleCreateNote = useCallback(async () => {
    if (!newNote.title.trim() || !newNote.body.trim()) {
      setToast('Add a title and note body.')
      return
    }
    const tags = newNote.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    const response = await fetch('/api/org/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: newNote.type,
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
    const created: OrgNote = payload.note
    setNotes((prev) => [created, ...prev])
    setSelectedId(created.id)
    setNewNote({ type: 'team', team: '', title: '', body: '', tags: '', shared: false })
    setToast('Note saved.')
  }, [newNote])

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

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Notes hub</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Organization notes</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Team, compliance, and staff notes in one place.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="space-y-6">
            <section className="grid gap-3 md:grid-cols-4">
              {[
                { label: 'Notes in last 7 days', value: summary.lastSeven.toString() },
                { label: 'Teams with notes', value: summary.teamsWithNotes.toString() },
                { label: 'Shared with families', value: summary.sharedCount.toString() },
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
                    placeholder="Search notes or teams"
                    className="w-full rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919]"
                  />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {loadingNotes ? (
                    <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] px-4 py-5 text-sm text-[#6b5f55] md:col-span-2">
                      Loading notes…
                    </div>
                  ) : recentNotes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] px-4 py-5 text-sm text-[#6b5f55] md:col-span-2">
                      No notes yet. Create your first note below.
                    </div>
                  ) : null}
                  {!loadingNotes && recentNotes.map((note) => (
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
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[#191919] leading-snug break-normal hyphens-none">
                            {note.title}
                          </p>
                          <p className="mt-1 text-xs text-[#6b5f55] break-normal hyphens-none">
                            {note.team} · {note.author}
                          </p>
                        </div>
                        <div className="max-w-[6.5rem] text-right text-[10px] uppercase tracking-[0.2em] text-[#6b5f55] leading-snug break-normal hyphens-none">
                          {note.type}
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-[#6b5f55]">
                        {new Date(note.date).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="glass-card border border-[#191919] bg-white p-5">
                {detailNotes.length > 0 ? (
                  <div className="space-y-6">
                    {detailNotes.map((note) => {
                      const { tags, extra } = getDetailTags(note)
                      return (
                        <div key={note.id} className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Note detail</p>
                              <h2 className="mt-2 text-xl font-semibold text-[#191919]">{note.title}</h2>
                              <p className="mt-1 text-xs text-[#6b5f55]">
                                {note.team} · {note.author} · {new Date(note.date).toLocaleString()}
                              </p>
                            </div>
                            <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                              {note.shared ? 'Shared' : 'Internal'}
                            </span>
                          </div>
                          <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                            {note.body}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            {tags.map((tag) => (
                              <span key={tag} className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                                {tag}
                              </span>
                            ))}
                            {extra > 0 ? (
                              <span className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#6b5f55]">
                                +{extra}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
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
                          <option value="team">Team note</option>
                          <option value="compliance">Compliance note</option>
                          <option value="staff">Staff note</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-[#191919]">Team</span>
                        <input
                          value={newNote.team}
                          onChange={(event) => setNewNote((prev) => ({ ...prev, team: event.target.value }))}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                          placeholder="Team name"
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
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#191919]">Tags (comma separated)</span>
                      <input
                        value={newNote.tags}
                        onChange={(event) => setNewNote((prev) => ({ ...prev, tags: event.target.value }))}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        placeholder="roster, compliance"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-[#6b5f55]">
                      <input
                        type="checkbox"
                        checked={newNote.shared}
                        onChange={(event) => setNewNote((prev) => ({ ...prev, shared: event.target.checked }))}
                      />
                      Share with families
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
              {sortedAllNotes.map((note) => (
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
                        {note.team} · {note.author} · {new Date(note.date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#6b5f55]">
                      <span>{note.type}</span>
                      {note.shared ? <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5">Shared</span> : null}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[#6b5f55] line-clamp-2">{note.body}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
