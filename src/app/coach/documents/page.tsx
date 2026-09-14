'use client'

import { useCallback, useEffect, useState } from 'react'
import CoachSidebar from '@/components/CoachSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'

type DocumentRequest = {
  id: string
  title: string
  description?: string | null
  document_type: string
  due_at?: string | null
  status: string
  review_note?: string | null
  submission?: { filename: string; note?: string | null; download_url?: string | null; created_at: string } | null
}

export default function CoachDocumentsPage() {
  const [requests, setRequests] = useState<DocumentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch('/api/coach/documents', { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) setNotice(payload.error || 'Unable to load document requests.')
    else setRequests(payload.requests || [])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const submit = async (requestId: string, form: HTMLFormElement) => {
    setSubmittingId(requestId)
    setNotice('')
    const response = await fetch('/api/coach/documents', { method: 'POST', body: new FormData(form) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) setNotice(payload.error || 'Unable to submit the document.')
    else { setNotice('Document submitted to your organization.'); await load() }
    setSubmittingId(null)
  }

  return <main className="page-shell"><div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10"><div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"><CoachSidebar /><section>
    <p className="text-xs uppercase tracking-[0.3em] text-[#b80f0a]">Coach portal</p>
    <h1 className="display text-3xl font-semibold">Organization documents</h1>
    <p className="mt-2 text-sm text-[#4a4a4a]">Review and securely submit documents requested by your selected organization.</p>
    {notice && <p className="mt-4 rounded-xl border bg-white p-3 text-sm">{notice}</p>}
    {loading ? <LoadingState label="Loading document requests…" className="mt-6" /> : requests.length === 0 ? <EmptyState className="mt-6" title="No document requests" description="Requests from your selected organization will appear here." /> : <div className="mt-6 space-y-4">
      {requests.map((item) => <article key={item.id} className="glass-card border border-[#191919] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{item.title}</h2><p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#6b5f55]">{item.document_type.replaceAll('_', ' ')}</p></div><span className="rounded-full border px-3 py-1 text-xs font-semibold capitalize">{item.status}</span></div>
        {item.description && <p className="mt-3 text-sm text-[#4a4a4a]">{item.description}</p>}
        {item.due_at && <p className="mt-2 text-sm text-[#6b5f55]">Due {new Date(item.due_at).toLocaleDateString()}</p>}
        {item.review_note && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">Organization note: {item.review_note}</p>}
        {item.submission && <div className="mt-3 rounded-xl border p-3 text-sm"><p className="font-semibold">{item.submission.filename}</p>{item.submission.download_url && <a href={item.submission.download_url} className="mt-1 inline-block underline">View submitted document</a>}</div>}
        {['requested', 'rejected'].includes(item.status) && <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); void submit(item.id, event.currentTarget) }}>
          <input type="hidden" name="request_id" value={item.id} />
          <input required type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.txt,.rtf" className="rounded-xl border p-3 text-sm" />
          <textarea name="note" maxLength={2000} placeholder="Note (optional)" className="rounded-xl border p-3 text-sm" />
          <button disabled={submittingId === item.id} className="w-fit rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{submittingId === item.id ? 'Submitting…' : 'Submit document'}</button>
        </form>}
      </article>)}
    </div>}
  </section></div></div></main>
}
