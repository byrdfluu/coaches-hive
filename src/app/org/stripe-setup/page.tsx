'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import OrgSidebar from '@/components/OrgSidebar'

type StripeStatus = {
  connected: boolean
  charges_enabled: boolean
  payouts_enabled: boolean
  currently_due: string[]
  eventually_due: string[]
  disabled_reason: string | null
  stripe_account_id: string | null
}

const formatRequirement = (req: string) =>
  req
    .replace(/_/g, ' ')
    .replace(/\./g, ' › ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

export default function OrgStripeSetup() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const stripeParam = searchParams?.get('stripe')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<StripeStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  useEffect(() => {
    if (stripeParam === 'success') {
      router.replace('/org')
    }
  }, [stripeParam, router])

  useEffect(() => {
    fetch('/api/org/stripe/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setStatus(data) })
      .finally(() => setStatusLoading(false))
  }, [])

  const handleConnect = async () => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/org/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
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
  const isVerified = status?.charges_enabled === true

  return (
    <main className="page-shell">
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
        <OrgSidebar />
        <div className="max-w-lg space-y-6">
          <div>
            <Link
              href="/org"
              className="text-xs font-semibold text-[#4a4a4a] hover:text-[#191919] transition-colors"
            >
              ← Back to Dashboard
            </Link>
          </div>

          {/* Verified badge */}
          {!statusLoading && isVerified && (
            <div className="flex items-center gap-2 rounded-xl border border-[#c8e6c9] bg-[#f1f8f1] px-4 py-3">
              <span className="text-base">✓</span>
              <div>
                <p className="text-sm font-semibold text-[#2e7d32]">Stripe account verified</p>
                <p className="text-xs text-[#4a4a4a]">Payments and payouts are enabled for your organization.</p>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[#dcdcdc] bg-white p-6">
            {isRefresh ? (
              <>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Setup incomplete</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Finish connecting Stripe</h1>
                <p className="mt-2 text-sm text-[#4a4a4a]">
                  Your Stripe setup wasn&apos;t completed. Click below to pick up where you left off.
                </p>
              </>
            ) : isVerified ? (
              <>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Payments</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Stripe account</h1>
                <p className="mt-2 text-sm text-[#4a4a4a]">
                  Your Stripe account is active. You can update your payout settings directly in Stripe.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Payments</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Connect Stripe</h1>
                <p className="mt-2 text-sm text-[#4a4a4a]">
                  Link your Stripe account to start receiving payments from athletes and teams.
                </p>
              </>
            )}

            {/* Requirements checklist */}
            {!statusLoading && status && !isVerified && status.currently_due && status.currently_due.length > 0 && (
              <div className="mt-5 rounded-xl border border-[#f5e6c8] bg-[#fffbf2] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b06000]">Action required</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">Complete these steps in Stripe to activate your account:</p>
                <ul className="mt-3 space-y-1.5">
                  {status.currently_due.map((req) => (
                    <li key={req} className="flex items-start gap-2 text-xs text-[#191919]">
                      <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border border-[#b06000] text-[9px] font-bold flex items-center justify-center text-[#b06000]">!</span>
                      {formatRequirement(req)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!isVerified && (
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
            )}

            {error && (
              <p className="mt-4 rounded-lg border border-[#f5c2c2] bg-[#fff5f5] px-3 py-2 text-xs text-[#b80f0a]">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleConnect}
                disabled={loading}
                className="rounded-full bg-[#191919] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-60"
              >
                {loading ? 'Redirecting to Stripe...' : isRefresh ? 'Resume setup →' : isVerified ? 'Update Stripe settings →' : 'Connect with Stripe →'}
              </button>
            </div>

            <p className="mt-4 text-xs text-[#4a4a4a]">
              You&apos;ll be redirected to Stripe to complete onboarding, then brought back here automatically.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
