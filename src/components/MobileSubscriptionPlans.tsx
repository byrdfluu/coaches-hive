'use client'

import { useState } from 'react'
import { ORGANIZATION_AGREEMENT_VERSION } from '@/lib/legalAgreements'

type Plan = { tier: string; label: string; billingInterval: 'month' | 'year' }

export default function MobileSubscriptionPlans({ token, plans, organizationCheckout = false }: { token: string; plans: Plan[]; organizationCheckout?: boolean }) {
  const [loadingTier, setLoadingTier] = useState('')
  const [error, setError] = useState('')
  const [authorityAccepted, setAuthorityAccepted] = useState(false)
  const [recurringBillingAccepted, setRecurringBillingAccepted] = useState(false)
  const [minorDataAccepted, setMinorDataAccepted] = useState(false)

  const start = async (tier: string, billingInterval: 'month' | 'year') => {
    if (organizationCheckout && (!authorityAccepted || !recurringBillingAccepted || !minorDataAccepted)) {
      setError('Review and accept all organization and billing confirmations to continue.')
      return
    }
    setLoadingTier(billingInterval)
    setError('')
    const response = await fetch('/api/stripe/mobile-onboarding-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, tier, billingInterval, organizationConsent: organizationCheckout ? { authorityAccepted, recurringBillingAccepted, minorDataAccepted, displayedAgreementVersion: ORGANIZATION_AGREEMENT_VERSION } : undefined }),
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
        {organizationCheckout ? <div className="mt-5 space-y-3 rounded-2xl border border-[#dedede] p-4 text-sm">
          <label className="flex items-start gap-3"><input className="mt-1 accent-[#b80f0a]" type="checkbox" checked={authorityAccepted} onChange={e => setAuthorityAccepted(e.target.checked)}/><span>I am authorized to act for this organization and agree to the <a className="text-[#b80f0a] underline" href="/organization-terms" target="_blank">Organization Terms</a>, <a className="text-[#b80f0a] underline" href="/data-processing-addendum" target="_blank">Data Processing Addendum</a>, <a className="text-[#b80f0a] underline" href="/safety" target="_blank">Acceptable Use Policy</a>, and <a className="text-[#b80f0a] underline" href="/payment-terms" target="_blank">Payment Services Terms</a>, and acknowledge the <a className="text-[#b80f0a] underline" href="/privacy" target="_blank">Privacy Policy</a>.</span></label>
          <label className="flex items-start gap-3"><input className="mt-1 accent-[#b80f0a]" type="checkbox" checked={recurringBillingAccepted} onChange={e => setRecurringBillingAccepted(e.target.checked)}/><span>I authorize the recurring price shown for the selected plan after any displayed trial. It renews automatically until canceled online and cancellation takes effect at the end of the billing period.</span></label>
          <label className="flex items-start gap-3"><input className="mt-1 accent-[#b80f0a]" type="checkbox" checked={minorDataAccepted} onChange={e => setMinorDataAccepted(e.target.checked)}/><span>The organization is responsible for required notices, permissions, and guardian consents before submitting minor information.</span></label>
        </div> : null}
        <div className="mt-6 grid gap-3">
          {plans.map((plan) => (
            <button key={`${plan.tier}:${plan.billingInterval}`} type="button" disabled={Boolean(loadingTier) || (organizationCheckout && (!authorityAccepted || !recurringBillingAccepted || !minorDataAccepted))} onClick={() => start(plan.tier, plan.billingInterval)}
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
