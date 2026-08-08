'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'

type Workspace = {
  id: string; display_name: string; workspace_type: string; status: string
  owner_name: string | null; owner_email: string | null; organization_id: string | null
  member_count: number; unresolved_issue_count: number; subscription_status: string | null
  subscription_plan_key: string | null; connect_status: string | null; connect_ready: boolean
}

export default function AdminWorkspacesPage() {
  const [items, setItems] = useState<Workspace[]>([])
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [query, setQuery] = useState('')
  const [input, setInput] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const params = new URLSearchParams({ ...(query ? { query } : {}), ...(type ? { type } : {}), ...(status ? { status } : {}) })
    const response = await fetch(`/api/admin/workspaces?${params}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) { setItems(payload.items || []); setSummary(payload.summary || {}) }
    else setError(payload.error || 'Unable to load workspaces.')
    setLoading(false)
  }, [query, type, status])
  useEffect(() => { void load() }, [load])

  return <main className="page-shell"><div className="relative z-10 px-6 py-10">
    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Workspace authority</p>
    <h1 className="display text-3xl font-semibold">Business workspaces</h1>
    <p className="mt-2 text-sm text-[#6b5f55]">Organization and independent businesses, their billing authority, members, and operational health.</p>
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]"><AdminSidebar/><section className="min-w-0 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(summary).map(([key,value])=><div key={key} className="rounded-2xl border bg-white p-4"><p className="text-xs uppercase text-[#6b5f55]">{key.replaceAll('_',' ')}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</div>
      <form className="flex flex-wrap gap-2" onSubmit={(e)=>{e.preventDefault();setQuery(input.trim())}}>
        <input value={input} onChange={(e)=>setInput(e.target.value)} placeholder="User, workspace, org, Stripe, Checkout, PaymentIntent, or Connect ID" className="min-w-[280px] flex-1 rounded-2xl border bg-white px-4 py-2 text-sm"/>
        <select value={type} onChange={(e)=>setType(e.target.value)} className="rounded-2xl border bg-white px-4 py-2 text-sm"><option value="">All types</option><option value="organization">Organization</option><option value="independent_coach">Independent coach</option></select>
        <select value={status} onChange={(e)=>setStatus(e.target.value)} className="rounded-2xl border bg-white px-4 py-2 text-sm"><option value="">All statuses</option><option value="active">Active</option><option value="restricted">Restricted</option><option value="archived">Archived</option></select>
        <button className="rounded-2xl bg-[#191919] px-4 py-2 text-sm font-semibold text-white">Search</button>
      </form>
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <LoadingState label="Loading workspaces…"/> : items.length === 0 ? <EmptyState title="No workspaces found." description="Try another identifier or filter."/> : <div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-[#f5f5f5] text-xs uppercase text-[#6b5f55]"><tr>{['Workspace','Type','Owner','Status','Subscription','Connect','Members','Issues'].map(h=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{items.map(item=><tr key={item.id} className="border-t"><td className="px-4 py-3"><Link href={`/admin/workspaces/${item.id}`} className="font-semibold text-[#b80f0a] hover:underline">{item.display_name}</Link><p className="text-xs text-[#6b5f55]">{item.id}</p></td><td className="px-4 py-3">{item.workspace_type.replaceAll('_',' ')}</td><td className="px-4 py-3">{item.owner_name || '—'}<p className="text-xs">{item.owner_email}</p></td><td className="px-4 py-3 font-semibold">{item.status}</td><td className="px-4 py-3">{item.subscription_plan_key || '—'}<p className="text-xs">{item.subscription_status}</p></td><td className="px-4 py-3">{item.connect_ready ? 'Ready' : item.connect_status || 'Not configured'}</td><td className="px-4 py-3">{item.member_count}</td><td className="px-4 py-3">{item.unresolved_issue_count}</td></tr>)}</tbody></table></div>}
    </section></div>
  </div></main>
}
