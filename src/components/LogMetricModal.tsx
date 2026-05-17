'use client'

import { useState } from 'react'

type Props = {
  athleteId: string
  existingLabels?: string[]
  endpoint: string // e.g. /api/coach/athletes/[id]/metrics or /api/athlete/metrics
  onSave: (snapshot: { metric_label: string; value: string; unit?: string; recorded_at: string }) => void
  onClose: () => void
}

const COMMON_METRICS = [
  'Weight', 'Height', 'Body Fat %',
  '40-Yard Dash', 'Vertical Jump', 'Broad Jump',
  'Bench Max', 'Squat Max', 'Deadlift Max',
  'Mile Time', '400m Time', '100m Time',
  'Exit Velocity', 'Pitching Velocity', 'Sprint Speed',
  'VO2 Max', 'Resting Heart Rate',
]

export default function LogMetricModal({ existingLabels = [], endpoint, onSave, onClose }: Props) {
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const suggestions = Array.from(new Set([...existingLabels, ...COMMON_METRICS])).sort()

  const handleSave = async () => {
    if (!label.trim() || !value.trim()) {
      setErr('Metric name and value are required.')
      return
    }
    setSaving(true)
    setErr('')
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metric_label: label.trim(),
        value: value.trim(),
        unit: unit.trim() || null,
        recorded_at: date,
        notes: notes.trim() || null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setErr(data?.error || 'Failed to save metric.')
      return
    }
    onSave({ metric_label: label.trim(), value: value.trim(), unit: unit.trim() || undefined, recorded_at: date })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Progress</p>
            <h2 className="mt-1 text-2xl font-semibold text-[#191919]">Log metric</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#191919]">Metric name</label>
            <input
              list="metric-suggestions"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Weight, 40-Yard Dash, Bench Max"
              className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
            />
            <datalist id="metric-suggestions">
              {suggestions.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#191919]">Value</label>
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 185"
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#191919]">Unit <span className="font-normal text-[#9a9a9a]">(optional)</span></label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="lbs, sec, mph…"
                className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#191919]">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#191919]">Notes <span className="font-normal text-[#9a9a9a]">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context, conditions, or observations…"
              rows={2}
              className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
            />
          </div>

          {err && <p className="text-xs text-[#b80f0a]">{err}</p>}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !label.trim() || !value.trim()}
              className="rounded-full bg-[#191919] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save metric'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
