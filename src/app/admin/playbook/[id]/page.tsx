'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import AdminSidebar from '@/components/AdminSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'

type SopItem = { id: string; title: string; owner: string; lastUpdated: string }
type SopDetail = { summary: string; checklist: string[]; successSignals: string[]; notes: string[] }
type PlaybookConfig = {
  sopLibrary: SopItem[]
  sopDetails: Record<string, SopDetail>
  weeklyCadence: Array<{ day: string; focus: string }>
  incidentChecklist: string[]
}

const SOP_DETAILS: Record<string, SopDetail> = {
  'sop-1': {
    summary: 'Handle marketplace disputes from intake through resolution.',
    checklist: [
      'Verify dispute details and deadline',
      'Collect evidence from org/coach',
      'Submit response via processor',
      'Update requester with resolution timeline',
    ],
    successSignals: ['Evidence submitted on time', 'User updated', 'Outcome documented'],
    notes: ['Escalate if deadline < 72 hours.'],
  },
  'sop-2': {
    summary: 'Standard onboarding flow for new org admins with first-week follow-ups.',
    checklist: [
      'Confirm org profile + branding',
      'Add teams and coaches',
      'Configure payments + fee policies',
      'Invite staff + verify roles',
      'Send welcome announcement',
    ],
    successSignals: ['2+ teams created', 'Payments connected', 'First announcement sent'],
    notes: ['Escalate if payments are not connected within 48 hours.'],
  },
  'sop-3': {
    summary: 'Review coach applications and verification steps.',
    checklist: [
      'Confirm identity documents',
      'Validate certifications',
      'Review profile completeness',
      'Approve or request updates',
    ],
    successSignals: ['Verification decision logged', 'Coach notified'],
    notes: ['Route high-risk flags to compliance.'],
  },
  'sop-4': {
    summary: 'Billing questions, chargebacks, and refund workflow.',
    checklist: [
      'Verify payment details',
      'Confirm refund eligibility',
      'Coordinate with payouts if needed',
      'Send final confirmation',
    ],
    successSignals: ['Refund action logged', 'Receipt shared'],
    notes: ['Escalate refunds over $500 to finance.'],
  },
}

const BLANK_DETAIL: SopDetail = {
  summary: 'Standard operating procedure for internal admin workflows.',
  checklist: ['Review inputs', 'Complete required actions', 'Document outcomes'],
  successSignals: ['Task completed', 'Audit notes saved'],
  notes: ['Escalate blockers to ops lead.'],
}

function moveItem<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const next = [...arr]
  const swap = idx + dir
  if (swap < 0 || swap >= next.length) return arr
  ;[next[idx], next[swap]] = [next[swap], next[idx]]
  return next
}

