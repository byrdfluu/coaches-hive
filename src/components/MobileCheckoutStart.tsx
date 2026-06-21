'use client'

import { useState } from 'react'

type Props = {
  token: string
  endpoint: string
  title: string
  description: string
  amountLabel?: string
}

export default function MobileCheckoutStart({ token, endpoint, title, description, amountLabel }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const beginCheckout = async () => {
    if (!token || !endpoint) return
    setLoading(true)
    setError('')
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.url) {
      setError(payload?.error || 'Unable to start checkout.')
      setLoading(false)
      return
    }
    window.location.assign(payload.url)
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] px-5 py-12 text-[#191919]">
      <section className="mx-auto max-w-lg rounded-3xl border border-[#dedede] bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">Coaches Hive</p>
        <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#555]">{description}</p>
        {amountLabel ? (
          <div className="mt-6 flex items-center justify-between rounded-2xl bg-[#f5f5f5] px-4 py-4">
            <span className="text-sm text-[#555]">Total</span>
            <span className="text-lg font-semibold">{amountLabel}</span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={beginCheckout}
          disabled={loading || !token || !endpoint}
          className="mt-6 w-full rounded-full bg-[#b80f0a] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Opening secure checkout…' : 'Continue to secure checkout'}
        </button>
        {error ? <p className="mt-4 text-sm text-[#b80f0a]">{error}</p> : null}
        <p className="mt-5 text-xs leading-5 text-[#777]">Payment completion is confirmed by Stripe and may take a few seconds to appear in the mobile app.</p>
      </section>
    </main>
  )
}
