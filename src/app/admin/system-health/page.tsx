'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'

type HealthItem = { event_id: string; event_type?: string; source?: string; status?: string; error_detail?: string; workspace_id?: string; occurred_at: string; workspace?: { display_name?: string }; resolution?: { status?: string; resolution_note?: string } }
type HealthData = { items?: HealthItem[]; summary?: { open?: number; checked?: number; resolved?: number }; error?: string }
type PaymentReadiness = { webhook?: { url: string; exists: boolean; status: string; missing_events: string[] }; configuration?: { webhook_secret: boolean; recurring_portal: boolean; platform_fee_bps: number }; failed_webhooks?: unknown[]; dead_letters?: unknown[]; recurring_subscriptions?: unknown[] }

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `Unable to load ${url}`)
  return payload as T
}

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData>({ items: [] })
  const [payments, setPayments] = useState<PaymentReadiness>({})
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showTestData, setShowTestData] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const suffix = showTestData ? '?show_test_data=true' : ''
    const [healthResult, paymentsResult] = await Promise.allSettled([
      readJson<HealthData>(`/api/admin/system-health${suffix}`),
      readJson<PaymentReadiness>('/api/admin/payments/readiness'),
    ])
    if (healthResult.status === 'fulfilled') setData(healthResult.value)
    if (paymentsResult.status === 'fulfilled') setPayments(paymentsResult.value)
    const failures = [healthResult, paymentsResult]
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason instanceof Error ? result.reason.message : 'Unable to load system health')
    setLoadError(failures.join(' '))
    setLoading(false)
  }, [showTestData])

  useEffect(() => { void load() }, [load])

  const update = async (item: HealthItem, status: 'open' | 'checked' | 'resolved') => {
    const note = window.prompt(status === 'checked' ? 'Admin review note:' : status === 'resolved' ? 'How was the issue confirmed fixed?' : 'Reason for reopening:')
    if (!note) return
    setBusy(item.event_id)
    try {
      const response = await fetch('/api/admin/system-health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue_key: item.event_id, title: item.event_type || item.source, detail: item.error_detail, category: item.source, status, note }) })
      if (!response.ok) throw new Error('Unable to update this issue.')
      await load()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to update this issue.')
    } finally {
      setBusy('')
    }
  }

  const checks = [
    { label: 'Stripe webhook', ready: Boolean(payments.webhook?.exists && payments.webhook.status === 'enabled'), detail: payments.webhook?.exists ? payments.webhook.status : 'Missing' },
    { label: 'Webhook secret', ready: Boolean(payments.configuration?.webhook_secret), detail: payments.configuration?.webhook_secret ? 'Configured' : 'Missing' },
    { label: 'Required events', ready: payments.webhook?.missing_events?.length === 0, detail: payments.webhook ? `${payments.webhook.missing_events.length} missing` : 'Unavailable' },
    { label: 'Failed webhooks', ready: payments.failed_webhooks?.length === 0, detail: `${payments.failed_webhooks?.length ?? 0} unresolved` },
    { label: 'Dead letter tasks', ready: payments.dead_letters?.length === 0, detail: `${payments.dead_letters?.length ?? 0} unresolved` },
    { label: 'Recurring portal', ready: Boolean(payments.configuration?.recurring_portal), detail: payments.configuration?.recurring_portal ? 'Configured' : 'Missing' },
  ]

  return <main className="page-shell"><div className="relative z-10 px-6 py-10"><div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]"><AdminSidebar /><div className="min-w-0 space-y-6">
    <div><p className="text-xs font-bold uppercase tracking-[.24em] text-[#b80f0a]">Operations</p><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-bold">System health</h1><p className="text-sm text-neutral-600">Live payment readiness, failed operations, and administrative issue tracking.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">{loading ? 'Checking…' : 'Refresh checks'}</button></div><p className="mt-2 text-xs text-neutral-500">Safe task retries remain in the <Link className="font-semibold text-[#b80f0a] underline" href="/admin/operations">Operations queue</Link>.</p><label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={showTestData} onChange={event => setShowTestData(event.target.checked)} />Show test data</label></div>
    {loadError ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</div> : null}
    <section className="rounded-3xl border bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-bold">Payment readiness</h2><p className="text-sm text-neutral-600">Stripe configuration and unresolved payment processing failures.</p></div>{payments.configuration ? <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold">Platform fee {payments.configuration.platform_fee_bps / 100}%</span> : null}</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{checks.map(check => <div key={check.label} className="rounded-2xl border p-4"><div className="flex items-center gap-2"><span aria-hidden className={`h-2.5 w-2.5 rounded-full ${check.ready ? 'bg-emerald-500' : 'bg-red-500'}`} /><strong>{check.label}</strong></div><p className="mt-1 text-sm text-neutral-600">{check.detail}</p></div>)}</div>{payments.webhook?.missing_events?.length ? <details className="mt-4 rounded-2xl bg-amber-50 p-4"><summary className="cursor-pointer font-semibold text-amber-900">View missing Stripe events</summary><p className="mt-2 break-words text-sm text-amber-900">{payments.webhook.missing_events.join(', ')}</p></details> : null}</section>
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-3xl border bg-white p-5"><span>Open issues</span><strong className="block text-3xl">{data.summary?.open || 0}</strong></div><div className="rounded-3xl border bg-white p-5"><span>Checked history</span><strong className="block text-3xl">{data.summary?.checked || 0}</strong></div><div className="rounded-3xl border bg-white p-5"><span>Resolved history</span><strong className="block text-3xl">{data.summary?.resolved || 0}</strong></div></div>
    <div className="space-y-3">{data.error ? <p className="rounded-2xl bg-red-50 p-4">{data.error}</p> : (data.items || []).map(item => <article className="rounded-3xl border bg-white p-5" key={item.event_id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[#b80f0a]">{item.source} · {item.status} · {item.resolution?.status || 'open'}</p><h2 className="font-bold">{item.event_type}</h2><p className="max-w-3xl text-sm text-neutral-600">{item.error_detail || 'No error detail supplied.'}</p><p className="mt-2 text-xs text-neutral-500">{item.workspace?.display_name || item.workspace_id || 'No workspace'} · {new Date(item.occurred_at).toLocaleString()}</p>{item.resolution?.resolution_note ? <p className="mt-2 rounded-xl bg-neutral-100 p-2 text-sm">{item.resolution.resolution_note}</p> : null}</div><div className="flex gap-2">{!item.resolution || item.resolution.status === 'open' ? <><button disabled={busy === item.event_id} onClick={() => update(item, 'checked')} className="rounded-full border px-4 py-2 text-sm font-semibold">Mark Checked</button><button disabled={busy === item.event_id} onClick={() => update(item, 'resolved')} className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white">Mark Resolved</button></> : <button disabled={busy === item.event_id} onClick={() => update(item, 'open')} className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white">Reopen</button>}</div></div></article>)}</div>
  </div></div></div></main>
}
