'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'

export default function SystemHealthPage() {
  const [data, setData] = useState<any>({ items: [] }), [busy, setBusy] = useState('')
  const [showTestData, setShowTestData] = useState(false)
  const load = useCallback(() => fetch(`/api/admin/system-health${showTestData ? '?show_test_data=true' : ''}`, { cache: 'no-store' }).then(r => r.json()).then(setData), [showTestData])
  useEffect(() => { void load() }, [load])
  const update = async (item: any, status: 'open'|'checked'|'resolved') => {
    const note = window.prompt(status === 'checked' ? 'Admin review note:' : status === 'resolved' ? 'How was the issue confirmed fixed?' : 'Reason for reopening:')
    if (!note) return
    setBusy(item.event_id)
    await fetch('/api/admin/system-health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issue_key: item.event_id, title: item.event_type || item.source, detail: item.error_detail, category: item.source, status, note }) })
    await load(); setBusy('')
  }
  return <main className="page-shell">
    <div className="relative z-10 px-6 py-10">
      <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <AdminSidebar />
        <div className="min-w-0 space-y-6"><div><p className="text-xs font-bold uppercase tracking-[.24em] text-[#b80f0a]">Operations</p><h1 className="text-3xl font-bold">System health</h1><p className="text-sm text-neutral-600">Resolution is administrative tracking only. It never changes authoritative financial state. Safe idempotent task retries remain in the <Link className="font-semibold text-[#b80f0a] underline" href="/admin/operations">Operations queue</Link>; this page never offers manual financial completion.</p><label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={showTestData} onChange={e=>setShowTestData(e.target.checked)} />Show test data</label></div>
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-3xl border bg-white p-5"><span>Open issues</span><strong className="block text-3xl">{data.summary?.open || 0}</strong></div><div className="rounded-3xl border bg-white p-5"><span>Checked history</span><strong className="block text-3xl">{data.summary?.checked || 0}</strong></div><div className="rounded-3xl border bg-white p-5"><span>Resolved history</span><strong className="block text-3xl">{data.summary?.resolved || 0}</strong></div></div>
    <div className="space-y-3">{data.error ? <p className="rounded-2xl bg-red-50 p-4">{data.error}</p> : (data.items || []).map((item: any) => <article className="rounded-3xl border bg-white p-5" key={item.event_id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[#b80f0a]">{item.source} · {item.status} · {item.resolution?.status || 'open'}</p><h2 className="font-bold">{item.event_type}</h2><p className="max-w-3xl text-sm text-neutral-600">{item.error_detail || 'No error detail supplied.'}</p><p className="mt-2 text-xs text-neutral-500">{item.workspace?.display_name || item.workspace_id || 'No workspace'} · {new Date(item.occurred_at).toLocaleString()}</p>{item.resolution?.resolution_note ? <p className="mt-2 rounded-xl bg-neutral-100 p-2 text-sm">{item.resolution.resolution_note}</p> : null}</div><div className="flex gap-2">{!item.resolution || item.resolution.status === 'open' ? <><button disabled={busy === item.event_id} onClick={() => update(item, 'checked')} className="rounded-full border px-4 py-2 text-sm font-semibold">Mark Checked</button><button disabled={busy === item.event_id} onClick={() => update(item, 'resolved')} className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white">Mark Resolved</button></> : <button disabled={busy === item.event_id} onClick={() => update(item, 'open')} className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white">Reopen</button>}</div></div></article>)}</div>
        </div>
      </div>
    </div>
  </main>
}
