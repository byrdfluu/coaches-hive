'use client'

import { useState } from 'react'

type Plan = { tier: string; label: string; billingInterval: 'month' | 'year' }

export default function MobileSubscriptionPlans({ token, plans }: { token: string; plans: Plan[] }) {
  const [loadingTier, setLoadingTier] = useState('')
  const [error, setError] = useState('')

  const start = async (tier: string, billingInterval: 'month' | 'year') => {
    setLoadingTier(billingInterval)
    setError('')
    const response = await fetch('/api/stripe/mobile-onboarding-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, tier, billingInterval }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.url) {
      setError(payload?.error || 'Unable to start checkout.')
      setLoadingTier('')
      return
    }
    window.location.assign(payload.url)
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] px-5 py-12 text-[#191919]">
      <section className="mx-auto max-w-lg rounded-3xl border border-[#dedede] bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">Coaches Hive</p>
        <h1 className="mt-3 text-3xl font-semibold">Choose your plan</h1>
        <p className="mt-3 text-sm leading-6 text-[#555]">Stripe securely activates your subscription. Access updates only after webhook confirmation.</p>
        <div className="mt-6 grid gap-3">
          {plans.map((plan) => (
            <button key={plan.billingInterval} type="button" disabled={Boolean(loadingTier)} onClick={() => start(plan.tier, plan.billingInterval)}
              className="flex w-full items-center justify-between rounded-2xl border border-[#dedede] px-5 py-4 text-left font-semibold hover:border-[#b80f0a] disabled:opacity-60">
              <span>{plan.label}</span><span>{loadingTier === plan.billingInterval ? 'Opening…' : 'Select'}</span>
            </button>
          ))}
        </div>
        {error ? <p className="mt-4 text-sm text-[#b80f0a]">{error}</p> : null}
      </section>
    </main>
  )
}
