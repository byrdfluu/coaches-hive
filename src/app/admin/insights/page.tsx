'use client'

import { useEffect, useMemo, useState } from 'react'

const money = (cents: unknown) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100)
const metricConfig = [
  ['platform_fees', 'Coaches Hive revenue (monthly)', 'coaches_hive_revenue_cents', true],
  ['gross_volume', 'Gross payment volume', 'gross_volume_cents', true],
  ['platform_fees', 'Platform-fee revenue', 'platform_fee_cents', true],
  ['seller_net', 'Seller net', 'seller_net_cents', true],
  ['refunds', 'Confirmed refunds', 'refunded_amount_cents', true],
  ['mrr', 'MRR', 'mrr_cents', true], ['arr', 'ARR', 'arr_cents', true],
  ['active_subscriptions', 'Active subscriptions', 'active_subscriptions', false],
  ['trials', 'Active trials', 'trials', false], ['past_due', 'Past due', 'past_due', false],
  ['canceled_30d', 'Canceled (30 days)', 'canceled_30d', false],
  ['accounts', 'Accounts', 'accounts', false], ['workspaces', 'Workspaces', 'workspaces', false],
  ['active_subscriptions', 'Paid accounts', 'paid_accounts', false],
] as const

export default function InsightsPage() {
  const [data, setData] = useState<any>(null), [loading, setLoading] = useState(true), [metric, setMetric] = useState('gross_volume')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const query = useMemo(() => new URLSearchParams({ metric, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }).toString(), [metric, filters])
  useEffect(() => { setLoading(true); fetch(`/api/admin/insights?${query}`, { cache: 'no-store' }).then(r => r.json()).then(setData).finally(() => setLoading(false)) }, [query])
  const set = (key: string, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  return <div className="space-y-6">
    <div><p className="text-xs font-bold uppercase tracking-[.24em] text-[#b80f0a]">Superadmin</p><h1 className="text-3xl font-bold">Insights</h1><p className="text-sm text-neutral-600">Gross seller volume is reported separately from Coaches Hive revenue. Revenue is platform fees plus subscription revenue.</p></div>
    <div className="grid gap-3 rounded-3xl border bg-white p-4 md:grid-cols-4">
      <input type="date" aria-label="From date" className="rounded-xl border p-2" onChange={e => set('from', e.target.value)} />
      <input type="date" aria-label="To date" className="rounded-xl border p-2" onChange={e => set('to', e.target.value)} />
      <input placeholder="Workspace ID" className="rounded-xl border p-2" onChange={e => set('workspace_id', e.target.value)} />
      <select className="rounded-xl border p-2" onChange={e => set('workspace_type', e.target.value)}><option value="">All workspace types</option><option value="organization">Organization</option><option value="independent_coach">Independent coach</option></select>
      <input placeholder="PaymentIntent ID" className="rounded-xl border p-2" onChange={e => set('payment_intent_id', e.target.value)} />
      <input placeholder="Checkout Session ID" className="rounded-xl border p-2" onChange={e => set('checkout_session_id', e.target.value)} />
      <input placeholder="Stripe customer/subscription ID" className="rounded-xl border p-2" onChange={e => { set('stripe_customer_id', e.target.value); set('stripe_subscription_id', e.target.value) }} />
      <select className="rounded-xl border p-2" onChange={e => set('subscription_status', e.target.value)}><option value="">All subscription statuses</option>{['active','trialing','past_due','unpaid','canceled'].map(v => <option key={v}>{v}</option>)}</select>
      <select className="rounded-xl border p-2" onChange={e => set('checkout_type', e.target.value)}><option value="">All payment types</option>{['coach_fee','program','fee','marketplace'].map(v => <option key={v}>{v}</option>)}</select>
      <select className="rounded-xl border p-2" onChange={e => set('channel', e.target.value)}><option value="">Stripe + Apple</option><option value="stripe">Stripe</option><option value="apple">Apple</option></select>
    </div>
    {data?.error ? <p className="rounded-2xl bg-red-50 p-4 text-red-800">{data.error}</p> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricConfig.map(([id,label,key,isMoney], index) => <button key={`${id}-${key}-${index}`} onClick={() => setMetric(id)} className={`rounded-3xl border p-5 text-left ${metric === id ? 'border-[#b80f0a] bg-red-50' : 'bg-white'}`}><span className="text-sm text-neutral-600">{label}</span><strong className="mt-2 block text-2xl">{isMoney ? money(data?.summary?.[key]) : Number(data?.summary?.[key] || 0).toLocaleString()}</strong></button>)}</div>
    <section className="rounded-3xl border bg-white p-5"><h2 className="text-xl font-bold">Underlying records</h2><p className="mb-4 text-sm text-neutral-600">Showing the authoritative records behind the selected metric.</p>{loading ? <p>Loading…</p> : <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr>{Object.keys(data?.records?.[0] || {}).slice(0, 10).map(k => <th className="border-b p-2" key={k}>{k}</th>)}</tr></thead><tbody>{(data?.records || []).slice(0, 250).map((row: any, i: number) => <tr key={row.id || row.event_id || i}>{Object.keys(data?.records?.[0] || {}).slice(0, 10).map(k => <td className="max-w-[220px] truncate border-b p-2" title={String(row[k] ?? '')} key={k}>{typeof row[k] === 'object' ? JSON.stringify(row[k]) : String(row[k] ?? '')}</td>)}</tr>)}</tbody></table></div>}</section>
    <section className="rounded-3xl border bg-white p-5"><h2 className="text-xl font-bold">Organization engagement</h2><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr>{['Workspace','Members','Sessions','Messages','Payments','Documents','Last activity','Health','Subscription','Connect','Open issues'].map(h => <th className="border-b p-2" key={h}>{h}</th>)}</tr></thead><tbody>{(data?.engagement || []).map((r: any) => <tr key={r.workspace_id}><td className="border-b p-2">{r.workspace_name}</td><td className="border-b p-2">{r.member_count}</td><td className="border-b p-2">{r.sessions_30d}</td><td className="border-b p-2">{r.messages_30d}</td><td className="border-b p-2">{r.payments_30d}</td><td className="border-b p-2">{r.document_activity_30d}</td><td className="border-b p-2">{r.last_activity_at ? new Date(r.last_activity_at).toLocaleString() : '—'}</td><td className="border-b p-2">{r.health_status}</td><td className="border-b p-2">{r.subscription_status}</td><td className="border-b p-2">{r.connect_ready ? 'Ready' : 'Not ready'}</td><td className="border-b p-2">{Number(r.outstanding_athlete_access||0)+Number(r.outstanding_reconciliation||0)}</td></tr>)}</tbody></table></div></section>
  </div>
}
