'use client'

import { useCallback, useEffect, useState } from 'react'
import OrgSidebar from '@/components/OrgSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Toast from '@/components/Toast'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

type Waiver = {
  id: string
  title: string
  body: string
  required_roles: string[]
  is_active: boolean
  created_at: string
  signature_count: number
}

type WaiverDetail = {
  waiver: { id: string; title: string; required_roles: string[]; is_active: boolean }
  signed: Array<{ user_id: string; full_name: string; email: string | null; signed_at: string }>
  unsigned: Array<{ user_id: string; full_name: string; email: string | null }>
}

export default function OrgWaiversPage() {
  const [waivers, setWaivers] = useState<Waiver[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newRoles, setNewRoles] = useState<string[]>(['athlete'])
  const [creating, setCreating] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<WaiverDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/org/waivers')
    const data = await res.json().catch(() => ({}))
    setWaivers(data?.waivers || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleRole = (role: string) => {
    setNewRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    )
  }

  const handleCreate = async () => {
    if (!newTitle.trim() || !newBody.trim() || newRoles.length === 0) return
    setCreating(true)
    const res = await fetch('/api/org/waivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim(), body: newBody.trim(), required_roles: newRoles }),
    })
    const data = await res.json().catch(() => ({}))
    setCreating(false)
    if (res.ok && data?.waiver) {
      setWaivers((prev) => [{ ...data.waiver, signature_count: 0 }, ...prev])
      setCreateOpen(false)
      setNewTitle('')
      setNewBody('')
      setNewRoles(['athlete'])
      setToast('Waiver created.')
    } else {
      setToast(data?.error || 'Failed to create waiver.')
    }
  }

  const handleToggleActive = async (waiver: Waiver) => {
    const next = !waiver.is_active
    setWaivers((prev) => prev.map((w) => (w.id === waiver.id ? { ...w, is_active: next } : w)))
    const res = await fetch('/api/org/waivers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: waiver.id, is_active: next }),
    })
    if (!res.ok) {
      setWaivers((prev) => prev.map((w) => (w.id === waiver.id ? { ...w, is_active: waiver.is_active } : w)))
      setToast('Failed to update waiver.')
    } else {
      setToast(next ? 'Waiver activated.' : 'Waiver deactivated.')
    }
  }

  const openDetail = async (id: string) => {
    setDetailId(id)
    setDetail(null)
    setDetailLoading(true)
    const res = await fetch(`/api/org/waivers?waiver_id=${id}`)
    const data = await res.json().catch(() => ({}))
    setDetail(data || null)
    setDetailLoading(false)
  }

  return (
    <div className="page-shell portal-page portal-org">
      <div className="px-4 py-6 sm:px-6 sm:py-10">
      <RoleInfoBanner role="admin" />
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
        <OrgSidebar />
        <main className="min-w-0 space-y-6">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-[#191919]">Waivers</h1>
              <p className="mt-1 text-sm text-[#4a4a4a]">Create and manage waivers for your organization members.</p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80"
            >
              + Create waiver
            </button>
          </div>

          {/* Waivers list */}
          <section className="glass-card border border-[#191919] p-6">
            {loading ? (
              <LoadingState />
            ) : waivers.length === 0 ? (
              <EmptyState
                title="No waivers yet"
                description="Create your first waiver to collect signatures from your athletes, coaches, or staff."
              />
            ) : (
              <div className="space-y-3">
                {waivers.map((waiver) => (
                  <div
                    key={waiver.id}
                    className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#191919]">{waiver.title}</p>
                        <p className="mt-0.5 text-xs text-[#4a4a4a]">
                          {waiver.required_roles.join(', ')} &middot; {waiver.signature_count} signature{waiver.signature_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openDetail(waiver.id)}
                          className="rounded-full border border-[#191919] px-3 py-1.5 text-xs font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-white"
                        >
                          View signatures
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(waiver)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                            waiver.is_active
                              ? 'bg-[#191919] text-white hover:opacity-80'
                              : 'border border-[#dcdcdc] text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919]'
                          }`}
                        >
                          {waiver.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </main>
      </div>
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">New waiver</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Create waiver</h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Waiver title"
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
              />
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Waiver body text (terms, conditions, liability language...)"
                className="h-36 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
              />
              <div>
                <p className="mb-2 text-xs font-semibold text-[#191919]">Required for</p>
                <div className="flex flex-wrap gap-2">
                  {['athlete', 'coach', 'assistant_coach'].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        newRoles.includes(role)
                          ? 'bg-[#191919] text-white'
                          : 'border border-[#dcdcdc] text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919]'
                      }`}
                    >
                      {role.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !newTitle.trim() || !newBody.trim() || newRoles.length === 0}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create waiver'}
                </button>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signature detail modal */}
      {detailId && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Signatures</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
                  {detail?.waiver?.title || 'Waiver'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => { setDetailId(null); setDetail(null) }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {detailLoading ? (
              <div className="mt-6"><LoadingState /></div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#4a4a4a]">
                    Signed ({detail?.signed?.length ?? 0})
                  </p>
                  {(detail?.signed || []).length === 0 ? (
                    <p className="text-xs text-[#6b5f55]">No signatures yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail!.signed.map((s) => (
                        <div key={s.user_id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2">
                          <p className="font-semibold text-[#191919]">{s.full_name}</p>
                          <p className="text-xs text-[#4a4a4a]">
                            {new Date(s.signed_at).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#4a4a4a]">
                    Not yet signed ({detail?.unsigned?.length ?? 0})
                  </p>
                  {(detail?.unsigned || []).length === 0 ? (
                    <p className="text-xs text-[#6b5f55]">Everyone has signed.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail!.unsigned.map((u) => (
                        <div key={u.user_id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2">
                          <p className="font-semibold text-[#191919]">{u.full_name}</p>
                          {u.email && <p className="text-xs text-[#4a4a4a]">{u.email}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
