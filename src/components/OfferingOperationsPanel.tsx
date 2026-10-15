'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type Snapshot = Record<string, number>
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100)

export default function OfferingOperationsPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const response = await fetch('/api/org/reports/offering-operations', { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) setSnapshot(payload.snapshot || {})
    else setError(payload.error || 'Unable to load offering operations.')
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])
  if (loading) return <section className="mt-6 rounded-3xl border bg-white p-6">Loading offering operations…</section>
  if (error) return <section className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-6"><p>{error}</p><button onClick={()=>void load()} className="mt-3 rounded-full border px-4 py-2 font-semibold">Retry</button></section>
  if (!snapshot) return null
  const metrics: Array<[string,string|number]> = [
    ['Active offerings',snapshot.active_offerings],['Inactive offerings',snapshot.inactive_offerings],['Draft offerings',snapshot.draft_offerings],['Ended offerings',snapshot.ended_offerings],
    ['Recurring monthly offerings',snapshot.recurring_offerings],['Upcoming dates',snapshot.upcoming_occurrences],['Active memberships',snapshot.active_subscriptions],['Memberships ending at renewal',snapshot.cancellation_scheduled],
    ['Payment attention',snapshot.subscription_payment_attention],['Pending refunds',snapshot.pending_refunds],['Completed refunds',snapshot.completed_refunds],['Refunded total',money(snapshot.refunded_cents)],
    ['Outstanding credit liability',snapshot.credits_outstanding],['Credits expiring within 30 days',snapshot.credits_expiring_30_days],['Legacy migration exceptions',snapshot.legacy_migration_exceptions],
  ]
  const attention = [
    ['Expired offerings left active',snapshot.expired_active_offerings,'/org/offerings?status=active&attention=expired'],
    ['Active offerings without future dates',snapshot.active_without_future_dates,'/org/offerings?status=active&attention=missing-dates'],
    ['Pending refund requests',snapshot.pending_refunds,'/org/refunds?status=pending'],
    ['Subscription payment exceptions',snapshot.subscription_payment_attention,'/org/payments?status=attention'],
    ['Legacy migration exceptions',snapshot.legacy_migration_exceptions,'/org/training-migration?status=exception'],
  ] as const
  return <section className="mt-6 space-y-4" aria-label="Offering operations">
    <div><h2 className="text-2xl font-semibold">Offering operations</h2><p className="text-sm text-[#666]">Authoritative lifecycle, subscriptions, refunds, and credit metrics.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label,value])=><div key={label} className="rounded-2xl border bg-white p-4"><p className="text-xs uppercase tracking-wide text-[#666]">{label}</p><p className="mt-2 text-2xl font-semibold">{value ?? 0}</p></div>)}</div>
    <div className="rounded-3xl border bg-white p-5"><h3 className="text-xl font-semibold">Needs Attention</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{attention.filter(([,count])=>Number(count)>0).map(([label,count,href])=><Link key={label} href={href} className="flex justify-between rounded-xl border border-amber-200 bg-amber-50 p-3 font-semibold"><span>{label}</span><span>{count}</span></Link>)}</div>{attention.every(([,count])=>Number(count)===0)?<p className="mt-3 text-sm text-[#666]">No offering lifecycle issues need attention.</p>:null}</div>
  </section>
}
