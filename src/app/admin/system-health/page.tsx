'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

export default function SystemHealthPage() {
  const [data, setData] = useState<any>({ items: [] }), [busy, setBusy] = useState('')
  const load = useCallback(() => fetch('/api/admin/system-health', { cache: 'no-store' }).then(r => r.json()).then(setData), [])
  useEffect(() => { void load() }, [load])
  const update = async (item: any, resolved: boolean) => {
    const note = window.prompt(resolved ? 'Resolution note (required for audit):' : 'Reason for reopening:')
    if (!note) return
    setBusy(item.event_id)
    await fetch('/api/admin/system-health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue_key: item.event_id, title: item.event_type || item.source, detail: item.error_detail, category: item.source, resolved, note }) })
    await load(); setBusy('')
  }
  return <div className="space-y-6"><div><p className="text-xs font-bold uppercase tracking-[.24em] text-[#b80f0a]">Operations</p><h1 className="text-3xl font-bold">System health</h1><p className="text-sm text-neutral-600">Resolution is administrative tracking only. It never changes authoritative financial state. Safe idempotent task retries remain in the <Link className="font-semibold text-[#b80f0a] underline" href="/admin/operations">Operations queue</Link>; this page never offers manual financial completion.</p></div>
    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-3xl border bg-white p-5"><span>Open issues</span><strong className="block text-3xl">{data.summary?.open || 0}</strong></div><div className="rounded-3xl border bg-white p-5"><span>Resolved tracking items</span><strong className="block text-3xl">{data.summary?.resolved || 0}</strong></div></div>
    <div className="space-y-3">{data.error ? <p className="rounded-2xl bg-red-50 p-4">{data.error}</p> : (data.items || []).map((item: any) => <article className="rounded-3xl border bg-white p-5" key={item.event_id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[#b80f0a]">{item.source} · {item.status}</p><h2 className="font-bold">{item.event_type}</h2><p className="max-w-3xl text-sm text-neutral-600">{item.error_detail || 'No error detail supplied.'}</p><p className="mt-2 text-xs text-neutral-500">{item.workspace?.display_name || item.workspace_id || 'No workspace'} · {new Date(item.occurred_at).toLocaleString()}</p>{item.resolution?.resolution_note ? <p className="mt-2 rounded-xl bg-neutral-100 p-2 text-sm">{item.resolution.resolution_note}</p> : null}</div><button disabled={busy === item.event_id} onClick={() => update(item, item.resolution?.status !== 'resolved')} className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white">{item.resolution?.status === 'resolved' ? 'Reopen' : 'Mark resolved'}</button></div></article>)}</div>
  </div>
}
