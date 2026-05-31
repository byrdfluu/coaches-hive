'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import AthleteSidebar from '@/components/AthleteSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import { createSafeClientComponentClient } from '@/lib/supabaseHelpers'
import { getYouTubeEmbedUrl } from '@/lib/programConstants'

type SetRow = Record<string, string>

type ExerciseEntry = {
  id: string
  cpe_id: string
  position: number
  sets: number | null
  reps: string | null
  rest_seconds: number | null
  notes: string | null
  name: string
  category: string | null
  modality: string | null
  muscle_group: string | null
  instructions: string | null
  video_url: string | null
  tracking_fields: string[]
  photo_paths: string[]
  thumbnail_path: string | null
}

type Program = {
  id: string
  title: string
  description: string | null
  duration_label: string | null
  coach_name: string
}

type LogEntry = {
  id: string
  logged_at: string
  sets_data: SetRow[]
  notes: string | null
}

const BUCKET = 'product-media'

function ExerciseCard({
  exercise,
  priorLogs,
  programId,
  onLogged,
}: {
  exercise: ExerciseEntry
  priorLogs: LogEntry[]
  programId: string
  onLogged: () => void
}) {
  const supabase = createSafeClientComponentClient()
  const [expanded, setExpanded] = useState(false)
  const [sets, setSets] = useState<SetRow[]>([{}])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const embedUrl = exercise.video_url ? getYouTubeEmbedUrl(exercise.video_url) : null
  const instructions = exercise.instructions
    ? exercise.instructions.split('\n').filter(Boolean)
    : []
  const mostRecentLog = priorLogs[0] ?? null

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  const addSet = () => setSets((prev) => [...prev, {}])
  const updateSet = (idx: number, field: string, value: string) => {
    setSets((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const saveLog = async () => {
    setSaving(true)
    setToast('')
    const res = await fetch(`/api/athlete/programs/${programId}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exercise_id: exercise.id,
        sets_data: sets.map((s, i) => ({ set: i + 1, ...s })),
        notes,
      }),
    })
    if (res.ok) {
      setToast('Logged!')
      setSets([{}])
      setNotes('')
      onLogged()
      setTimeout(() => setToast(''), 2000)
    } else {
      const data = await res.json()
      setToast(data.error ?? 'Save failed.')
    }
    setSaving(false)
  }

  return (
    <div className="glass-card border border-[#191919] bg-white">
      <div className="p-5">
        {/* Exercise header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[#191919]">{exercise.name}</h3>
            <div className="mt-1 flex flex-wrap gap-2">
              {[exercise.category, exercise.muscle_group, exercise.modality].filter(Boolean).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[#dcdcdc] bg-[#f5f5f5] px-2.5 py-0.5 text-[11px] font-semibold text-[#6b6b6b]"
                >
                  {tag}
                </span>
              ))}
              {exercise.sets && exercise.reps && (
                <span className="rounded-full border border-[#191919] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#191919]">
                  {exercise.sets} × {exercise.reps}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        {instructions.length > 0 && (
          <ol className="mt-4 space-y-1.5">
            {instructions.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-[#4a4a4a]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#dcdcdc] bg-[#f5f5f5] text-[10px] font-semibold text-[#191919]">
                  {i + 1}
                </span>
                {step.replace(/^\d+\.\s*/, '')}
              </li>
            ))}
          </ol>
        )}

        {/* Video */}
        {exercise.video_url && (
          <div className="mt-4">
            {embedUrl ? (
              <div className="aspect-video w-full overflow-hidden rounded-2xl">
                <iframe
                  src={embedUrl}
                  title={`${exercise.name} video`}
                  className="h-full w-full"
                  allowFullScreen
                />
              </div>
            ) : (
              <a
                href={exercise.video_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#f5f5f5]"
              >
                Watch video ↗
              </a>
            )}
          </div>
        )}

        {/* Photos */}
        {exercise.photo_paths?.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {exercise.photo_paths.map((path, i) => (
              <img
                key={i}
                src={getPublicUrl(path)}
                alt={`${exercise.name} photo ${i + 1}`}
                className="h-24 w-24 shrink-0 rounded-xl object-cover border border-[#dcdcdc]"
              />
            ))}
          </div>
        )}

        {/* Prior log summary */}
        {mostRecentLog && (
          <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#9a9a9a]">Last logged</p>
            <p className="mt-1 text-xs text-[#4a4a4a]">
              {new Date(mostRecentLog.logged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {' — '}
              {mostRecentLog.sets_data.length} set{mostRecentLog.sets_data.length !== 1 ? 's' : ''}
              {mostRecentLog.sets_data[0] && Object.entries(mostRecentLog.sets_data[0])
                .filter(([k]) => k !== 'set')
                .map(([k, v]) => ` · ${v} ${k}`)
                .join('')}
            </p>
          </div>
        )}

        {/* Log toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 text-sm font-semibold text-[#b80f0a] hover:underline"
        >
          {expanded ? 'Hide log' : 'Log this exercise'}
        </button>

        {/* Log form */}
        {expanded && (
          <div className="mt-3 space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e8e8e8]">
                    <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-[#9a9a9a]">Set</th>
                    {exercise.tracking_fields.map((field) => (
                      <th key={field} className="pb-2 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-[#9a9a9a]">{field}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f0]">
                  {sets.map((set, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 text-sm font-semibold text-[#6b6b6b]">{i + 1}</td>
                      {exercise.tracking_fields.map((field) => (
                        <td key={field} className="py-2 pr-2">
                          <input
                            type="text"
                            value={set[field] ?? ''}
                            onChange={(e) => updateSet(i, field, e.target.value)}
                            className="w-20 rounded-xl border border-[#dcdcdc] px-2 py-1.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addSet}
              className="text-xs font-semibold text-[#6b6b6b] hover:text-[#191919]"
            >
              + Add set
            </button>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Notes (optional)"
              className="w-full resize-none rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-2.5 text-sm text-[#191919] outline-none focus:border-[#191919]"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={saveLog}
                className="rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save log'}
              </button>
              {toast && <p className={`text-sm font-semibold ${toast === 'Logged!' ? 'text-[#1f7a3f]' : 'text-[#b80f0a]'}`}>{toast}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AthleteProgramDetailPage() {
  const params = useParams()
  const programId = params.id as string

  const [program, setProgram] = useState<Program | null>(null)
  const [exercises, setExercises] = useState<ExerciseEntry[]>([])
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({})
  const [loading, setLoading] = useState(true)

  const loadLogs = async () => {
    const res = await fetch(`/api/athlete/programs/${programId}/log`)
    if (res.ok) {
      const data = await res.json()
      setLogs(data.logs ?? {})
    }
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      const [pRes] = await Promise.all([
        fetch(`/api/athlete/programs/${programId}`),
        fetch(`/api/athlete/programs/${programId}/log`).then((r) => r.ok ? r.json() : null).then((d) => { if (active && d) setLogs(d.logs ?? {}) }),
      ])
      if (!active) return
      if (pRes.ok) {
        const data = await pRes.json()
        setProgram(data.program)
        setExercises(data.exercises ?? [])
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [programId])

  if (loading) return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <LoadingState label="Loading program…" />
        </div>
      </div>
    </main>
  )

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="min-w-0 space-y-6">
            <div>
              <Link href="/athlete/programs" className="text-xs font-semibold text-[#6b5f55] hover:text-[#191919]">
                ← Programs
              </Link>
              <h1 className="mt-1 text-2xl font-semibold text-[#191919]">{program?.title ?? 'Program'}</h1>
              <div className="mt-1 flex flex-wrap gap-3 text-sm text-[#6b6b6b]">
                {program?.coach_name && <span>by {program.coach_name}</span>}
                {program?.duration_label && <span>· {program.duration_label}</span>}
                <span>· {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}</span>
              </div>
              {program?.description && (
                <p className="mt-2 text-sm text-[#4a4a4a]">{program.description}</p>
              )}
            </div>

            {exercises.length === 0 ? (
              <p className="text-sm text-[#6b6b6b]">This program has no exercises yet.</p>
            ) : (
              <div className="space-y-5">
                {exercises.map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    priorLogs={logs[ex.id] ?? []}
                    programId={programId}
                    onLogged={loadLogs}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
