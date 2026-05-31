'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import CoachSidebar from '@/components/CoachSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import ExerciseEditorModal, { type ExerciseData } from '@/components/ExerciseEditorModal'
import ProgramSettingsModal from '@/components/ProgramSettingsModal'

type Exercise = ExerciseData & {
  id: string
  cpe_id: string
  position: number
  sets: number | null
  reps: string | null
  rest_seconds: number | null
  notes: string | null
}

type Program = {
  id: string
  title: string
  description: string | null
  duration_label: string | null
  status: string
  product_id: string | null
}

type LibraryExercise = ExerciseData & { id: string }

export default function CoachProgramDetailPage() {
  const params = useParams()
  const programId = params.id as string

  const [program, setProgram] = useState<Program | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [products, setProducts] = useState<Array<{ id: string; title: string; status: string }>>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  const [editorModal, setEditorModal] = useState<Partial<ExerciseData> | null>(null)
  const [editorForNew, setEditorForNew] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [libraryOpen, setLibraryOpen] = useState(false)
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryExercises, setLibraryExercises] = useState<LibraryExercise[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    let active = true
    const load = async () => {
      const [pRes, prodRes] = await Promise.all([
        fetch(`/api/coach/programs/${programId}`),
        fetch('/api/coach/products'),
      ])
      if (!active) return
      if (pRes.ok) {
        const data = await pRes.json()
        setProgram(data.program)
        setExercises(data.exercises ?? [])
      }
      if (prodRes.ok) {
        const data = await prodRes.json()
        setProducts((data.products ?? []).map((p: any) => ({ id: p.id, title: p.title, status: p.status })))
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [programId])

  useEffect(() => {
    if (!libraryOpen) return
    let active = true
    const search = async () => {
      setLibraryLoading(true)
      const res = await fetch(`/api/coach/exercises?search=${encodeURIComponent(librarySearch)}`)
      if (active && res.ok) {
        const data = await res.json()
        setLibraryExercises(data.exercises ?? [])
      }
      if (active) setLibraryLoading(false)
    }
    const timer = setTimeout(search, 200)
    return () => { active = false; clearTimeout(timer) }
  }, [libraryOpen, librarySearch])

  const addExerciseToProgram = async (exerciseId: string) => {
    setAddingId(exerciseId)
    const res = await fetch(`/api/coach/programs/${programId}/exercises`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise_id: exerciseId }),
    })
    if (res.ok) {
      // Reload exercises
      const pRes = await fetch(`/api/coach/programs/${programId}`)
      if (pRes.ok) {
        const data = await pRes.json()
        setExercises(data.exercises ?? [])
      }
      showToast('Exercise added.')
    } else {
      const data = await res.json()
      showToast(data.error ?? 'Could not add exercise.')
    }
    setAddingId(null)
  }

  const removeExercise = async (exerciseId: string) => {
    if (!confirm('Remove this exercise from the program?')) return
    const res = await fetch(`/api/coach/programs/${programId}/exercises/${exerciseId}`, { method: 'DELETE' })
    if (res.ok) {
      setExercises((prev) => prev.filter((e) => e.id !== exerciseId))
      showToast('Exercise removed.')
    }
  }

  const moveExercise = async (exerciseId: string, direction: 'up' | 'down') => {
    const idx = exercises.findIndex((e) => e.id === exerciseId)
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === exercises.length - 1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const newPos = exercises[swapIdx].position
    const oldPos = exercises[idx].position

    const updated = [...exercises]
    updated[idx] = { ...updated[idx], position: newPos }
    updated[swapIdx] = { ...updated[swapIdx], position: oldPos }
    updated.sort((a, b) => a.position - b.position)
    setExercises(updated)

    await Promise.all([
      fetch(`/api/coach/programs/${programId}/exercises/${exerciseId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: newPos }),
      }),
      fetch(`/api/coach/programs/${programId}/exercises/${exercises[swapIdx].id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: oldPos }),
      }),
    ])
  }

  const handleExerciseSaved = (saved: ExerciseData & { id: string }) => {
    if (editorForNew) {
      addExerciseToProgram(saved.id)
      setEditorForNew(false)
    } else {
      setExercises((prev) => prev.map((e) => e.id === saved.id ? { ...e, ...saved } : e))
      showToast('Exercise updated.')
    }
    setEditorModal(null)
  }

  if (loading) return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <LoadingState label="Loading program…" />
        </div>
      </div>
    </main>
  )

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="min-w-0 space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Link href="/coach/programs" className="text-xs font-semibold text-[#6b5f55] hover:text-[#191919]">
                  ← Programs
                </Link>
                <h1 className="mt-1 text-2xl font-semibold text-[#191919]">{program?.title ?? 'Program'}</h1>
                {program?.duration_label && (
                  <p className="mt-0.5 text-sm text-[#6b6b6b]">{program.duration_label}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#f5f5f5]"
                >
                  Edit settings
                </button>
              </div>
            </div>

            {toast && <p className="text-sm font-semibold text-[#1f7a3f]">{toast}</p>}

            {/* Exercise list */}
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#191919]">Exercises</h2>
                <span className="text-sm text-[#6b6b6b]">{exercises.length} total</span>
              </div>

              <div className="mt-4 space-y-3">
                {exercises.length === 0 ? (
                  <EmptyState title="No exercises yet." description="Add exercises from your library or create new ones." />
                ) : (
                  exercises.map((ex, idx) => (
                    <div key={ex.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#191919]">{ex.name}</p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#6b6b6b]">
                            {ex.modality && <span>{ex.modality}</span>}
                            {ex.muscle_group && <span>{ex.muscle_group}</span>}
                            {ex.category && <span>{ex.category}</span>}
                            {ex.sets && ex.reps && <span className="font-semibold text-[#191919]">{ex.sets} sets × {ex.reps}</span>}
                            {ex.rest_seconds && <span>Rest: {ex.rest_seconds}s</span>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <button
                            disabled={idx === 0}
                            onClick={() => moveExercise(ex.id, 'up')}
                            className="rounded-full border border-[#dcdcdc] px-3 py-1.5 font-semibold text-[#6b6b6b] hover:border-[#191919] disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            disabled={idx === exercises.length - 1}
                            onClick={() => moveExercise(ex.id, 'down')}
                            className="rounded-full border border-[#dcdcdc] px-3 py-1.5 font-semibold text-[#6b6b6b] hover:border-[#191919] disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => setEditorModal(ex)}
                            className="rounded-full border border-[#191919] px-3 py-1.5 font-semibold text-[#191919] hover:bg-[#f5f5f5]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => removeExercise(ex.id)}
                            className="rounded-full border border-[#b80f0a] px-3 py-1.5 font-semibold text-[#b80f0a] hover:bg-[#fff5f5]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add exercise */}
              <div className="mt-4 border-t border-[#e8e8e8] pt-4">
                {!libraryOpen ? (
                  <button
                    onClick={() => setLibraryOpen(true)}
                    className="rounded-full border border-dashed border-[#aaaaaa] px-5 py-2.5 text-sm font-semibold text-[#6b6b6b] hover:border-[#191919] hover:text-[#191919]"
                  >
                    + Add exercise
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={librarySearch}
                        onChange={(e) => setLibrarySearch(e.target.value)}
                        placeholder="Search your exercise library…"
                        autoFocus
                        className="flex-1 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      />
                      <button
                        onClick={() => setLibraryOpen(false)}
                        className="text-sm text-[#6b6b6b] hover:text-[#191919]"
                      >
                        Cancel
                      </button>
                    </div>
                    <button
                      onClick={() => { setEditorForNew(true); setEditorModal({}) }}
                      className="text-sm font-semibold text-[#b80f0a] hover:underline"
                    >
                      + Create new exercise
                    </button>
                    {libraryLoading ? (
                      <p className="text-sm text-[#6b6b6b]">Searching…</p>
                    ) : libraryExercises.length === 0 ? (
                      <p className="text-sm text-[#6b6b6b]">No exercises found.</p>
                    ) : (
                      <div className="max-h-60 space-y-2 overflow-y-auto">
                        {libraryExercises.map((ex) => {
                          const alreadyAdded = exercises.some((e) => e.id === ex.id)
                          return (
                            <div
                              key={ex.id}
                              className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm"
                            >
                              <div>
                                <p className="font-semibold text-[#191919]">{ex.name}</p>
                                {(ex.muscle_group || ex.category) && (
                                  <p className="text-[11px] text-[#6b6b6b]">{[ex.modality, ex.muscle_group, ex.category].filter(Boolean).join(' · ')}</p>
                                )}
                              </div>
                              <button
                                disabled={alreadyAdded || addingId === ex.id}
                                onClick={() => addExerciseToProgram(ex.id)}
                                className="rounded-full bg-[#191919] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                              >
                                {alreadyAdded ? 'Added' : addingId === ex.id ? '…' : 'Add'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {editorModal !== null && (
        <ExerciseEditorModal
          exercise={editorModal}
          onSave={handleExerciseSaved}
          onClose={() => { setEditorModal(null); setEditorForNew(false) }}
        />
      )}

      {settingsOpen && program && (
        <ProgramSettingsModal
          program={program}
          products={products}
          onSave={(saved) => { setProgram((p) => p ? { ...p, ...saved } : p); showToast('Settings saved.'); setSettingsOpen(false) }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  )
}
