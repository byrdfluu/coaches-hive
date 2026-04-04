'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import CoachSidebar from '@/components/CoachSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'

export default function CoachStripeSetup() {
  const searchParams = useSearchParams()
  const stripeParam = searchParams?.get('stripe')

  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  // Handle return from Stripe onboarding — verify the account was saved,
  // then hard-navigate so the dashboard re-fetches profile data and clears the banner
  useEffect(() => {
    if (stripeParam !== 'success' && stripeParam !== 'verify') return

    let cancelled = false
    const runVerify = async () => {
      setVerifying(true)
      setError('')
      try {
        const res = await fetch('/api/stripe/connect/verify')
        const payload = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || !payload) {
          setVerifying(false)
          setError('Could not verify your Stripe connection. Please try again or contact support.')
          return
        }
        if (!payload.connected) {
          setVerifying(false)
          setError(
            'Your Stripe account was not detected. Please complete onboarding below or contact support if you believe this is an error.',
          )
          return
        }
        // Verified — send them to the dashboard
        window.location.replace('/coach/dashboard')
      } catch {
        if (cancelled) return
        setVerifying(false)
        setError('Could not verify your Stripe connection. Please try again or contact support.')
      }
    }

    runVerify()
    return () => {
      cancelled = true
    }
  }, [stripeParam])

  const handleConnect = async () => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/stripe/connect', { method: 'POST' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.url) {
        setError(payload?.error || 'Unable to start Stripe onboarding. Please try again.')
        setLoading(false)
        return
      }
      window.location.href = payload.url
    } catch {
      setError('Unable to start Stripe onboarding. Please try again.')
      setLoading(false)
    }
  }

  const isRefresh = stripeParam === 'refresh'

  if (verifying) {
    return (
      <main className="page-shell">
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
          <RoleInfoBanner role="coach" />
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
            <CoachSidebar />
            <div className="max-w-lg space-y-6">
              <div className="rounded-2xl border border-[#dcdcdc] bg-white p-6">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Please wait</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Verifying connection…</h1>
                <p className="mt-2 text-sm text-[#4a4a4a]">
                  Confirming your Stripe account is linked. You&apos;ll be redirected in a moment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="max-w-lg space-y-6">
            <div>
              <Link
                href="/coach/dashboard"
                className="text-xs font-semibold text-[#4a4a4a] hover:text-[#191919] transition-colors"
              >
                ← Back to Dashboard
              </Link>
            </div>

            <div className="rounded-2xl border border-[#dcdcdc] bg-white p-6">
              {isRefresh ? (
                <>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Setup incomplete</p>
                  <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Finish connecting Stripe</h1>
                  <p className="mt-2 text-sm text-[#4a4a4a]">
                    Your Stripe setup wasn&apos;t completed. Click below to pick up where you left off.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Payments</p>
                  <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Connect Stripe</h1>
                  <p className="mt-2 text-sm text-[#4a4a4a]">
                    Link your Stripe account to start receiving payments from athletes and clients.
                  </p>
                </>
              )}

              <ul className="mt-5 space-y-2 text-sm text-[#191919]">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border border-[#191919] text-[10px] font-bold flex items-center justify-center">✓</span>
                  Instant payouts directly to your bank account
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border border-[#191919] text-[10px] font-bold flex items-center justify-center">✓</span>
                  Manage billing and invoices from your dashboard
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border border-[#191919] text-[10px] font-bold flex items-center justify-center">✓</span>
                  Secure, Stripe-hosted onboarding — no card data touches our servers
                </li>
              </ul>

              {error && (
                <p className="mt-4 rounded-lg border border-[#f5c2c2] bg-[#fff5f5] px-3 py-2 text-xs text-[#b80f0a]">
                  {error}
                </p>
              )}

              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={loading}
                  className="rounded-full bg-[#191919] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-60"
                >
                  {loading ? 'Redirecting to Stripe...' : isRefresh ? 'Resume setup →' : 'Connect with Stripe →'}
                </button>
              </div>

              <p className="mt-4 text-xs text-[#4a4a4a]">
                You&apos;ll be redirected to Stripe to complete onboarding, then brought back here automatically.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