export default function AdminSopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClientComponentClient()
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [sop, setSop] = useState<SopItem | null>(null)
  const [sopDetails, setSopDetails] = useState<Record<string, SopDetail>>({})
  const [allConfig, setAllConfig] = useState<PlaybookConfig | null>(null)
  const [error, setError] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<SopDetail | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const [response, sessionData] = await Promise.all([
        fetch('/api/admin/playbook'),
        supabase.auth.getSession(),
      ])

      if (!active) return

      const teamRole = sessionData.data.session?.user.user_metadata?.admin_team_role || null
      setCanEdit(teamRole === 'ops' || teamRole === 'superadmin')

      if (!response.ok) {
        if (active) {
          setError('Unable to load SOP.')
          setLoading(false)
        }
        return
      }
      const payload = await response.json()
      if (!active) return
      const library = (payload.config?.sopLibrary || []) as SopItem[]
      const details = (payload.config?.sopDetails || {}) as Record<string, SopDetail>
      setSopDetails(details)
      setAllConfig({
        sopLibrary: library,
        sopDetails: details,
        weeklyCadence: payload.config?.weeklyCadence || [],
        incidentChecklist: payload.config?.incidentChecklist || [],
      })
      const matched = library.find((item) => item.id === id) || null
      setSop(matched)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const details = useMemo(() => {
    if (sopDetails?.[id]) return sopDetails[id]
    if (id in SOP_DETAILS) return SOP_DETAILS[id]
    return BLANK_DETAIL
  }, [id, sopDetails])

  const enterEdit = () => {
    setDraft({ ...details, checklist: [...details.checklist], successSignals: [...details.successSignals], notes: [...details.notes] })
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setDraft(null)
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!draft || !allConfig) return
    setSaving(true)
    const updatedDetails = { ...allConfig.sopDetails, [id]: draft }
    const res = await fetch('/api/admin/playbook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { ...allConfig, sopDetails: updatedDetails } }),
    })
    if (!res.ok) {
      setToast('Unable to save SOP.')
      setSaving(false)
      return
    }
    const saved = await res.json()
    const savedDetails = (saved.config?.sopDetails || updatedDetails) as Record<string, SopDetail>
    setSopDetails(savedDetails)
    setAllConfig((prev) => prev ? { ...prev, sopDetails: savedDetails } : prev)
    setIsEditing(false)
    setDraft(null)
    setToast('SOP saved.')
    setSaving(false)
  }

  const updateDraftList = (field: 'checklist' | 'successSignals' | 'notes', idx: number, value: string) => {
    setDraft((prev) => prev ? { ...prev, [field]: prev[field].map((item, i) => i === idx ? value : item) } : prev)
  }

  const removeDraftItem = (field: 'checklist' | 'successSignals' | 'notes', idx: number) => {
    setDraft((prev) => prev ? { ...prev, [field]: prev[field].filter((_, i) => i !== idx) } : prev)
  }

  const addDraftItem = (field: 'checklist' | 'successSignals' | 'notes') => {
    setDraft((prev) => prev ? { ...prev, [field]: [...prev[field], ''] } : prev)
  }

  const moveDraftItem = (field: 'checklist' | 'successSignals' | 'notes', idx: number, dir: -1 | 1) => {
    setDraft((prev) => prev ? { ...prev, [field]: moveItem(prev[field], idx, dir) } : prev)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Admin playbook</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">{sop?.title || 'SOP detail'}</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">{sop ? `Owner: ${sop.owner} · Updated ${sop.lastUpdated}` : 'Loading SOP details'}</p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && !isEditing && (
              <button
                type="button"
                onClick={enterEdit}
                className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
              >
                Edit SOP
              </button>
            )}
            {isEditing && (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-full border border-[#dcdcdc] px-4 py-2 text-sm font-semibold text-[#6b5f55]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </>
            )}
            <Link
              href="/admin/playbook"
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Back to playbook
            </Link>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            {loading ? <LoadingState label="Loading SOP..." /> : null}
            {error ? (
              <div className="rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-sm text-[#4a4a4a]">
                {error}
              </div>
            ) : null}
            {!loading && !error ? (
              <>
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Overview</p>
                  <h2 className="mt-2 text-lg font-semibold text-[#191919]">Summary</h2>
                  {isEditing && draft ? (
                    <textarea
                      value={draft.summary}
                      onChange={(e) => setDraft((prev) => prev ? { ...prev, summary: e.target.value } : prev)}
                      rows={4}
                      className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      placeholder="Describe the purpose and scope of this SOP..."
                    />
                  ) : (
                    <p className="mt-2 text-sm text-[#4a4a4a]">{details.summary}</p>
                  )}
                </section>

                <section className="glass-card border border-[#191919] bg-white p-6">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Checklist</p>
                  {isEditing && draft ? (
                    <div className="mt-4 space-y-2">
                      {draft.checklist.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            value={item}
                            onChange={(e) => updateDraftList('checklist', idx, e.target.value)}
                            className="flex-1 rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                            placeholder="Step description"
                          />
                          <button type="button" onClick={() => moveDraftItem('checklist', idx, -1)} disabled={idx === 0}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dcdcdc] text-xs disabled:opacity-30">↑</button>
                          <button type="button" onClick={() => moveDraftItem('checklist', idx, 1)} disabled={idx === draft.checklist.length - 1}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dcdcdc] text-xs disabled:opacity-30">↓</button>
                          <button type="button" onClick={() => removeDraftItem('checklist', idx)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#b80f0a]/20 text-sm font-semibold text-[#b80f0a]">×</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addDraftItem('checklist')}
                        className="mt-1 rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                        + Add step
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2 text-sm">
                      {details.checklist.map((item) => (
                        <div key={item} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          {item}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="grid gap-6 md:grid-cols-2">
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Success signals</p>
                    {isEditing && draft ? (
                      <div className="mt-4 space-y-2">
                        {draft.successSignals.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              value={item}
                              onChange={(e) => updateDraftList('successSignals', idx, e.target.value)}
                              className="flex-1 rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                              placeholder="Signal description"
                            />
                            <button type="button" onClick={() => removeDraftItem('successSignals', idx)}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#b80f0a]/20 text-sm font-semibold text-[#b80f0a]">×</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => addDraftItem('successSignals')}
                          className="mt-1 rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                          + Add signal
                        </button>
                      </div>
                    ) : (
                      <ul className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
                        {details.successSignals.map((item) => (
                          <li key={item} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                            <span className="font-semibold text-[#191919]">{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Notes</p>
                    {isEditing && draft ? (
                      <div className="mt-4 space-y-2">
                        {draft.notes.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              value={item}
                              onChange={(e) => updateDraftList('notes', idx, e.target.value)}
                              className="flex-1 rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                              placeholder="Note or escalation path"
                            />
                            <button type="button" onClick={() => removeDraftItem('notes', idx)}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#b80f0a]/20 text-sm font-semibold text-[#b80f0a]">×</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => addDraftItem('notes')}
                          className="mt-1 rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                          + Add note
                        </button>
                      </div>
                    ) : (
                      <ul className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
                        {details.notes.map((item) => (
                          <li key={item} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              </>
            ) : null}
          </div>
        </div>
      </div>
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}
