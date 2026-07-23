'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

type FeePayload = {
  base_fee_range?: string
  transaction_fee?: number
  marketplace_fee?: number
}

export default function OrgBillingPage() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const redirectToApp = searchParams?.get('redirect') === 'app'
  const portalReturn = searchParams?.get('portal_return') === '1'

  useEffect(() => {
    if (portalReturn && redirectToApp) {
      window.location.assign('coacheshive://billing-updated')
    }
  }, [portalReturn, redirectToApp])

  const [fees, setFees] = useState<FeePayload>({})
  const [billingSettings, setBillingSettings] = useState({
    billing_contact: '',
    tax_id: '',
    billing_address: '',
    invoice_frequency: '',
    plan: 'standard',
  })
  const [coachCount, setCoachCount] = useState(0)
  const [additionalCoachCount, setAdditionalCoachCount] = useState(0)
  const [athleteCount, setAthleteCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [portalLoading, setPortalLoading] = useState(false)

  const handleOpenCustomerPortal = async () => {
    if (portalLoading) return
    setPortalLoading(true)
    try {
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(redirectToApp ? { return_url: '/org/billing?portal_return=1&redirect=app' } : {}),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.url) {
        setToast(data?.error || 'Unable to open billing portal.')
        return
      }
      if (redirectToApp) {
        window.location.href = data.url
      } else {
        window.open(data.url, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setPortalLoading(false)
    }
  }
  useEffect(() => {
    let active = true
    const loadBilling = async () => {
      setLoading(true)
      const feeResponse = await fetch('/api/org/fees')
      if (!active) return
      if (!feeResponse.ok) {
        setToast('Unable to load fee information — try refreshing.')
      } else {
        setFees(await feeResponse.json())
      }

      const settingsResponse = await fetch('/api/org/settings')
      if (!active) return
      if (!settingsResponse.ok) {
        setToast('Unable to load billing settings — try refreshing.')
      } else {
        const settingsPayload = await settingsResponse.json()
        setBillingSettings((prev) => ({
          ...prev,
          ...(settingsPayload.settings || {}),
        }))
      }

      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (!membership?.org_id) return
      const { data: members } = await supabase
        .from('organization_memberships')
        .select('role')
        .eq('org_id', membership.org_id)
      if (!active) return
      const membershipRows = (members || []) as Array<{ role?: string | null }>
      const coaches = membershipRows.filter((row) => ['coach', 'assistant_coach'].includes(String(row.role)))
      const athletes = membershipRows.filter((row) => String(row.role) === 'athlete')
      setCoachCount(coaches.length)
      setAthleteCount(athletes.length)
      const seatResponse = await fetch('/api/org/billing/coach-seats')
      if (seatResponse.ok) {
        const seatPayload = await seatResponse.json()
        setCoachCount(Number(seatPayload.activeCoachCount || 0))
        setAdditionalCoachCount(Number(seatPayload.additionalCoachCount || 0))
      }
      setLoading(false)
    }
    loadBilling()
    return () => {
      active = false
    }
  }, [supabase])

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        {redirectToApp && !portalReturn && (
          <div className="mb-4 rounded-2xl border border-[#191919] bg-[#191919] px-4 py-3 text-sm font-semibold text-white">
            Manage billing below — you'll return to the Coaches Hive app after updating.
          </div>
        )}
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Billing</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Track plan pricing, usage, and invoices.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-1">
          <div className="lg:hidden"><OrgSidebar /></div>
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              <div className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Base fee</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">$49</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">/ month or $490 / year</p>
              </div>
              <div className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coaches</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{loading ? '...' : coachCount}</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">
                  1 included · {additionalCoachCount} additional at $19/month or $190/year
                </p>
                <Link href="/org/billing/coach-seats" className="mt-3 inline-flex text-xs font-semibold text-[#b80f0a] underline">
                  Manage coach seats
                </Link>
              </div>
              <div className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athletes</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{loading ? '...' : athleteCount}</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">included in plan</p>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Payment method</h2>
              <p className="mt-2 text-sm text-[#4a4a4a]">Add a card for monthly billing and usage fees.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <p className="text-sm text-[#4a4a4a]">Your payment method is managed securely by Stripe.</p>
                <button
                  type="button"
                  onClick={handleOpenCustomerPortal}
                  disabled={portalLoading}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                >
                  {portalLoading ? 'Opening…' : 'Manage billing'}
                </button>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Compliance-ready billing</h2>
                  <p className="mt-2 text-sm text-[#4a4a4a]">Ensure billing contacts, tax IDs, and invoice settings are on file.</p>
                </div>
                <Link href="/org/settings" className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]">
                  Update billing profile
                </Link>
              </div>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Billing contact</p>
                  <p className="mt-1 font-semibold text-[#191919]">{billingSettings.billing_contact || 'Add billing contact'}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Invoice cadence</p>
                  <p className="mt-1 font-semibold text-[#191919]">{billingSettings.invoice_frequency || 'Monthly'}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Tax ID</p>
                  <p className="mt-1 font-semibold text-[#191919]">{billingSettings.tax_id || 'Add tax ID'}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Billing address</p>
                  <p className="mt-1 font-semibold text-[#191919]">{billingSettings.billing_address || 'Add billing address'}</p>
                </div>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Invoices</h2>
              <p className="mt-2 text-sm text-[#4a4a4a]">
                Your full invoice history is available in the Stripe billing portal, including past statements, upcoming charges, and downloadable PDFs.
              </p>
              <button
                type="button"
                onClick={handleOpenCustomerPortal}
                disabled={portalLoading}
                className="mt-4 rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
              >
                {portalLoading ? 'Opening…' : 'View invoices in billing portal'}
              </button>
            </section>
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
