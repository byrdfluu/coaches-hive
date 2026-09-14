'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import CoachSidebar from '@/components/CoachSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Toast from '@/components/Toast'

type Athlete = { id: string; full_name?: string | null; avatar_url?: string | null }
type Note = { id: string; athlete_id: string; content: string; is_private: boolean; created_at: string; updated_at: string; athlete?: Athlete | null }
const dateLabel = (value: string) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export default function CoachNotesPage() {
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedAthleteId, setSelectedAthleteId] = useState('')
  const [content, setContent] = useState('')
  const [isPrivate, setIsPrivate] = useState(true)
  const [editing, setEditing] = useState<Note | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const response = await fetch('/api/coach/notes', { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) setError(payload.error || 'Unable to load notes for this workspace.')
    else {
      setAthletes(payload.athletes || []); setNotes(payload.notes || [])
      setSelectedAthleteId((current) => current || payload.athletes?.[0]?.id || '')
    }
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const visibleNotes = useMemo(() => notes.filter((note) => !selectedAthleteId || note.athlete_id === selectedAthleteId), [notes, selectedAthleteId])
  const resetEditor = () => { setEditing(null); setContent(''); setIsPrivate(true) }

  const save = async () => {
    if (!selectedAthleteId || !content.trim()) { setToast('Select an athlete and add a note.'); return }
    setSaving(true)
    const response = await fetch('/api/coach/notes', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing ? { id: editing.id, content: content.trim(), is_private: isPrivate } : { athlete_id: selectedAthleteId, content: content.trim(), is_private: isPrivate }) })
    const payload = await response.json().catch(() => ({})); setSaving(false)
    if (!response.ok) { setToast(payload.error || 'Unable to save note.'); return }
    setToast(editing ? 'Note updated.' : 'Note saved.'); resetEditor(); await load()
  }

  const remove = async (note: Note) => {
    if (!window.confirm('Delete this note?')) return
    const response = await fetch(`/api/coach/notes?id=${encodeURIComponent(note.id)}`, { method: 'DELETE' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) { setToast(payload.error || 'Unable to delete note.'); return }
    setNotes((current) => current.filter((item) => item.id !== note.id)); if (editing?.id === note.id) resetEditor(); setToast('Note deleted.')
  }

  return <main className="page-shell"><div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
    <RoleInfoBanner role="coach" />
    <header><p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Notes</p><h1 className="display text-3xl font-semibold text-[#191919]">Athlete notes</h1><p className="mt-2 text-sm text-[#6b5f55]">The same athlete notes available in the Coaches Hive app.</p></header>
    <div className="mt-6"><CoachSidebar /><div className="min-w-0 space-y-5">
      {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <section className="glass-card border border-[#191919] bg-white p-5">
        <label className="block text-sm font-semibold text-[#191919]">Athlete<select className="mt-2 w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-3 font-normal" value={selectedAthleteId} onChange={(event) => { setSelectedAthleteId(event.target.value); resetEditor() }}>{athletes.length ? athletes.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.full_name || 'Athlete'}</option>) : <option value="">No athletes in this workspace</option>}</select></label>
        <textarea className="mt-4 min-h-36 w-full rounded-xl border border-[#dcdcdc] p-3 text-sm" placeholder="Add a private note about this athlete…" value={content} onChange={(event) => setContent(event.target.value)} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} /> Private to me</label><div className="flex gap-2">{editing ? <button type="button" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold" onClick={resetEditor}>Cancel</button> : null}<button type="button" disabled={saving || !selectedAthleteId} className="rounded-full bg-[#b80f0a] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void save()}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add note'}</button></div></div>
      </section>
      <section className="space-y-3">
        {loading ? <p className="text-sm text-[#6b5f55]">Loading notes…</p> : null}
        {!loading && selectedAthleteId && visibleNotes.length === 0 ? <div className="glass-card border border-[#dcdcdc] bg-white p-6 text-sm text-[#6b5f55]">No notes for this athlete yet.</div> : null}
        {visibleNotes.map((note) => <article key={note.id} className="glass-card border border-[#dcdcdc] bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#191919]">{note.athlete?.full_name || 'Athlete'}</p><p className="text-xs text-[#6b5f55]">{dateLabel(note.created_at)} · {note.is_private ? 'Private' : 'Shared with athlete'}</p></div><div className="flex gap-3 text-xs font-semibold"><button type="button" onClick={() => { setEditing(note); setSelectedAthleteId(note.athlete_id); setContent(note.content); setIsPrivate(note.is_private) }}>Edit</button><button type="button" className="text-[#b80f0a]" onClick={() => void remove(note)}>Delete</button></div></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#191919]">{note.content}</p></article>)}
      </section>
    </div></div>
  </div>{toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}</main>
}
