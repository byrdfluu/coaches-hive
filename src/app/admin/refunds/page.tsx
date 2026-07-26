'use client'

import { useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type RefundRequest = {
  id: string
  requester_id: string
  payment_type: string
  payment_record_id: string
  amount: number | string
  reason: string
  status: string
  stripe_refund_id?: string | null
  resolution_note?: string | null
  requested_at: string
}

export default function AdminRefundsPage() {
  const [requests, setRequests] = useState<RefundRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')

  const load = async () => {
    setLoading(true)
    const response = await fetch('/api/admin/refunds', { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    setRequests(response.ok ? payload.requests || [] : [])
    setNotice(response.ok ? '' : payload.error || 'Unable to load refund requests.')
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const act = async (requestId: string, action: string) => {
    const resolutionNote = action === 'reject'
      ? window.prompt('Rejection reason') || ''
      : action === 'approve'
        ? window.prompt('Approval note (optional)') || ''
        : ''
    if (action === 'reject' && !resolutionNote.trim()) return
    setBusy(`${requestId}:${action}`)
    const response = await fetch('/api/admin/refunds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, action, resolution_note: resolutionNote || null }),
    })
    const payload = await response.json().catch(() => ({}))
    setNotice(response.ok ? 'Refund request updated.' : payload.error || 'Unable to update refund request.')
    setBusy('')
    if (response.ok) await load()
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 px-6 py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Finance operations</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Refund queue</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">
              Superadmin review backed by Stripe PaymentIntent and refundable-balance validation.
            </p>
            {notice ? <p className="mt-4 rounded-xl border border-[#dcdcdc] bg-white p-3 text-sm">{notice}</p> : null}
            <div className="mt-6 space-y-3">
              {loading ? <p>Loading refund requests…</p> : requests.length === 0 ? <p>No refund requests.</p> : requests.map((item) => (
                <article key={item.id} className="rounded-2xl border border-[#191919] bg-white p-5">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.payment_type.replaceAll('_', ' ')}</p>
                      <p className="text-xs text-[#6b5f55]">{item.payment_record_id}</p>
                    </div>
                    <span className="rounded-full border px-3 py-1 text-xs font-semibold">{item.status}</span>
                  </div>
                  <p className="mt-3 text-sm">{item.reason}</p>
                  <p className="mt-2 text-sm font-semibold">${Number(item.amount).toFixed(2)}</p>
                  {item.resolution_note ? <p className="mt-2 text-xs text-[#6b5f55]">{item.resolution_note}</p> : null}
                  {item.stripe_refund_id ? <p className="mt-1 text-xs text-[#6b5f55]">{item.stripe_refund_id}</p> : null}
                  {['requested', 'under_review', 'approved', 'failed'].includes(item.status) ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button disabled={Boolean(busy)} onClick={() => void act(item.id, 'under_review')} className="rounded-full border px-4 py-2 text-sm font-semibold">Review</button>
                      <button disabled={Boolean(busy)} onClick={() => void act(item.id, 'approve')} className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white">Approve refund</button>
                      <button disabled={Boolean(busy)} onClick={() => void act(item.id, 'reject')} className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white">Reject</button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
