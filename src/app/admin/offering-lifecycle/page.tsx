'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'

type OrganizationAttention = { id: string; name: string; active_offerings: number; inactive_offerings: number; expired_active: number; missing_future_dates: number; pending_refunds: number; payment_attention: number }
type Snapshot = Record<string, any> & { organizations?: OrganizationAttention[] }
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100)

export default function OfferingLifecycleMetricsPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const response = await fetch('/api/admin/offering-operations', { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) setSnapshot(payload.snapshot || {})
    else setError(response.status === 403 ? 'You do not have access to private offering lifecycle metrics.' : payload.error || 'Unable to load offering lifecycle metrics.')
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  const metrics: Array<[string,string|number]> = snapshot ? [
    ['Active offerings',snapshot.active_offerings],['Inactive offerings',snapshot.inactive_offerings],['Draft offerings',snapshot.draft_offerings],['Cancelled offerings',snapshot.cancelled_offerings],['Ended offerings',snapshot.ended_offerings],
    ['Expired offerings left active',snapshot.expired_active_offerings],['Active without future dates',snapshot.active_without_future_dates],['Active memberships',snapshot.active_subscriptions],['Scheduled cancellations',snapshot.cancellation_scheduled],
    ['Payment exceptions',snapshot.subscription_payment_attention],['Pending refunds',snapshot.pending_refunds],['Completed refunds',snapshot.completed_refunds],['Refunded total',money(snapshot.refunded_cents)],
    ['Refund adjustments needing review',snapshot.refund_adjustments_requiring_review],['Outstanding credit liability',snapshot.credits_outstanding ?? 'Partial data'],['Credits expiring within 30 days',snapshot.credits_expiring_30_days ?? 'Partial data'],
    ['Pending push deliveries',snapshot.notification_pending],['Failed push deliveries',snapshot.notification_failed],['Legacy migration exceptions',snapshot.legacy_migration_exceptions],['Legacy awaiting verification',snapshot.legacy_awaiting_verification],
  ] : []
  return <main className="page-shell"><div className="relative z-10 px-6 py-10"><div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]"><AdminSidebar/><div className="min-w-0 space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[.24em] text-[#b80f0a]">Private operations</p><h1 className="text-3xl font-black">Offering Lifecycle Metrics</h1><p className="mt-2 text-sm text-[#666]">Platform-wide canonical offering, subscription, refund, credit, delivery, and migration health.</p></header>
    {loading?<div className="rounded-3xl border bg-white p-6">Loading lifecycle metrics…</div>:null}
    {error?<div className="rounded-3xl border border-red-200 bg-red-50 p-6"><p>{error}</p><button onClick={()=>void load()} className="mt-3 rounded-full border px-4 py-2 font-semibold">Retry</button></div>:null}
    {snapshot?<><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label,value])=><div key={label} className="rounded-2xl border bg-white p-4"><p className="text-xs uppercase tracking-wide text-[#666]">{label}</p><p className="mt-2 text-2xl font-semibold">{value ?? 0}</p></div>)}</section>
    <section className="rounded-3xl border bg-white p-5"><h2 className="text-xl font-bold">Organizations needing attention</h2>{snapshot.organizations?.length?<div className="mt-3 space-y-2">{snapshot.organizations.map(org=>{const issues=Number(org.expired_active||0)+Number(org.missing_future_dates||0)+Number(org.pending_refunds||0)+Number(org.payment_attention||0);return <Link key={org.id} href={`/admin/orgs/${org.id}?section=offerings`} className="grid gap-2 rounded-xl border p-4 sm:grid-cols-[1fr_auto]"><div><p className="font-semibold">{org.name}</p><p className="text-sm text-[#666]">Expired active {org.expired_active||0} · Missing dates {org.missing_future_dates||0} · Refunds {org.pending_refunds||0} · Payment {org.payment_attention||0}</p></div><strong>{issues} issues</strong></Link>})}</div>:<p className="mt-3 text-sm text-[#666]">No organizations currently need offering lifecycle attention.</p>}</section></>:null}
  </div></div></div></main>
}
