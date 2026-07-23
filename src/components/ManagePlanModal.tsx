'use client'

import { useEffect, useState } from 'react'
import { ALL_ACCESS_PRICING, formatUsdCents } from '@/lib/allAccessPricing'

type ManageRole = 'coach' | 'athlete' | 'org_admin'

type Props = {
  open: boolean
  onClose: () => void
  role: ManageRole
  currentTier?: string | null
  isSubscribed?: boolean
  onPlanChanged?: (newTier: string) => void
}

const roleInfo = {
  coach: { label: 'Coach All Access', role: 'coach', tier: 'all_access' },
  athlete: { label: 'Family All Access', role: 'athlete', tier: 'family_all_access' },
  org_admin: { label: 'Organization All Access', role: 'org_admin', tier: 'all_access' },
} as const

export default function ManagePlanModal({ open, onClose, role, isSubscribed, onPlanChanged }: Props) {
  const [interval, setInterval] = useState<'month' | 'year'>('year')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const info = roleInfo[role]
  const prices = role === 'coach'
    ? ALL_ACCESS_PRICING.coach
    : role === 'athlete'
      ? ALL_ACCESS_PRICING.athlete
      : ALL_ACCESS_PRICING.org

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose, open])

  if (!open) return null

  const continueBilling = async () => {
    setLoading(true)
    setError('')
    try {
      if (isSubscribed) {
        const response = await fetch('/api/stripe/subscription/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ billingInterval: interval }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          setError(payload?.error || 'Unable to update billing.')
          return
        }
        onPlanChanged?.(info.tier)
        onClose()
        return
      }
      window.location.assign(
        `/checkout?role=${info.role}&tier=${info.tier}&billing_interval=${interval}`,
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">All Access</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{info.label}</h2>
            <p className="mt-2 text-sm text-[#4a4a4a]">Every feature is included. Choose your billing interval.</p>
          </div>
          <button type="button" onClick={onClose} className="text-xl" aria-label="Close">×</button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {(['month', 'year'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              className={`rounded-2xl border p-4 text-left ${interval === value ? 'border-[#b80f0a] bg-[#fff7f6]' : 'border-[#dcdcdc]'}`}
            >
              <span className="block text-sm font-semibold capitalize">{value === 'month' ? 'Monthly' : 'Annual'}</span>
              <span className="mt-1 block text-2xl font-semibold">{formatUsdCents(prices[value])}</span>
              {value === 'year' ? <span className="text-xs text-[#4a4a4a]">Save two months</span> : null}
            </button>
          ))}
        </div>
        {role === 'org_admin' ? (
          <p className="mt-4 rounded-2xl bg-[#f5f5f5] p-3 text-sm text-[#4a4a4a]">
            One active coach is included. Additional active coaches are $19/month or $190/year.
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-[#b80f0a]">{error}</p> : null}
        <button
          type="button"
          onClick={continueBilling}
          disabled={loading}
          className="mt-6 w-full rounded-full bg-[#191919] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Updating…' : isSubscribed ? 'Change billing interval' : 'Continue to checkout'}
        </button>
      </div>
    </div>
  )
}
