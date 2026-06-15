'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import OrgSidebar from '@/components/OrgSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Toast from '@/components/Toast'

type TryoutEvent = {
  id: string
  name: string
  sport: string | null
  age_group: string | null
  event_date: string | null
  status: 'draft' | 'open' | 'closed' | 'complete'
  max_slots: number | null
  registration_fee_cents: number
  notes: string | null
  created_at: string
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'border border-[#dcdcdc] bg-[#f7f6f4] text-[#4a4a4a]',
  open: 'border border-blue-200 bg-blue-50 text-blue-700',
  closed: 'border border-amber-200 bg-amber-50 text-amber-700',
  complete: 'border border-green-200 bg-green-50 text-green-700',
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const EMPTY_FORM = {
  name: '',
  sport: '',
  age_group: '',
  event_date: '',
  max_slots: '',
  registration_fee: '',
  notes: '',
}

export default function OrgTryoutsPage() {
  const [tryouts, setTryouts] = useState<TryoutEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const getPublicTryoutUrl = (id: string) => {
    const path = `/tryouts/${id}`
    if (typeof window !== 'undefined') return `${window.location.origin}${path}`
    return path
  }

  const copyTryoutLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(getPublicTryoutUrl(id))
      setToast('Tryout signup link copied')
    } catch {
      setToast(getPublicTryoutUrl(id))
    }
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const res = await fetch('/api/org/tryouts')
      if (!res.ok) { setLoading(false); return }
      const payload = await res.json()
      if (active) setTryouts(payload.tryouts ?? [])
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setToast('Event name is required'); return }
    setSubmitting(true)
    const res = await fetch('/api/org/tryouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        sport: form.sport.trim() || undefined,
        age_group: form.age_group.trim() || undefined,
        event_date: form.event_date || undefined,
        max_slots: form.max_slots ? parseInt(form.max_slots, 10) : undefined,
        registration_fee_cents: form.registration_fee ? Math.round(parseFloat(form.registration_fee) * 100) : 0,
        notes: form.notes.trim() || undefined,
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      setToast(payload.error || 'Failed to create tryout')
      return
    }
    const payload = await res.json()
    setTryouts((prev) => [payload.tryout, ...prev])
    setForm(EMPTY_FORM)
    setShowForm(false)
    setToast('Tryout event created')
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Tryouts</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Manage tryout events, registrations, and evaluations.</p>
          </div>
          <button
            className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : 'New tryout'}
          </button>
        </header>

        {showForm && (
          <section className="mt-6 glass-card border border-[#191919] bg-white p-6">
            <h2 className="mb-4 text-base font-semibold text-[#191919]">Create tryout event</h2>
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-semibold text-[#4a4a4a]">Event name *</span>
                <input
                  type="text"
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Fall Soccer Tryouts 2026"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-[#4a4a4a]">Sport</span>
                <input
                  type="text"
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  value={form.sport}
                  onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))}
                  placeholder="Soccer, Basketball…"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-[#4a4a4a]">Age group</span>
                <input
                  type="text"
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  value={form.age_group}
                  onChange={(e) => setForm((f) => ({ ...f, age_group: e.target.value }))}
                  placeholder="U12, 14-16…"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-[#4a4a4a]">Event date</span>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  value={form.event_date}
                  onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-[#4a4a4a]">Max slots</span>
                <input
                  type="number"
                  min="1"
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  value={form.max_slots}
                  onChange={(e) => setForm((f) => ({ ...f, max_slots: e.target.value }))}
                  placeholder="Leave blank for unlimited"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-[#4a4a4a]">Registration fee ($)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  value={form.registration_fee}
                  onChange={(e) => setForm((f) => ({ ...f, registration_fee: e.target.value }))}
                  placeholder="0.00"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-semibold text-[#4a4a4a]">Notes</span>
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional internal notes…"
                />
              </label>
              <div className="flex gap-3 md:col-span-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create event'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-1">
          <div className="lg:hidden"><OrgSidebar /></div>
          <div className="space-y-4">
            {loading && (
              <p className="text-sm text-[#4a4a4a]">Loading tryouts…</p>
            )}
            {!loading && tryouts.length === 0 && (
              <div className="glass-card border border-[#dcdcdc] bg-white p-8 text-center">
                <p className="text-sm text-[#4a4a4a]">No tryout events yet. Click "New tryout" to get started.</p>
              </div>
            )}
            {tryouts.map((t) => (
              <div
                key={t.id}
                className="glass-card border border-[#191919] bg-white p-5 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-[#191919]">{t.name}</h2>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status] ?? STATUS_BADGE.draft}`}>
                      {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#4a4a4a]">
                    {[t.sport, t.age_group].filter(Boolean).join(' · ') || 'No sport / age group set'}
                    {t.event_date ? ` · ${formatDate(t.event_date)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {t.status === 'open' ? (
                    <button
                      type="button"
                      onClick={() => copyTryoutLink(t.id)}
                      className="rounded-full border border-[#dcdcdc] px-4 py-2 text-sm font-semibold text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919] transition-colors"
                    >
                      Copy signup link
                    </button>
                  ) : null}
                  <Link
                    href={`/org/tryouts/${t.id}`}
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#f7f6f4] transition-colors"
                  >
                    Manage →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
