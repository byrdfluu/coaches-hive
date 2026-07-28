'use client'

import { useEffect, useState } from 'react'
import type { BillingInfoSnapshot, BillingRole } from '@/lib/subscriptionLifecycle'

type Props = {
  billingInfo: BillingInfoSnapshot
  billingRole: BillingRole
  portalReturn: boolean
  redirectToApp: boolean
}

const roleLabel: Record<BillingRole, string> = {
  athlete: 'Athlete',
  coach: 'Coach',
  org: 'Organization',
}

const formatDate = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

const formatMoney = (cents?: number | null, currency = 'usd') => {
  if (cents === null || cents === undefined) return null
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

export default function AccountBillingPanel({
  billingInfo,
  billingRole,
  portalReturn,
  redirectToApp,
}: Props) {
  const [status, setStatus] = useState(billingInfo.status || '')
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(Boolean(billingInfo.cancel_at_period_end))
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(billingInfo.current_period_end)
  const [loadingPortal, setLoadingPortal] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (portalReturn && redirectToApp) {
      window.location.assign('coacheshive://billing-updated')
    }
  }, [portalReturn, redirectToApp])

  const openPortal = async () => {
    if (loadingPortal) return
    setLoadingPortal(true)
    setError('')
    setMessage('')
    try {
      const returnUrl = redirectToApp
        ? '/account/billing?portal_return=1&redirect=app'
        : '/account/billing?portal_return=1'
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_url: returnUrl }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.url) {
        setError(payload?.error || 'Unable to open billing portal.')
        return
      }
      window.location.assign(payload.url)
    } finally {
      setLoadingPortal(false)
    }
  }

  const cancelAtCycleEnd = async () => {
    if (canceling || cancelAtPeriodEnd) return
    setCanceling(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/account/subscription/cancel', { method: 'POST' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(payload?.error || 'Unable to schedule cancellation.')
        return
      }
      setCancelAtPeriodEnd(Boolean(payload?.cancel_at_period_end))
      setCurrentPeriodEnd(payload?.current_period_end || currentPeriodEnd)
      if (payload?.current_period_end) setStatus((prev) => prev || 'active')
      setMessage('Your subscription is scheduled to cancel at the end of the current billing period.')
    } finally {
      setCanceling(false)
    }
  }

  const periodEndLabel = formatDate(currentPeriodEnd)
  const trialEndLabel = formatDate(billingInfo.trial_end)
  const hasSubscription = Boolean(status)

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#b80f0a]">Account billing</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#191919]">Manage subscription</h1>
        <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">
          Manage or cancel existing Coaches Hive web subscriptions through Stripe. New subscription purchases are not started from this page.
        </p>

        {portalReturn ? (
          <div className="mt-6 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919]">
            Billing portal closed. Your account can take a moment to reflect Stripe changes.
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border border-[#191919] bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">Account type</p>
              <p className="mt-1 text-lg font-semibold text-[#191919]">{roleLabel[billingRole]}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">Status</p>
              <p className="mt-1 text-lg font-semibold capitalize text-[#191919]">{status || 'No active subscription found'}</p>
            </div>
            {billingInfo.tier ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">Plan</p>
                <p className="mt-1 text-lg font-semibold text-[#191919]">All Access</p>
              </div>
            ) : null}
            {billingInfo.billing_interval ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">Billing</p>
                <p className="mt-1 text-lg font-semibold capitalize text-[#191919]">
                  {billingInfo.billing_interval}ly
                  {formatMoney(billingInfo.renewal_amount_cents, billingInfo.currency || 'usd')
                    ? ` · ${formatMoney(billingInfo.renewal_amount_cents, billingInfo.currency || 'usd')}`
                    : ''}
                </p>
              </div>
            ) : null}
            {periodEndLabel ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">
                  {cancelAtPeriodEnd ? 'Access ends' : 'Current period ends'}
                </p>
                <p className="mt-1 text-lg font-semibold text-[#191919]">{periodEndLabel}</p>
              </div>
            ) : null}
            {trialEndLabel ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">Trial ends</p>
                <p className="mt-1 text-lg font-semibold text-[#191919]">{trialEndLabel}</p>
              </div>
            ) : null}
          </div>

          {cancelAtPeriodEnd ? (
            <div className="mt-5 rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-sm text-[#191919]">
              Cancellation is already scheduled. Access continues through the current billing period.
            </div>
          ) : null}

          {!hasSubscription ? (
            <div className="mt-5 rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-sm text-[#191919]">
              No active subscription found.
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openPortal}
                disabled={loadingPortal}
                className="rounded-full bg-[#191919] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-60"
              >
                {loadingPortal ? 'Opening...' : 'Open Stripe billing portal'}
              </button>
              <button
                type="button"
                onClick={cancelAtCycleEnd}
                disabled={canceling || cancelAtPeriodEnd}
                className="rounded-full border border-[#191919] px-5 py-3 text-sm font-semibold text-[#191919] transition hover:bg-[#191919] hover:text-white disabled:opacity-60"
              >
                {canceling ? 'Scheduling...' : cancelAtPeriodEnd ? 'Cancellation scheduled' : 'Cancel at period end'}
              </button>
            </div>
          )}

          {message ? <p className="mt-4 text-sm text-[#191919]">{message}</p> : null}
          {error ? <p className="mt-4 text-sm text-[#b80f0a]">{error}</p> : null}
        </section>

      </div>
    </main>
  )
}
