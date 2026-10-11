'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

export type AdminColumn = { key: string; label: string; kind?: 'date' | 'money' | 'boolean' | 'status' }
export type AdminRowAction = { action: string; label: string; idKey?: string; confirm?: string }

const renderValue = (value: unknown, kind?: AdminColumn['kind']) => {
  if (kind === 'date') return value ? new Date(String(value)).toLocaleString() : '—'
  if (kind === 'money') return typeof value === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100) : '—'
  if (kind === 'boolean') return value ? 'Yes' : 'No'
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

export default function AdminOperationalDataPage({ title, description, endpoint, columns, pageSize, actions = [] }: { title: string; description: string; endpoint: string; columns: AdminColumn[]; pageSize?: number; actions?: AdminRowAction[] }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [summary, setSummary] = useState<Record<string, number | string>>({})
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [showTestData, setShowTestData] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [acting, setActing] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const params = new URLSearchParams(); if (query) params.set('query', query); if (status) params.set('status', status); if (workspaceId) params.set('workspace_id', workspaceId); if (showTestData) params.set('show_test_data', 'true')
    const response = await fetch(`${endpoint}?${params}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) setError(payload.error || 'Unable to load records.')
    else { setItems(payload.items || []); setSummary(payload.summary || {}) }
    setLoading(false)
  }, [endpoint, query, status, workspaceId, showTestData])
  useEffect(() => { void load() }, [load])
  useEffect(() => { setPage(1) }, [endpoint, query, status, workspaceId, showTestData])
  const runAction = async (item: Record<string, unknown>, rowAction: AdminRowAction) => {
    const id = String(item[rowAction.idKey || 'id'] || '')
    const reason = window.prompt(rowAction.confirm || `Why are you running “${rowAction.label}”? This is required for the audit log.`)
    if (!reason || !id) return
    const key = `${rowAction.action}:${id}`; setActing(key); setError('')
    const response = await fetch('/api/admin/operational-actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: rowAction.action, id, reason }) })
    const payload = await response.json().catch(() => ({})); setActing('')
    if (!response.ok) setError(payload.error || 'Action failed.'); else await load()
  }
  const effectivePageSize = pageSize && pageSize > 0 ? pageSize : Math.max(items.length, 1)
  const pageCount = Math.max(1, Math.ceil(items.length / effectivePageSize))
  const safePage = Math.min(page, pageCount)
  const pageStart = (safePage - 1) * effectivePageSize
  const visibleItems = items.slice(pageStart, pageStart + effectivePageSize)
  return <main className="page-shell"><div className="relative z-10 px-6 py-10">
    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p><h1 className="display text-3xl font-semibold text-[#191919]">{title}</h1><p className="mt-2 text-sm text-[#6b5f55]">{description}</p>
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]"><AdminSidebar/><section className="min-w-0 space-y-4">
      {Object.keys(summary).length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(summary).map(([key,value]) => <div key={key} className="rounded-2xl border border-[#dcdcdc] bg-white p-4"><p className="text-xs uppercase tracking-wider text-[#6b5f55]">{key.replaceAll('_',' ')}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</div>}
      <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void load() }}><input aria-label="Search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search records or Stripe IDs…" className="min-w-[220px] flex-1 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm"/><input aria-label="Workspace filter" value={workspaceId} onChange={(e)=>setWorkspaceId(e.target.value)} placeholder="Workspace ID" className="min-w-[220px] rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm"/><input aria-label="Status filter" value={status} onChange={(e)=>setStatus(e.target.value)} placeholder="Status filter" className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm"/><label className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm"><input type="checkbox" checked={showTestData} onChange={e=>setShowTestData(e.target.checked)}/>Show test data</label><button className="rounded-2xl bg-[#191919] px-4 py-2 text-sm font-semibold text-white">Refresh</button></form>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <LoadingState label={`Loading ${title.toLowerCase()}…`}/> : items.length === 0 ? <EmptyState title="No records found." description="No records match the current filters."/> : <><div className="overflow-x-auto rounded-2xl border border-[#dcdcdc] bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-[#f5f5f5] text-xs uppercase tracking-wider text-[#6b5f55]"><tr>{columns.map(c=><th key={c.key} className="px-4 py-3">{c.label}</th>)}{actions.length>0&&<th className="px-4 py-3">Actions</th>}</tr></thead><tbody>{visibleItems.map((item,index)=><tr key={String(item.id || item.event_id || item.token || pageStart + index)} className="border-t border-[#ececec]">{columns.map((c,columnIndex)=><td key={c.key} className={`max-w-[260px] break-words px-4 py-3 ${c.kind === 'status' ? 'font-semibold' : ''}`}>{columnIndex === 0 && item.is_test ? <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">TEST</span> : null}{renderValue(item[c.key],c.kind)}</td>)}{actions.length>0&&<td className="px-4 py-3"><div className="flex flex-wrap gap-2">{actions.map(a=>{const id=String(item[a.idKey||'id']||'');const key=`${a.action}:${id}`;return <button key={a.action} type="button" disabled={acting===key} onClick={()=>runAction(item,a)} className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold disabled:opacity-50">{acting===key?'Working…':a.label}</button>})}</div></td>}</tr>)}</tbody></table></div>{pageSize && items.length > 0 ? <nav aria-label={`${title} pages`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-white p-4"><p className="text-sm text-[#6b5f55]">Showing {pageStart + 1}–{Math.min(pageStart + effectivePageSize, items.length)} of {items.length}</p><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={safePage === 1} onClick={() => setPage(current => Math.max(1, current - 1))} className="rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-40">Previous</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map(pageNumber => <button type="button" key={pageNumber} aria-current={pageNumber === safePage ? 'page' : undefined} onClick={() => setPage(pageNumber)} className={`h-10 min-w-10 rounded-full border px-3 text-sm font-semibold ${pageNumber === safePage ? 'border-[#191919] bg-[#191919] text-white' : 'bg-white'}`}>{pageNumber}</button>)}<button type="button" disabled={safePage === pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))} className="rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-40">Next</button></div></nav> : null}</>}
    </section></div></div></main>
}
