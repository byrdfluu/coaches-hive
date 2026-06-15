'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import StripeCheckoutForm from '@/components/StripeCheckoutForm'

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

type PublicTryout = {
  id: string
  name: string
  sport: string | null
  age_group: string | null
  event_date: string | null
  event_time: string | null
  max_slots: number | null
  registration_fee_cents: number | null
  status: 'draft' | 'open' | 'closed' | 'complete'
  notes: string | null
  org_name: string | null
  registration_count: number
}

const formatDate = (value?: string | null) => {
  if (!value) return 'Date TBD'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const formatTime = (value?: string | null) => {
  if (!value) return 'Time TBD'
  const [hours, minutes] = value.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

const formatCurrency = (cents?: number | null) => {
  const amount = (cents ?? 0) / 100
  return amount > 0 ? `$${amount.toFixed(2).replace(/\.00$/, '')}` : 'Free'
}

export default function PublicTryoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [tryout, setTryout] = useState<PublicTryout | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [fields, setFields] = useState({
    athlete_name: '',
    athlete_email: '',
    jersey_number: '',
  })

  useEffect(() => {
    let active = true
    const loadTryout = async () => {
      setLoading(true)
      const res = await fetch(`/api/tryouts/${id}`)
      if (!active) return
      if (!res.ok) {
        setNotFound(true)
        setLoading(false)
        return
      }
      const data = await res.json()
      setTryout(data.tryout)
      setLoading(false)
    }
    loadTryout()
    return () => {
      active = false
    }
  }, [id])

  const spotsLabel = useMemo(() => {
    if (!tryout?.max_slots) return 'Open registration'
    const remaining = Math.max(tryout.max_slots - (tryout.registration_count ?? 0), 0)
    return `${remaining} spot${remaining === 1 ? '' : 's'} left`
  }, [tryout])

  const submitRegistration = async (paymentIntentId?: string) => {
    if (!fields.athlete_name.trim() || !fields.athlete_email.trim()) return
    setSubmitting(true)
    setError('')
    const res = await fetch(`/api/tryouts/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...fields,
        payment_intent_id: paymentIntentId || undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (!res.ok) {
      setError(data?.error || 'Unable to register. Please try again.')
      return
    }
    setSubmitted(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fields.athlete_name.trim() || !fields.athlete_email.trim()) return
    if ((tryout?.registration_fee_cents ?? 0) <= 0) {
      await submitRegistration()
      return
    }
    if (!stripePromise) {
      setError('Payment is not configured yet.')
      return
    }
    setSubmitting(true)
    setError('')
    const res = await fetch(`/api/tryouts/${id}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    const data = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (!res.ok || !data?.clientSecret) {
      setError(data?.error || 'Unable to start payment. Please try again.')
      return
    }
    setClientSecret(data.clientSecret)
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f5] px-4">
        <p className="text-sm text-[#4a4a4a]">Loading tryout...</p>
      </main>
    )
  }

  if (notFound || !tryout) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f5] px-4">
        <div className="text-center">
          <p className="text-xl font-semibold text-[#191919]">Tryout not found</p>
          <p className="mt-2 text-sm text-[#4a4a4a]">This tryout link may have expired or been removed.</p>
        </div>
      </main>
    )
  }

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f5] px-4">
        <section className="w-full max-w-lg rounded-[2rem] border border-[#dcdcdc] bg-white p-8 text-center shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Tryout registration</p>
          <h1 className="mt-3 text-3xl font-semibold text-[#191919]">You're registered.</h1>
          <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">
            Your registration was sent to {tryout.org_name || 'the organization'}. They can now see you in their tryout registrations list.
          </p>
          <Link href="/athlete/dashboard" className="mt-6 inline-flex rounded-full bg-[#b80f0a] px-5 py-3 text-sm font-semibold text-white">
            Go to athlete dashboard
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] px-4 py-10">
      <div className="mx-auto grid max-w-5xl items-start gap-6 lg:grid-cols-[1fr_420px]">
        <section className="rounded-[2rem] border border-[#dcdcdc] bg-white p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{tryout.org_name || 'Organization'} tryout</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-[#191919]">{tryout.name}</h1>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-[#4a4a4a]">
            {tryout.sport ? <span className="rounded-full border border-[#dcdcdc] px-3 py-1">{tryout.sport}</span> : null}
            {tryout.age_group ? <span className="rounded-full border border-[#dcdcdc] px-3 py-1">{tryout.age_group}</span> : null}
            <span className="rounded-full border border-[#dcdcdc] px-3 py-1">{spotsLabel}</span>
            <span className="rounded-full border border-[#dcdcdc] px-3 py-1">{formatCurrency(tryout.registration_fee_cents)}</span>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Date</p>
              <p className="mt-2 text-lg font-semibold text-[#191919]">{formatDate(tryout.event_date)}</p>
            </div>
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Time</p>
              <p className="mt-2 text-lg font-semibold text-[#191919]">{formatTime(tryout.event_time)}</p>
            </div>
          </div>
          {tryout.notes ? (
            <div className="mt-6 rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Details</p>
              <p className="mt-2 text-sm leading-6 text-[#4a4a4a]">{tryout.notes}</p>
            </div>
          ) : null}
        </section>

        <section className="rounded-[2rem] border border-[#dcdcdc] bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Register</p>
          <h2 className="mt-3 text-2xl font-semibold text-[#191919]">Save your spot</h2>
          {tryout.status !== 'open' ? (
            <p className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] p-4 text-sm text-[#4a4a4a]">
              This tryout is not currently accepting registrations.
            </p>
          ) : clientSecret && stripePromise ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] p-4 text-sm text-[#4a4a4a]">
                Pay {formatCurrency(tryout.registration_fee_cents)} to complete registration for {fields.athlete_name}.
              </div>
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <StripeCheckoutForm clientSecret={clientSecret} onSuccess={submitRegistration} />
              </Elements>
              <button
                type="button"
                onClick={() => setClientSecret('')}
                className="w-full rounded-full border border-[#dcdcdc] px-5 py-3 text-sm font-semibold text-[#191919]"
              >
                Edit registration details
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-[#191919]">Athlete name *</span>
                <input
                  required
                  className="mt-1 w-full rounded-2xl border border-[#dcdcdc] px-3 py-3 text-sm"
                  value={fields.athlete_name}
                  onChange={(e) => setFields((prev) => ({ ...prev, athlete_name: e.target.value }))}
                  placeholder="Full name"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-[#191919]">Athlete email *</span>
                <input
                  required
                  type="email"
                  className="mt-1 w-full rounded-2xl border border-[#dcdcdc] px-3 py-3 text-sm"
                  value={fields.athlete_email}
                  onChange={(e) => setFields((prev) => ({ ...prev, athlete_email: e.target.value }))}
                  placeholder="athlete@email.com"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-[#191919]">Jersey number</span>
                <input
                  className="mt-1 w-full rounded-2xl border border-[#dcdcdc] px-3 py-3 text-sm"
                  value={fields.jersey_number}
                  onChange={(e) => setFields((prev) => ({ ...prev, jersey_number: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-[#b80f0a] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? 'Working...' : (tryout.registration_fee_cents ? `Continue to payment` : 'Register for tryout')}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
