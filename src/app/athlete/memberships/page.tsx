'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AthleteSidebar from '@/components/AthleteSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type AthleteMembership = {
  id: string
  plan_name: string
  plan_description?: string | null
  coach_id: string
  coach_name: string
  coach_email?: string | null
  status: string
  is_active: boolean
  needs_attention: boolean
  current_period_start?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean
  canceled_at?: string | null
  price_cents: number
  currency: string
  billing_interval: string
  included_sessions: number
  member_only_access: boolean
  credit_total: number
  credit_used: number
  credit_remaining: number
  created_at?: string | null
}

type MembershipMetrics = {
  active_memberships: number
  total_memberships: number
  remaining_credits: number
  used_credits: number
  needs_attention: number
}

const formatCurrency = (cents: number, currency = 'usd') => {
  const amount = Number(cents || 0) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const statusClasses = (status: string) => {
  const normalized = status.toLowerCase()
  if (normalized === 'active' || normalized === 'trialing') return 'border-[#1f7a3f] text-[#1f7a3f]'
  if (normalized === 'past_due' || normalized === 'unpaid') return 'border-[#b80f0a] text-[#b80f0a]'
  return 'border-[#6b5f55] text-[#6b5f55]'
}

export default function AthleteMembershipsPage() {
  const [memberships, setMemberships] = useState<AthleteMembership[]>([])
  const [metrics, setMetrics] = useState<MembershipMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [portalLoading, setPortalLoading] = useState(false)

  const loadMemberships = useCallback(async () => {
    setLoading(true)
    setNotice('')
    const response = await fetch('/api/athlete/coach-memberships', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload) {
      setNotice(payload?.error || 'Unable to load memberships.')
      setLoading(false)
      return
    }
    setMemberships((payload.memberships || []) as AthleteMembership[])
    setMetrics((payload.metrics || null) as MembershipMetrics | null)
    setNotice(payload.setup_required ? 'Membership tables are not configured yet.' : '')
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadMemberships()
  }, [loadMemberships])

  const activeMemberships = useMemo(
    () => memberships.filter((membership) => membership.is_active),
    [memberships],
  )
  const attentionMemberships = useMemo(
    () => memberships.filter((membership) => membership.needs_attention),
    [memberships],
  )

  const openBillingPortal = async () => {
    setNotice('')
    setPortalLoading(true)
    const response = await fetch('/api/stripe/customer-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo: '/athlete/memberships' }),
    })
    const payload = await response.json().catch(() => null)
    setPortalLoading(false)
    if (!response.ok || !payload?.url) {
      setNotice(payload?.error || 'Unable to open billing portal.')
      return
    }
    window.location.href = payload.url
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Memberships</p>
                  <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Coach memberships</h1>
                  <p className="mt-2 max-w-2xl text-sm text-[#4a4a4a]">
                    Track active monthly plans, remaining session credits, renewal dates, and billing status.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openBillingPortal}
                  disabled={portalLoading || memberships.length === 0}
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {portalLoading ? 'Opening...' : 'Manage billing'}
                </button>
              </div>
              {notice ? <p className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#4a4a4a]">{notice}</p> : null}
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Active" value={loading ? '—' : String(metrics?.active_memberships || 0)} detail={`${metrics?.total_memberships || 0} total`} />
              <MetricCard label="Credits left" value={loading ? '—' : String(metrics?.remaining_credits || 0)} detail={`${metrics?.used_credits || 0} used`} />
              <MetricCard label="Needs attention" value={loading ? '—' : String(metrics?.needs_attention || 0)} detail="billing or cancellation" />
              <MetricCard
                label="Next renewal"
                value={loading ? '—' : formatDate(activeMemberships[0]?.current_period_end)}
                detail="soonest active plan"
              />
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Active memberships</h2>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Available credits and upcoming renewal dates.</p>
                </div>
                <Link href="/athlete/marketplace" className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                  Browse plans
                </Link>
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {loading ? (
                  <LoadingState label="Loading memberships..." />
                ) : activeMemberships.length === 0 ? (
                  <div className="xl:col-span-2">
                    <EmptyState title="No active coach memberships." description="Subscribe to a coach membership from the marketplace or a coach profile." />
                  </div>
                ) : (
                  activeMemberships.map((membership) => (
                    <MembershipCard key={membership.id} membership={membership} onManage={openBillingPortal} portalLoading={portalLoading} />
                  ))
                )}
              </div>
            </section>

            {attentionMemberships.length > 0 ? (
              <section className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#191919]">Cancellations / billing status</h2>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {attentionMemberships.map((membership) => (
                    <MembershipCard key={membership.id} membership={membership} onManage={openBillingPortal} portalLoading={portalLoading} compact />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-[#191919] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#191919]">{value}</p>
      <p className="mt-1 text-xs text-[#4a4a4a]">{detail}</p>
    </article>
  )
}

function MembershipCard({
  membership,
  onManage,
  portalLoading,
  compact = false,
}: {
  membership: AthleteMembership
  onManage: () => void
  portalLoading: boolean
  compact?: boolean
}) {
  const renewalLabel = membership.cancel_at_period_end ? 'Access ends' : 'Renews'
  return (
    <article className="flex h-full flex-col rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[#4a4a4a]">Coach: {membership.coach_name}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#191919]">{membership.plan_name}</h3>
          {membership.plan_description && !compact ? (
            <p className="mt-2 text-xs leading-5 text-[#4a4a4a]">
              {membership.plan_description.length > 140 ? `${membership.plan_description.slice(0, 140)}...` : membership.plan_description}
            </p>
          ) : null}
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold capitalize ${statusClasses(membership.status)}`}>
          {membership.cancel_at_period_end ? 'canceling' : membership.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-[#4a4a4a] sm:grid-cols-3">
        <span className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2">
          Credits {membership.credit_remaining}/{membership.credit_total}
        </span>
        <span className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2">
          {renewalLabel} {formatDate(membership.current_period_end)}
        </span>
        <span className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2">
          {formatCurrency(membership.price_cents, membership.currency)} / {membership.billing_interval}
        </span>
      </div>

      {membership.member_only_access ? (
        <p className="mt-3 text-xs font-semibold text-[#191919]">Member-only booking access included.</p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Link
          href="/athlete/calendar"
          className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
        >
          Open calendar
        </Link>
        <button
          type="button"
          onClick={onManage}
          disabled={portalLoading}
          className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {portalLoading ? 'Opening...' : 'Cancel / manage'}
        </button>
      </div>
    </article>
  )
}
