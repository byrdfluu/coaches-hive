'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

export type AdminColumn = { key: string; label: string; kind?: 'date' | 'money' | 'boolean' | 'status' }

const renderValue = (value: unknown, kind?: AdminColumn['kind']) => {
  if (kind === 'date') return value ? new Date(String(value)).toLocaleString() : '—'
  if (kind === 'money') return typeof value === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100) : '—'
  if (kind === 'boolean') return value ? 'Yes' : 'No'
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

export default function AdminOperationalDataPage({ title, description, endpoint, columns }: { title: string; description: string; endpoint: string; columns: AdminColumn[] }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [summary, setSummary] = useState<Record<string, number | string>>({})
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const params = new URLSearchParams(); if (query) params.set('query', query); if (status) params.set('status', status)
    const response = await fetch(`${endpoint}?${params}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) setError(payload.error || 'Unable to load records.')
    else { setItems(payload.items || []); setSummary(payload.summary || {}) }
    setLoading(false)
  }, [endpoint, query, status])
  useEffect(() => { void load() }, [load])
  return <main className="page-shell"><div className="relative z-10 px-6 py-10">
    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p><h1 className="display text-3xl font-semibold text-[#191919]">{title}</h1><p className="mt-2 text-sm text-[#6b5f55]">{description}</p>
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]"><AdminSidebar/><section className="min-w-0 space-y-4">
      {Object.keys(summary).length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(summary).map(([key,value]) => <div key={key} className="rounded-2xl border border-[#dcdcdc] bg-white p-4"><p className="text-xs uppercase tracking-wider text-[#6b5f55]">{key.replaceAll('_',' ')}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</div>}
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void load() }}><input aria-label="Search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search records…" className="min-w-[220px] flex-1 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm"/><input aria-label="Status filter" value={status} onChange={(e)=>setStatus(e.target.value)} placeholder="Status filter" className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm"/><button className="rounded-2xl bg-[#191919] px-4 py-2 text-sm font-semibold text-white">Refresh</button></form>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <LoadingState label={`Loading ${title.toLowerCase()}…`}/> : items.length === 0 ? <EmptyState title="No records found." description="No records match the current filters."/> : <div className="overflow-x-auto rounded-2xl border border-[#dcdcdc] bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-[#f5f5f5] text-xs uppercase tracking-wider text-[#6b5f55]"><tr>{columns.map(c=><th key={c.key} className="px-4 py-3">{c.label}</th>)}</tr></thead><tbody>{items.map((item,index)=><tr key={String(item.id || item.event_id || item.token || index)} className="border-t border-[#ececec]">{columns.map(c=><td key={c.key} className={`max-w-[260px] break-words px-4 py-3 ${c.kind === 'status' ? 'font-semibold' : ''}`}>{renderValue(item[c.key],c.kind)}</td>)}</tr>)}</tbody></table></div>}
    </section></div></div></main>
}
