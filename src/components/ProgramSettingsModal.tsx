'use client'

import { useState } from 'react'

type ProductOption = { id: string; title: string; status: string }

type ProgramData = {
  id?: string
  title: string
  description: string | null
  duration_label: string | null
  status: string
  product_id: string | null
}

type Props = {
  program?: Partial<ProgramData> | null
  products: ProductOption[]
  onSave: (program: ProgramData & { id: string }) => void
  onClose: () => void
}

export default function ProgramSettingsModal({ program, products, onSave, onClose }: Props) {
  const [title, setTitle] = useState(program?.title ?? '')
  const [description, setDescription] = useState(program?.description ?? '')
  const [durationLabel, setDurationLabel] = useState(program?.duration_label ?? '')
  const [status, setStatus] = useState(program?.status ?? 'draft')
  const [productId, setProductId] = useState<string>(program?.product_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!title.trim()) { setError('Program title is required.'); return }
    setSaving(true)
    setError('')

    const payload = {
      title: title.trim(),
      description,
      duration_label: durationLabel,
      status,
      product_id: productId || null,
    }

    try {
      const isEdit = Boolean(program?.id)
      const url = isEdit ? `/api/coach/programs/${program!.id}` : '/api/coach/programs'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed.'); return }
      onSave(data.program)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-[#191919] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e8e8e8] px-6 py-4">
          <h2 className="text-xl font-semibold text-[#191919]">
            {program?.id ? 'Program Settings' : 'New Program'}
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
        <div className="space-y-5 p-6">
          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">
              Program Name *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 8-Week Core Strength"
              className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What will athletes get from this program?"
              className="w-full resize-none rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">
              Duration
            </label>
            <input
              type="text"
              value={durationLabel}
              onChange={(e) => setDurationLabel(e.target.value)}
              placeholder="e.g. 8 Weeks, 12 Sessions"
              className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
            />
          </div>

          {/* Status */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-3 text-sm font-semibold text-[#191919] outline-none focus:border-[#191919]"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Marketplace product link */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">
              Marketplace Product
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
            >
              <option value="">Not linked — not for sale yet</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.status})
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-[#9a9a9a]">
              Link to an existing marketplace product to let athletes purchase this program. Create the product first at{' '}
              <a href="/coach/marketplace/create" target="_blank" className="underline">Marketplace → Create</a>.
            </p>
          </div>

          {error && <p className="text-xs text-[#b80f0a]">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-[#e8e8e8] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#191919] px-5 py-2.5 text-sm font-semibold text-[#191919] hover:bg-[#f5f5f5]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
