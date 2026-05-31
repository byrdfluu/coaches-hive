'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import CoachSidebar from '@/components/CoachSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import ProgramSettingsModal from '@/components/ProgramSettingsModal'

type Program = {
  id: string
  title: string
  description: string | null
  duration_label: string | null
  status: string
  product_id: string | null
  exercise_count: number
  created_at: string
}

type Product = { id: string; title: string; status: string }

export default function CoachProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'inactive'>('active')
  const [settingsModal, setSettingsModal] = useState<Partial<Program> | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const [pRes, prodRes] = await Promise.all([
        fetch('/api/coach/programs'),
        fetch('/api/coach/products'),
      ])
      if (!active) return
      if (pRes.ok) {
        const data = await pRes.json()
        setPrograms(data.programs ?? [])
      }
      if (prodRes.ok) {
        const data = await prodRes.json()
        setProducts((data.products ?? []).map((p: any) => ({ id: p.id, title: p.title, status: p.status })))
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleSaved = (saved: Program) => {
    setPrograms((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], ...saved }
        return next
      }
      return [{ ...saved, exercise_count: 0 }, ...prev]
    })
    showToast('Program saved.')
  }

  const handleDelete = async (program: Program) => {
    if (!confirm(`Delete "${program.title}"? This cannot be undone.`)) return
    setDeletingId(program.id)
    const res = await fetch(`/api/coach/programs/${program.id}`, { method: 'DELETE' })
    if (res.ok) {
      const data = await res.json()
      if (data.soft_deleted) {
        setPrograms((prev) => prev.map((p) => p.id === program.id ? { ...p, status: 'inactive' } : p))
        showToast('Program deactivated (athletes have access).')
      } else {
        setPrograms((prev) => prev.filter((p) => p.id !== program.id))
        showToast('Program deleted.')
      }
    }
    setDeletingId(null)
  }

  const activePrograms = programs.filter((p) => p.status === 'active' || p.status === 'draft')
  const inactivePrograms = programs.filter((p) => p.status === 'inactive')
  const displayed = tab === 'active' ? activePrograms : inactivePrograms

  const totalSold = 0 // placeholder — could join orders in a future enhancement

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="min-w-0 space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Coach Portal</p>
                <h1 className="display text-3xl font-semibold text-[#191919]">Programs</h1>
                <p className="mt-1 text-sm text-[#6b5f55]">Build, manage, and sell training programs.</p>
              </div>
              <button
                onClick={() => setCreateOpen(true)}
                className="rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-80"
              >
                + Create program
              </button>
            </header>

            {toast && (
              <p className="text-sm font-semibold text-[#1f7a3f]">{toast}</p>
            )}

            {/* Stats */}
            <section className="grid gap-4 sm:grid-cols-3">
              {[
                { label: 'Active programs', value: activePrograms.length },
                { label: 'Inactive programs', value: inactivePrograms.length },
                { label: 'Total programs', value: programs.length },
              ].map((stat) => (
                <div key={stat.label} className="glass-card border border-[#191919] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
              ))}
            </section>

            {/* Tabs */}
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex gap-3 border-b border-[#e8e8e8] pb-4">
                {(['active', 'inactive'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      tab === t ? 'bg-[#191919] text-white' : 'text-[#6b6b6b] hover:bg-[#f5f5f5]'
                    }`}
                  >
                    {t === 'active' ? 'Active / Draft' : 'Inactive'}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                {loading ? (
                  <LoadingState label="Loading programs…" />
                ) : displayed.length === 0 ? (
                  <EmptyState
                    title="No programs here."
                    description={tab === 'active' ? 'Create your first program to get started.' : 'No inactive programs.'}
                  />
                ) : (
                  displayed.map((program) => (
                    <div
                      key={program.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#191919]">{program.title}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#6b6b6b]">
                          {program.duration_label && <span>{program.duration_label}</span>}
                          <span>{program.exercise_count} exercise{program.exercise_count !== 1 ? 's' : ''}</span>
                          <span className={`font-semibold ${program.status === 'active' ? 'text-[#1f7a3f]' : 'text-[#9a9a9a]'}`}>
                            {program.status.charAt(0).toUpperCase() + program.status.slice(1)}
                          </span>
                          {program.product_id && <span className="text-[#b80f0a]">Listed in marketplace</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Link
                          href={`/coach/programs/${program.id}`}
                          className="rounded-full border border-[#191919] px-3 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-white"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={() => setSettingsModal(program)}
                          className="rounded-full border border-[#191919] px-3 py-2 font-semibold text-[#191919] hover:bg-[#f5f5f5]"
                        >
                          Settings
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === program.id}
                          onClick={() => handleDelete(program)}
                          className="rounded-full border border-[#b80f0a] px-3 py-2 font-semibold text-[#b80f0a] hover:bg-[#fff5f5] disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {(settingsModal !== null) && (
        <ProgramSettingsModal
          program={settingsModal}
          products={products}
          onSave={(saved) => { handleSaved(saved as Program); setSettingsModal(null) }}
          onClose={() => setSettingsModal(null)}
        />
      )}

      {createOpen && (
        <ProgramSettingsModal
          program={null}
          products={products}
          onSave={(saved) => { handleSaved(saved as Program); setCreateOpen(false) }}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </main>
  )
}
