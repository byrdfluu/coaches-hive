'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import StripeCheckoutForm from '@/components/StripeCheckoutForm'

type ProgramDetail = {
  id: string
  title: string
  description: string | null
  price_cents: number
  category: string
  sport: string | null
  seller: string
  coach_id: string | null
  org_id: string | null
}

const formatCurrency = (cents: number) =>
  cents === 0 ? 'Free' : `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`

const categoryLabel = (cat: string) =>
  cat.charAt(0).toUpperCase() + cat.slice(1)

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

export default function ProgramRegisterPage() {
  const supabase = createClientComponentClient()
  const params = useParams()
  const searchParams = useSearchParams()
  const programId = typeof params?.id === 'string' ? params.id : ''
  const redirectToApp = searchParams?.get('redirect') === 'app'

  const [program, setProgram] = useState<ProgramDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [clientSecret, setClientSecret] = useState('')
  const [paymentReady, setPaymentReady] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [registered, setRegistered] = useState(false)

  useEffect(() => {
    let active = true
    const checkAuth = async () => {
      const { data } = await supabase.auth.getUser()
      if (active) setIsSignedIn(Boolean(data.user))
      setAuthChecked(true)
    }
    void checkAuth()
    return () => { active = false }
  }, [supabase])

  useEffect(() => {
    if (!programId) return
    let active = true
    const loadProgram = async () => {
      setLoading(true)
      const response = await fetch(`/api/programs/${programId}`, { cache: 'no-store' })
      if (!active) return
      if (!response.ok) {
        setNotice('Program not found.')
        setLoading(false)
        return
      }
      const payload = await response.json().catch(() => ({}))
      setProgram((payload.program as ProgramDetail) || null)
      setLoading(false)
    }
    void loadProgram()
    return () => { active = false }
  }, [programId])

  useEffect(() => {
    if (!program || !isSignedIn || program.price_cents === 0) return
    let active = true
    const createIntent = async () => {
      setPaymentReady(false)
      const response = await fetch('/api/payments/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: program.price_cents,
          currency: 'usd',
          metadata: {
            productId: program.id,
            coachId: program.coach_id,
            orgId: program.org_id,
            category: program.category,
          },
        }),
      })
      const data = await response.json().catch(() => null)
      if (!active) return
      if (data?.clientSecret) {
        setClientSecret(data.clientSecret)
        setPaymentReady(true)
      } else {
        setNotice(data?.error || 'Unable to initialize payment. Try refreshing.')
      }
    }
    void createIntent()
    return () => { active = false }
  }, [program, isSignedIn])

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    setRegistering(true)
    setNotice('')
    let confirmed = false
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch('/api/marketplace/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_intent_id: paymentIntentId }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok && data?.order) {
        confirmed = true
        break
      }
      if (!response.ok && response.status !== 202) {
        setNotice(data?.error || 'Unable to verify the completed payment.')
        setRegistering(false)
        return
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1000))
    }

    setRegistering(false)
    if (!confirmed) {
      setNotice('Payment is still being confirmed. Check your orders in a moment.')
      return
    }
    setRegistered(true)
    if (redirectToApp) {
      window.location.assign('coacheshive://payment-complete?type=marketplace')
    }
  }

  const handleFreeRegister = async () => {
    if (!program) return
    setRegistering(true)
    setNotice('')
    const response = await fetch('/api/marketplace/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: program.id, amount: 0 }),
    })
    setRegistering(false)
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      setNotice(data?.error || 'Unable to complete registration. Please try again.')
      return
    }
    setRegistered(true)
    setToast('Registered!')
    if (redirectToApp) {
      window.location.assign('coacheshive://payment-complete?type=marketplace')
    }
  }

  if (!authChecked || loading) {
    return (
      <main className="page-shell public-page">
        <div className="mx-auto max-w-2xl px-4 py-16">
          <LoadingState label="Loading program..." />
        </div>
      </main>
    )
  }

  if (!program) {
    return (
      <main className="page-shell public-page">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-sm text-[#4a4a4a]">Program not found.</p>
          <Link href="/programs" className="mt-4 inline-block text-sm font-semibold text-[#191919] underline">Browse programs</Link>
        </div>
      </main>
    )
  }

  if (!isSignedIn) {
    return (
      <main className="page-shell public-page">
        <div className="mx-auto max-w-2xl px-4 py-16">
          <div className="glass-card border border-[#191919] bg-white p-8 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Coaches Hive</p>
            <h1 className="mt-4 text-2xl font-semibold text-[#191919]">{program.title}</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Sign in to register for this {categoryLabel(program.category).toLowerCase()}.</p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                href={`/login?redirect=/programs/${program.id}/register${redirectToApp ? '?redirect=app' : ''}`}
                className="rounded-full bg-[#b80f0a] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition"
              >
                Sign in
              </Link>
              <Link
                href={`/signup?redirect=/programs/${program.id}/register${redirectToApp ? '?redirect=app' : ''}`}
                className="rounded-full border border-[#191919] px-6 py-3 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition"
              >
                Create account
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (registered && !redirectToApp) {
    return (
      <main className="page-shell public-page">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <div className="glass-card border border-[#191919] bg-white p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-600">Registered</p>
            <h1 className="mt-4 text-2xl font-semibold text-[#191919]">You're registered!</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Your registration for <strong>{program.title}</strong> is confirmed.</p>
            <Link
              href="/athlete/marketplace/orders"
              className="mt-6 inline-block rounded-full bg-[#191919] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition"
            >
              View your orders →
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell public-page">
      <div className="relative z-10 mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        {redirectToApp && (
          <div className="mb-4 rounded-2xl border border-[#191919] bg-[#191919] px-4 py-3 text-sm font-semibold text-white">
            Complete your registration below — you'll return to the Coaches Hive app automatically.
          </div>
        )}

        <header className="mb-6">
          <Link href={`/programs${redirectToApp ? '?redirect=app' : ''}`} className="text-xs font-semibold text-[#4a4a4a] hover:text-[#191919]">
            ← All programs
          </Link>
        </header>

        <div className="glass-card border border-[#191919] bg-white p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[#e0e0e0] bg-[#f7f7f7] px-3 py-1 text-xs font-semibold text-[#4a4a4a]">
              {categoryLabel(program.category)}
            </span>
            {program.sport && (
              <span className="text-xs text-[#9a9a9a]">{program.sport}</span>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-[#191919]">{program.title}</h1>
          <p className="mt-1 text-xs text-[#4a4a4a]">By {program.seller}</p>
          {program.description && (
            <p className="mt-4 text-sm text-[#4a4a4a]">{program.description}</p>
          )}

          <div className="mt-6 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[#4a4a4a]">Registration fee</span>
              <span className="font-semibold text-[#191919]">{formatCurrency(program.price_cents)}</span>
            </div>
          </div>

          {notice && <p className="mt-3 text-xs text-[#b80f0a]">{notice}</p>}

          <div className="mt-6">
            {program.price_cents === 0 ? (
              <button
                type="button"
                onClick={() => void handleFreeRegister()}
                disabled={registering}
                className="w-full rounded-full bg-[#b80f0a] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
              >
                {registering ? 'Registering…' : 'Register free →'}
              </button>
            ) : !stripePromise ? (
              <p className="text-xs text-[#4a4a4a]">Stripe key missing. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.</p>
            ) : paymentReady && clientSecret ? (
              <div>
                <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Payment</p>
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <StripeCheckoutForm onSuccess={handlePaymentSuccess} clientSecret={clientSecret} />
                </Elements>
                {registering && <p className="mt-2 text-xs text-[#4a4a4a]">Confirming registration…</p>}
              </div>
            ) : (
              <p className="text-xs text-[#4a4a4a]">Preparing secure checkout…</p>
            )}
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
