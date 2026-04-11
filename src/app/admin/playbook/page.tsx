'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import AdminSidebar from '@/components/AdminSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'

type SopItem = { id: string; title: string; owner: string; lastUpdated: string }
type SopDetail = { summary: string; checklist: string[]; successSignals: string[]; notes: string[] }

const SEED_LIBRARY: SopItem[] = [
  { id: 'sop-1', title: 'Marketplace dispute', owner: 'Ops', lastUpdated: 'Apr 2025' },
  { id: 'sop-2', title: 'Org admin onboarding', owner: 'Ops', lastUpdated: 'Apr 2025' },
  { id: 'sop-3', title: 'Coach verification', owner: 'Ops', lastUpdated: 'Apr 2025' },
  { id: 'sop-4', title: 'Billing & refunds', owner: 'Ops', lastUpdated: 'Apr 2025' },
]

const SEED_DETAILS: Record<string, SopDetail> = {
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

export default function AdminPlaybookPage() {
  const supabase = createClientComponentClient()
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sopLibrary, setSopLibrary] = useState<SopItem[]>([])
  const [sopDetails, setSopDetails] = useState<Record<string, SopDetail>>({})
  const [weeklyCadence, setWeeklyCadence] = useState<Array<{ day: string; focus: string }>>([])
  const [incidentChecklist, setIncidentChecklist] = useState<string[]>([])

  // SOP modal state
  const [showAddSop, setShowAddSop] = useState(false)
  const [editSop, setEditSop] = useState<SopItem | null>(null)
  const [newSopTitle, setNewSopTitle] = useState('')
  const [newSopOwner, setNewSopOwner] = useState('')

  // Inline edit state
  const [editingCadenceIndex, setEditingCadenceIndex] = useState<number | null>(null)
  const [editingChecklistIndex, setEditingChecklistIndex] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    const loadPlaybook = async () => {
      setLoading(true)
      const [response, sessionData] = await Promise.all([
        fetch('/api/admin/playbook'),
        supabase.auth.getSession(),
      ])

      if (!active) return

      const teamRole = sessionData.data.session?.user.user_metadata?.admin_team_role || null
      setCanEdit(teamRole === 'ops' || teamRole === 'superadmin')

      if (!response.ok) {
        setToast('Unable to load playbook.')
        setLoading(false)
        return
      }

      const payload = await response.json()
      if (!active) return

      const library = (payload.config?.sopLibrary || []) as SopItem[]
      const details = (payload.config?.sopDetails || {}) as Record<string, SopDetail>

      // Seed hardcoded defaults on first load
      if (library.length === 0 && Object.keys(details).length === 0) {
        const seedRes = await fetch('/api/admin/playbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {
              sopLibrary: SEED_LIBRARY,
              sopDetails: SEED_DETAILS,
              weeklyCadence: [],
              incidentChecklist: [],
            },
          }),
        })
        if (active) {
          const seedPayload = seedRes.ok ? await seedRes.json() : null
          setSopLibrary(seedPayload?.config?.sopLibrary || SEED_LIBRARY)
          setSopDetails(seedPayload?.config?.sopDetails || SEED_DETAILS)
          setWeeklyCadence([])
          setIncidentChecklist([])
        }
        if (active) setLoading(false)
        return
      }

      setSopLibrary(library)
      setSopDetails(details)
      setWeeklyCadence(payload.config?.weeklyCadence || [])
      setIncidentChecklist(payload.config?.incidentChecklist || [])
      setLoading(false)
    }
    loadPlaybook()
    return () => {
      active = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (
    lib = sopLibrary,
    details = sopDetails,
    cadence = weeklyCadence,
    checklist = incidentChecklist,
  ) => {
    setSaving(true)
    const res = await fetch('/api/admin/playbook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { sopLibrary: lib, sopDetails: details, weeklyCadence: cadence, incidentChecklist: checklist } }),
    })
    setToast(res.ok ? 'Playbook saved.' : 'Unable to save playbook.')
    setSaving(false)
  }

  const handleAddSop = async () => {
    const slug = newSopTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const id = `${slug}-${Date.now()}`
    const today = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    const newItem: SopItem = { id, title: newSopTitle.trim(), owner: newSopOwner.trim() || 'Ops', lastUpdated: today }
    const blankDetail: SopDetail = { summary: '', checklist: [], successSignals: [], notes: [] }
    const updatedLibrary = [...sopLibrary, newItem]
    const updatedDetails = { ...sopDetails, [id]: blankDetail }
    setSopLibrary(updatedLibrary)
    setSopDetails(updatedDetails)
    setShowAddSop(false)
    setNewSopTitle('')
    setNewSopOwner('')
    await handleSave(updatedLibrary, updatedDetails, weeklyCadence, incidentChecklist)
  }

  const handleEditSop = async () => {
    if (!editSop) return
    const today = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    const updatedLibrary = sopLibrary.map((s) =>
      s.id === editSop.id ? { ...s, title: editSop.title, owner: editSop.owner, lastUpdated: today } : s,
    )
    setSopLibrary(updatedLibrary)
    setEditSop(null)
    await handleSave(updatedLibrary, sopDetails, weeklyCadence, incidentChecklist)
  }

  const handleDeleteSop = async (id: string) => {
    const updatedLibrary = sopLibrary.filter((s) => s.id !== id)
    const updatedDetails = { ...sopDetails }
    delete updatedDetails[id]
    setSopLibrary(updatedLibrary)
    setSopDetails(updatedDetails)
    await handleSave(updatedLibrary, updatedDetails, weeklyCadence, incidentChecklist)
  }

  const moveCadence = (idx: number, dir: -1 | 1) => {
    setWeeklyCadence((prev) => {
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  const moveChecklist = (idx: number, dir: -1 | 1) => {
    setIncidentChecklist((prev) => {
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Ops playbook</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">SOPs and weekly cadence for running the platform.</p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving || loading}
              className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          )}
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            {loading ? <LoadingState label="Loading playbook..." /> : null}
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">SOP library</h2>
                  <p className="mt-1 text-sm text-[#6b5f55]">Repeatable playbooks for core workflows.</p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowAddSop(true)}
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] shrink-0"
                  >
                    + Add SOP
                  </button>
                )}
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {sopLibrary.length === 0 && !loading && (
                  <p className="text-sm text-[#6b5f55]">No SOPs yet. Add your first SOP to get started.</p>
                )}
                {sopLibrary.map((sop) => (
                  <div key={sop.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div>
                      <p className="font-semibold text-[#191919]">{sop.title}</p>
                      <p className="text-xs text-[#6b5f55]">
                        Owner: {sop.owner} · Updated {sop.lastUpdated}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/admin/playbook/${sop.id}`}
                        className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      >
                        View SOP
                      </Link>
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditSop({ ...sop })}
                            className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#6b5f55]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSop(sop.id)}
                            className="rounded-full border border-[#b80f0a]/20 px-3 py-1 text-xs font-semibold text-[#b80f0a]"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[#191919]">Weekly cadence</h2>
                    <p className="mt-1 text-sm text-[#6b5f55]">Recurring operating rhythm.</p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setWeeklyCadence((prev) => [...prev, { day: '', focus: '' }])
                        setEditingCadenceIndex(weeklyCadence.length)
                      }}
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] shrink-0"
                    >
                      + Add day
                    </button>
                  )}
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {weeklyCadence.length === 0 && !loading && (
                    <p className="text-sm text-[#6b5f55]">No cadence items yet.</p>
                  )}
                  {weeklyCadence.map((item, idx) => (
                    <div key={idx} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      {canEdit && editingCadenceIndex === idx ? (
                        <div className="space-y-2">
                          <input
                            value={item.day}
                            onChange={(e) =>
                              setWeeklyCadence((prev) => prev.map((c, i) => i === idx ? { ...c, day: e.target.value } : c))
                            }
                            placeholder="Day (e.g. Monday)"
                            className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-1.5 text-xs"
                          />
                          <input
                            value={item.focus}
                            onChange={(e) =>
                              setWeeklyCadence((prev) => prev.map((c, i) => i === idx ? { ...c, focus: e.target.value } : c))
                            }
                            placeholder="Focus area"
                            className="w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-1.5 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setEditingCadenceIndex(null)}
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold"
                          >
                            Done
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{item.day}</p>
                            <p className="mt-2 font-semibold text-[#191919]">{item.focus}</p>
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button type="button" onClick={() => moveCadence(idx, -1)} disabled={idx === 0}
                                className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[11px] disabled:opacity-30">↑</button>
                              <button type="button" onClick={() => moveCadence(idx, 1)} disabled={idx === weeklyCadence.length - 1}
                                className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[11px] disabled:opacity-30">↓</button>
                              <button type="button" onClick={() => setEditingCadenceIndex(idx)}
                                className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[11px] font-semibold text-[#6b5f55]">Edit</button>
                              <button type="button" onClick={() => setWeeklyCadence((prev) => prev.filter((_, i) => i !== idx))}
                                className="rounded-full border border-[#b80f0a]/20 px-2 py-1 text-[11px] font-semibold text-[#b80f0a]">×</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[#191919]">Incident checklist</h2>
                    <p className="mt-1 text-sm text-[#6b5f55]">Use for outages or payment issues.</p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setIncidentChecklist((prev) => [...prev, ''])
                        setEditingChecklistIndex(incidentChecklist.length)
                      }}
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] shrink-0"
                    >
                      + Add item
                    </button>
                  )}
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {incidentChecklist.length === 0 && !loading && (
                    <p className="text-sm text-[#6b5f55]">No checklist items yet.</p>
                  )}
                  {incidentChecklist.map((item, idx) => (
                    <div key={idx} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      {canEdit && editingChecklistIndex === idx ? (
                        <div className="flex gap-2">
                          <input
                            value={item}
                            onChange={(e) =>
                              setIncidentChecklist((prev) => prev.map((c, i) => i === idx ? e.target.value : c))
                            }
                            placeholder="Checklist item"
                            className="flex-1 rounded-xl border border-[#dcdcdc] bg-white px-3 py-1.5 text-xs"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setEditingChecklistIndex(null)}
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold shrink-0"
                          >
                            Done
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-[#191919]">{item}</p>
                          {canEdit && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button type="button" onClick={() => moveChecklist(idx, -1)} disabled={idx === 0}
                                className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[11px] disabled:opacity-30">↑</button>
                              <button type="button" onClick={() => moveChecklist(idx, 1)} disabled={idx === incidentChecklist.length - 1}
                                className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[11px] disabled:opacity-30">↓</button>
                              <button type="button" onClick={() => setEditingChecklistIndex(idx)}
                                className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[11px] font-semibold text-[#6b5f55]">Edit</button>
                              <button type="button" onClick={() => setIncidentChecklist((prev) => prev.filter((_, i) => i !== idx))}
                                className="rounded-full border border-[#b80f0a]/20 px-2 py-1 text-[11px] font-semibold text-[#b80f0a]">×</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Add SOP modal */}
      {showAddSop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold text-[#191919]">Add SOP</h2>
              <button
                type="button"
                onClick={() => { setShowAddSop(false); setNewSopTitle(''); setNewSopOwner('') }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#6b5f55]">Title</span>
                <input
                  value={newSopTitle}
                  onChange={(e) => setNewSopTitle(e.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  placeholder="e.g. Coach offboarding"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#6b5f55]">Owner</span>
                <input
                  value={newSopOwner}
                  onChange={(e) => setNewSopOwner(e.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                  placeholder="Ops"
                />
              </label>
              <button
                type="button"
                onClick={handleAddSop}
                disabled={!newSopTitle.trim() || saving}
                className="w-full rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Create SOP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit SOP modal */}
      {editSop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold text-[#191919]">Edit SOP</h2>
              <button
                type="button"
                onClick={() => setEditSop(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#6b5f55]">Title</span>
                <input
                  value={editSop.title}
                  onChange={(e) => setEditSop((prev) => prev ? { ...prev, title: e.target.value } : prev)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#6b5f55]">Owner</span>
                <input
                  value={editSop.owner}
                  onChange={(e) => setEditSop((prev) => prev ? { ...prev, owner: e.target.value } : prev)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={handleEditSop}
                disabled={!editSop.title.trim() || saving}
                className="w-full rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}
