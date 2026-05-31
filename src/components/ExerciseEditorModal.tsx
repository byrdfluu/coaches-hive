'use client'

import { useEffect, useRef, useState } from 'react'
import { createSafeClientComponentClient } from '@/lib/supabaseHelpers'
import {
  EXERCISE_CATEGORIES,
  EXERCISE_MODALITIES,
  EXERCISE_MOVEMENT_PATTERNS,
  EXERCISE_MUSCLE_GROUPS,
  EXERCISE_TRACKING_FIELD_TYPES,
  getYouTubeEmbedUrl,
} from '@/lib/programConstants'

export type ExerciseData = {
  id?: string
  name: string
  category: string
  modality: string
  muscle_group: string
  movement_pattern: string
  instructions: string
  video_url: string
  tracking_fields: string[]
  photo_paths: string[]
  thumbnail_path: string
}

type Props = {
  exercise?: Partial<ExerciseData> | null
  onSave: (exercise: ExerciseData & { id: string }) => void
  onClose: () => void
}

const BUCKET = 'product-media'

export default function ExerciseEditorModal({ exercise, onSave, onClose }: Props) {
  const supabase = createSafeClientComponentClient()
  const [name, setName] = useState(exercise?.name ?? '')
  const [category, setCategory] = useState(exercise?.category ?? '')
  const [modality, setModality] = useState(exercise?.modality ?? '')
  const [muscleGroup, setMuscleGroup] = useState(exercise?.muscle_group ?? '')
  const [movementPattern, setMovementPattern] = useState(exercise?.movement_pattern ?? '')
  const [instructions, setInstructions] = useState(exercise?.instructions ?? '')
  const [videoUrl, setVideoUrl] = useState(exercise?.video_url ?? '')
  const [trackingFields, setTrackingFields] = useState<string[]>(
    exercise?.tracking_fields?.length ? exercise.tracking_fields : ['Reps']
  )
  const [photoPaths, setPhotoPaths] = useState<string[]>(exercise?.photo_paths ?? [])
  const [thumbnailPath, setThumbnailPath] = useState(exercise?.thumbnail_path ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const thumbInputRef = useRef<HTMLInputElement>(null)

  const embedUrl = getYouTubeEmbedUrl(videoUrl)

  const addTrackingField = (field: string) => {
    if (!field || trackingFields.includes(field)) return
    setTrackingFields((prev) => [...prev, field])
  }

  const removeTrackingField = (field: string) => {
    if (trackingFields.length <= 1) return
    setTrackingFields((prev) => prev.filter((f) => f !== field))
  }

  const getPublicUrl = (path: string) => {
    if (!path) return ''
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  const uploadPhoto = async (file: File) => {
    if (photoPaths.length >= 4) return
    setUploadingPhoto(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `exercises/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (!uploadError) setPhotoPaths((prev) => [...prev, path])
    } finally {
      setUploadingPhoto(false)
    }
  }

  const uploadThumbnail = async (file: File) => {
    setUploadingThumb(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `exercises/thumb-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (!uploadError) setThumbnailPath(path)
    } finally {
      setUploadingThumb(false)
    }
  }

  const save = async (close: boolean) => {
    if (!name.trim()) { setError('Exercise name is required.'); return }
    setSaving(true)
    setError('')

    const payload = {
      name: name.trim(),
      category,
      modality,
      muscle_group: muscleGroup,
      movement_pattern: movementPattern,
      instructions,
      video_url: videoUrl,
      tracking_fields: trackingFields,
      photo_paths: photoPaths,
      thumbnail_path: thumbnailPath,
    }

    try {
      const isEdit = Boolean(exercise?.id)
      const url = isEdit ? `/api/coach/exercises/${exercise!.id}` : '/api/coach/exercises'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed.'); return }
      onSave(data.exercise)
      if (close) onClose()
    } finally {
      setSaving(false)
    }
  }

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdrop}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-[#191919] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e8e8e8] px-6 py-4">
          <h2 className="text-xl font-semibold text-[#191919]">
            {exercise?.id ? exercise.name || 'Edit Exercise' : 'New Exercise'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#6b6b6b] hover:bg-[#f5f5f5]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 md:flex-row">
          {/* Left: fields */}
          <div className="flex flex-1 flex-col gap-5 md:min-w-0">
            {/* Name */}
            <div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Exercise name"
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-lg font-semibold text-[#191919] outline-none focus:border-[#191919]"
              />
            </div>

            {/* Primary Focus */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">Primary Focus</p>
              <div className="grid gap-3">
                <div className="flex items-center gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-2.5">
                  <span className="w-28 text-sm text-[#6b6b6b]">Modality:</span>
                  <select
                    value={modality}
                    onChange={(e) => setModality(e.target.value)}
                    className="flex-1 bg-transparent text-sm font-semibold text-[#191919] outline-none"
                  >
                    <option value="">—</option>
                    {EXERCISE_MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-2.5">
                  <span className="w-28 text-sm text-[#6b6b6b]">Muscle group:</span>
                  <select
                    value={muscleGroup}
                    onChange={(e) => setMuscleGroup(e.target.value)}
                    className="flex-1 bg-transparent text-sm font-semibold text-[#191919] outline-none"
                  >
                    <option value="">—</option>
                    {EXERCISE_MUSCLE_GROUPS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-2.5">
                  <span className="w-28 text-sm text-[#6b6b6b]">Movement pattern:</span>
                  <select
                    value={movementPattern}
                    onChange={(e) => setMovementPattern(e.target.value)}
                    className="flex-1 bg-transparent text-sm font-semibold text-[#191919] outline-none"
                  >
                    <option value="">—</option>
                    {EXERCISE_MOVEMENT_PATTERNS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Category */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">Category</p>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-3 text-sm font-semibold text-[#191919] outline-none focus:border-[#191919]"
              >
                <option value="">Select category</option>
                {EXERCISE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Tracking Fields */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">Tracking Fields</p>
              <div className="flex flex-wrap gap-2">
                {trackingFields.map((field, i) => (
                  <span
                    key={field}
                    className="flex items-center gap-1.5 rounded-full border border-[#191919] bg-[#f5f5f5] px-3 py-1 text-xs font-semibold text-[#191919]"
                  >
                    {i + 1}. {field}
                    {trackingFields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTrackingField(field)}
                        className="text-[#6b6b6b] hover:text-[#b80f0a]"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                <select
                  defaultValue=""
                  onChange={(e) => { addTrackingField(e.target.value); e.target.value = '' }}
                  className="rounded-full border border-dashed border-[#aaaaaa] bg-white px-3 py-1 text-xs font-semibold text-[#6b6b6b] outline-none"
                >
                  <option value="" disabled>+ Add field</option>
                  {EXERCISE_TRACKING_FIELD_TYPES.filter((f) => !trackingFields.includes(f)).map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Instructions */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">
                Instructions <span className="normal-case font-normal text-[#9a9a9a]">(Separate each step on a new line)</span>
              </p>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={6}
                placeholder={`1. Starting position\n2. Movement cue\n3. Finish position`}
                className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919] resize-none"
              />
            </div>
          </div>

          {/* Right: media */}
          <div className="flex w-full flex-col gap-5 md:w-72 md:shrink-0">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">Media</p>

              {/* Video */}
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#9a9a9a]">Video</p>
                <div className="flex items-center gap-2 rounded-xl border border-[#dcdcdc] bg-white px-3 py-2">
                  <span className="text-[#9a9a9a]">🔗</span>
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="flex-1 bg-transparent text-xs text-[#191919] outline-none"
                  />
                </div>
                {embedUrl && (
                  <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl">
                    <iframe
                      src={embedUrl}
                      title="Video preview"
                      className="h-full w-full"
                      allowFullScreen
                    />
                  </div>
                )}
                {videoUrl && !embedUrl && (
                  <a
                    href={videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block text-xs text-[#b80f0a] underline"
                  >
                    Preview link ↗
                  </a>
                )}
              </div>

              {/* Photos */}
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#9a9a9a]">Photos</p>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 1, 2, 3].map((i) => {
                    const path = photoPaths[i]
                    return (
                      <div
                        key={i}
                        className="relative aspect-square overflow-hidden rounded-xl border border-[#dcdcdc] bg-[#f5f5f5]"
                      >
                        {path ? (
                          <>
                            <img
                              src={getPublicUrl(path)}
                              alt={`Photo ${i + 1}`}
                              className="h-full w-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setPhotoPaths((prev) => prev.filter((_, idx) => idx !== i))}
                              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white"
                            >
                              ×
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={uploadingPhoto || photoPaths.length >= 4}
                            onClick={() => photoInputRef.current?.click()}
                            className="flex h-full w-full flex-col items-center justify-center gap-1 text-[#aaaaaa] disabled:opacity-40"
                          >
                            <span className="text-lg">🖼</span>
                            <span className="text-[9px]">+</span>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) uploadPhoto(file)
                    e.target.value = ''
                  }}
                />
              </div>

              {/* Thumbnail */}
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#9a9a9a]">Custom Thumbnail</p>
                {thumbnailPath ? (
                  <div className="relative overflow-hidden rounded-xl border border-[#dcdcdc]">
                    <img src={getPublicUrl(thumbnailPath)} alt="Thumbnail" className="w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setThumbnailPath('')}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={uploadingThumb}
                    onClick={() => thumbInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#aaaaaa] py-3 text-xs font-semibold text-[#6b6b6b] hover:border-[#191919] disabled:opacity-40"
                  >
                    🖼 Choose custom thumbnail
                  </button>
                )}
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) uploadThumbnail(file)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#e8e8e8] px-6 py-4">
          <div>{error && <p className="text-xs text-[#b80f0a]">{error}</p>}</div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => save(false)}
              className="rounded-full border border-[#191919] px-5 py-2.5 text-sm font-semibold text-[#191919] transition hover:bg-[#f5f5f5] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save(true)}
              className="rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save & Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
