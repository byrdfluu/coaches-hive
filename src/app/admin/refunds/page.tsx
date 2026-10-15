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
  requested_amount_cents?: number | null
  approved_amount_cents?: number | null
  override_reason?: string | null
  fulfillment_adjustments?: Array<{id:string;adjustment_type:string;status:string;quantity:number;reason?:string|null}>
}

export default function AdminRefundsPage() {
  const [requests, setRequests] = useState<RefundRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [query, setQuery] = useState('')
  const [validations, setValidations] = useState<Record<string, { label: string; serviceFeeCents: number }>>({})
  const [refundTypes, setRefundTypes] = useState<Record<string, 'standard' | 'full_org_caused'>>({})

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams(); if(status)params.set('status',status);if(workspaceId)params.set('workspace_id',workspaceId);if(query)params.set('query',query)
    const response = await fetch(`/api/admin/refunds?${params}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    setRequests(response.ok ? payload.requests || [] : [])
    setNotice(response.ok ? '' : payload.error || 'Unable to load refund requests.')
    setLoading(false)
  }

  useEffect(() => { void load() }, [status, workspaceId, query])

  const act = async (requestId: string, action: string) => {
    const current=requests.find(item=>item.id===requestId)
    const canonical=Boolean(current&&['program_registration','training_package','recurring_renewal'].includes(current.payment_type))
    const resolutionNote = action === 'reject'
      ? window.prompt('Rejection reason') || ''
      : action === 'approve'
        ? window.prompt('Approval note (optional)') || ''
        : ''
    if ((action === 'reject'||(canonical&&action==='approve')) && !resolutionNote.trim()) return
    const overrideReason=canonical&&action==='approve'?window.prompt('Detailed superadmin override reason (at least 10 characters)')||'':''
    if(canonical&&action==='approve'&&overrideReason.trim().length<10)return
    const approvedAmountCents=canonical&&action==='approve'?Math.round(Number(window.prompt('Approved refund amount in dollars',String(Number(current?.requested_amount_cents||0)/100))||0)*100):undefined
    setBusy(`${requestId}:${action}`)
    const response = await fetch('/api/admin/refunds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, action:canonical&&action==='approve'?'approve_and_refund':action, resolution_note: resolutionNote || null, refund_type: refundTypes[requestId] || 'standard',override_reason:overrideReason||null,approved_amount_cents:approvedAmountCents,idempotency_key:crypto.randomUUID() }),
    })
    const payload = await response.json().catch(() => ({}))
    if (action === 'validate' && response.ok) setValidations((current)=>({...current,[requestId]:{label:`${(payload.amount_cents/100).toFixed(2)} ${String(payload.currency).toUpperCase()} requested; ${(payload.refundable_balance_cents/100).toFixed(2)} refundable · ${payload.payment_intent_id}`,serviceFeeCents:Number(payload.service_fee_cents||0)}}))
    setNotice(response.ok ? (action === 'validate' ? 'Stripe validation complete.' : 'Refund request updated.') : payload.error || 'Unable to update refund request.')
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
            <div className="mt-4 flex flex-wrap gap-2"><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search user, workspace, PaymentIntent, or Stripe ID" className="min-w-[260px] flex-1 rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-sm"/><input value={workspaceId} onChange={(e)=>setWorkspaceId(e.target.value)} placeholder="Workspace ID" className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-sm"/><select value={status} onChange={(e)=>setStatus(e.target.value)} className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-sm"><option value="">All statuses</option>{['requested','under_review','approved','rejected','processing','refunded','failed','canceled'].map(value=><option key={value}>{value}</option>)}</select></div>
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
                  {item.override_reason ? <p className="mt-2 text-xs font-semibold text-[#b80f0a]">Override: {item.override_reason}</p> : null}
                  {item.fulfillment_adjustments?.map(adjustment=><p key={adjustment.id} className="mt-1 text-xs text-[#6b5f55]">{adjustment.adjustment_type.replaceAll('_',' ')} · {adjustment.status} · {adjustment.quantity}</p>)}
                  {item.stripe_refund_id ? <p className="mt-1 text-xs text-[#6b5f55]">{item.stripe_refund_id}</p> : null}
                  {validations[item.id] ? <p className="mt-2 rounded-xl bg-green-50 p-3 text-xs text-green-800">{validations[item.id].label}</p> : null}
                  {['requested', 'under_review', 'approved', 'failed'].includes(item.status) ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button disabled={Boolean(busy)} onClick={() => void act(item.id, 'validate')} className="rounded-full border px-4 py-2 text-sm font-semibold">Validate with Stripe</button>
                      <button disabled={Boolean(busy)} onClick={() => void act(item.id, 'under_review')} className="rounded-full border px-4 py-2 text-sm font-semibold">Review</button>
                      <select value={refundTypes[item.id] || 'standard'} onChange={(event)=>setRefundTypes((current)=>({...current,[item.id]:event.target.value as 'standard'|'full_org_caused'}))} className="rounded-full border px-4 py-2 text-sm">
                        <option value="standard">Standard refund (service fee stays non-refundable)</option>
                        <option value="full_org_caused">Full refund (your org covers the ${((validations[item.id]?.serviceFeeCents||0)/100).toFixed(2)} service fee)</option>
                      </select>
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
