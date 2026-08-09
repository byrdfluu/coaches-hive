'use client'
import { useState } from 'react'
const datasets = ['payment_accounting','platform_fees','subscriptions','refunds','audit_logs','waiver_document_proofs','workspace_reconciliation','organization_engagement']
export default function ExportsPage() {
  const [jobs, setJobs] = useState<any[]>([]), [busy, setBusy] = useState('')
  const create = async (dataset: string) => { setBusy(dataset); const r = await fetch('/api/admin/exports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataset }) }); const data = await r.json(); setBusy(''); if (data.job) setJobs(j => [data, ...j]); else window.alert(data.error) }
  return <div className="space-y-6"><div><p className="text-xs font-bold uppercase tracking-[.24em] text-[#b80f0a]">Superadmin</p><h1 className="text-3xl font-bold">Exports</h1><p className="text-sm text-neutral-600">Authorized server-side exports expire after one hour. Creation and download are audited.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{datasets.map(d => <button disabled={busy === d} key={d} onClick={() => create(d)} className="rounded-3xl border bg-white p-5 text-left font-semibold capitalize">{busy === d ? 'Creating…' : d.replaceAll('_',' ')}</button>)}</div>{jobs.map(j => <a className="block rounded-2xl bg-[#191919] p-4 font-semibold text-white" href={j.download_url} key={j.job.id}>Download {j.job.dataset.replaceAll('_',' ')} · expires {new Date(j.job.expires_at).toLocaleTimeString()}</a>)}</div>
}
