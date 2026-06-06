'use client'

import { FormEvent, useEffect, useState } from 'react'

type MembershipPlan = {
  id: string
  name: string
  description?: string | null
  price_cents: number
  currency: string
  billing_interval: string
  included_sessions: number
  stripe_product_id?: string | null
  stripe_price_id?: string | null
  status: 'draft' | 'active' | 'archived'
  created_at?: string | null
  metadata?: {
    sport?: string | null
    skill_level?: string | null
    max_athletes?: number | null
    session_frequency?: string | null
  } | null
}

const SPORTS = [
  'Soccer',
  'Basketball',
  'Football',
  'Baseball',
  'Volleyball',
  'Tennis',
  'Track & Field',
  'Swimming',
  'Wrestling',
  'General Fitness',
  'Other',
]

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All levels']

const SESSION_FREQUENCIES = [
  '1x per week',
  '2x per week',
  '3x per week',
  '4x per week',
  'Flexible',
]

const parsePriceCents = (value: string) => {
  const cleaned = String(value || '').replace(/[$,]/g, '').trim()
  const num = parseFloat(cleaned)
  if (!Number.isFinite(num) || num <= 0) return 0
  return Math.round(num * 100)
}

type Props = {
  plan?: MembershipPlan | null
  onSave: (plan: MembershipPlan) => void
  onClose: () => void
}

export default function CreateMembershipModal({ plan, onSave, onClose }: Props) {
  const isEdit = Boolean(plan?.id)

  const [name, setName] = useState(plan?.name || '')
  const [monthlyPrice, setMonthlyPrice] = useState(
    plan ? String(Number(plan.price_cents || 0) / 100) : '',
  )
  const [includedSessions, setIncludedSessions] = useState(
    plan ? String(plan.included_sessions ?? 10) : '10',
  )
  const [description, setDescription] = useState(plan?.description || '')
  const [status, setStatus] = useState<'draft' | 'active'>(
    plan?.status === 'active' ? 'active' : 'draft',
  )
  const [sport, setSport] = useState(plan?.metadata?.sport || '')
  const [skillLevel, setSkillLevel] = useState(plan?.metadata?.skill_level || '')
  const [maxAthletes, setMaxAthletes] = useState(
    plan?.metadata?.max_athletes ? String(plan.metadata.max_athletes) : '',
  )
  const [sessionFrequency, setSessionFrequency] = useState(
    plan?.metadata?.session_frequency || '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (!name.trim()) { setError('Program name is required.'); return }
    if (!monthlyPrice.trim()) { setError('Price is required.'); return }
    const priceCents = parsePriceCents(monthlyPrice)
    if (priceCents <= 0) { setError('Enter a valid price.'); return }

    setSaving(true)
    const body: Record<string, unknown> = {
      name: name.trim(),
      monthly_price: monthlyPrice.trim(),
      included_sessions: includedSessions.trim() || '0',
      description: description.trim(),
      status,
      sport: sport || null,
      skill_level: skillLevel || null,
      max_athletes: maxAthletes ? Number(maxAthletes) : null,
      session_frequency: sessionFrequency || null,
    }
    if (isEdit && plan?.id) body.id = plan.id

    const response = await fetch('/api/coach/memberships', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok || !payload?.plan) {
      setError(payload?.error || 'Unable to save membership plan.')
      return
    }

    onSave(payload.plan as MembershipPlan)
    onClose()
  }

  const handleBackdrop = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  const inputClass =
    'w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]'
  const labelClass = 'block space-y-1.5 text-sm font-semibold text-[#191919]'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdrop}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-[#191919] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e8e8e8] px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Memberships</p>
            <h2 className="mt-0.5 text-lg font-semibold text-[#191919]">
              {isEdit ? 'Edit program' : 'Create program'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#6b6b6b] hover:bg-[#f5f5f5]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form
          id="membership-form"
          onSubmit={handleSubmit}
          className="flex-1 space-y-5 overflow-y-auto px-6 py-5"
        >
          {/* Row 1: name + price */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span>Program name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="12-week skill development"
              />
            </label>
            <label className={labelClass}>
              <span>Price / month</span>
              <input
                value={monthlyPrice}
                onChange={(e) => setMonthlyPrice(e.target.value)}
                className={inputClass}
                placeholder="$400"
              />
            </label>
          </div>

          {/* Row 2: sessions + status */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span>Total sessions in program</span>
              <input
                type="number"
                min="0"
                value={includedSessions}
                onChange={(e) => setIncludedSessions(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              <span>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'draft' | 'active')}
                className={inputClass}
              >
                <option value="draft">Draft</option>
                <option value="active">Active / publish to Stripe</option>
              </select>
            </label>
          </div>

          {/* Row 3: sport + skill level */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span>Sport / focus area</span>
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                className={inputClass}
              >
                <option value="">Select sport</option>
                {SPORTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              <span>Skill level</span>
              <select
                value={skillLevel}
                onChange={(e) => setSkillLevel(e.target.value)}
                className={inputClass}
              >
                <option value="">Select level</option>
                {SKILL_LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Row 4: max athletes + session frequency */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span>Max athletes <span className="font-normal text-[#6b6b6b]">(optional)</span></span>
              <input
                type="number"
                min="1"
                value={maxAthletes}
                onChange={(e) => setMaxAthletes(e.target.value)}
                className={inputClass}
                placeholder="Unlimited"
              />
            </label>
            <label className={labelClass}>
              <span>Session frequency</span>
              <select
                value={sessionFrequency}
                onChange={(e) => setSessionFrequency(e.target.value)}
                className={inputClass}
              >
                <option value="">Select frequency</option>
                {SESSION_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Description */}
          <label className={labelClass}>
            <span>Description / perks</span>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
              placeholder="12 sessions of personalized skill development, weekly check-ins, and messaging access throughout the program."
            />
          </label>

          {error ? <p className="text-xs text-[#b80f0a]">{error}</p> : null}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#e8e8e8] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#191919] px-5 py-2.5 text-sm font-semibold text-[#191919] hover:bg-[#f5f5f5]"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="membership-form"
            disabled={saving}
            className="rounded-full bg-[#b80f0a] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:opacity-90"
          >
            {saving
              ? 'Saving...'
              : isEdit
                ? 'Save changes'
                : status === 'active'
                  ? 'Publish program'
                  : 'Save draft'}
          </button>
        </div>
      </div>
    </div>
  )
}