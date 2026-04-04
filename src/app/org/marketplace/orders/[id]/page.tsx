'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'

type OrderRow = {
  id: string
  status?: string | null
  amount?: number | string | null
  created_at?: string | null
  fulfillment_status?: string | null
  fulfillment_notes?: string | null
  tracking_number?: string | null
  shipping_address?: string | null
  refund_status?: string | null
  delivered_at?: string | null
}

type ProductRow = {
  id: string
  title?: string | null
  name?: string | null
  type?: string | null
  price?: number | string | null
  price_cents?: number | null
}

type ProfileRow = {
  id: string
  full_name?: string | null
  email?: string | null
}

type RefundRequest = {
  id: string
  status: string
  reason?: string | null
  created_at?: string | null
  resolved_at?: string | null
  notes?: string | null
}

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return '$0'
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? value : `$${parsed.toFixed(2).replace(/\\.00$/, '')}`
  }
  return `$${value.toFixed(2).replace(/\\.00$/, '')}`
}

export default function OrgMarketplaceOrderDetailPage() {
  const params = useParams()
  const orderId = typeof params?.id === 'string' ? params.id : ''

  const [order, setOrder] = useState<OrderRow | null>(null)
  const [product, setProduct] = useState<ProductRow | null>(null)
  const [athlete, setAthlete] = useState<ProfileRow | null>(null)
  const [coach, setCoach] = useState<ProfileRow | null>(null)
  const [fulfillmentStatus, setFulfillmentStatus] = useState('unfulfilled')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [refunding, setRefunding] = useState(false)
  const [refundRequest, setRefundRequest] = useState<RefundRequest | null>(null)

  useEffect(() => {
    let active = true
    const loadOrder = async () => {
      if (!orderId) return
      const response = await fetch(`/api/org/marketplace/orders/${orderId}`)
      if (!response.ok) {
        setNotice('Order not found.')
        return
      }
      const payload = await response.json()
      if (!active) return
      setOrder(payload.order || null)
      setProduct(payload.product || null)
      setAthlete(payload.athlete || null)
      setCoach(payload.coach || null)
      setFulfillmentStatus(payload.order?.fulfillment_status || 'unfulfilled')
      setTrackingNumber(payload.order?.tracking_number || '')
      setNotes(payload.order?.fulfillment_notes || '')
      setRefundRequest(payload.refund_request || null)
    }
    loadOrder()
    return () => {
      active = false
    }
  }, [orderId])

  const handleSave = async () => {
    if (!orderId) return
    setSaving(true)
    setNotice('')
    const response = await fetch(`/api/org/marketplace/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fulfillment_status: fulfillmentStatus,
        tracking_number: trackingNumber.trim() || null,
        fulfillment_notes: notes.trim() || null,
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setNotice(payload?.error || 'Unable to update order.')
      setSaving(false)
      return
    }
    const payload = await response.json()
    setOrder(payload.order || null)
    setToast('Save complete')
    setSaving(false)
  }

  const handleRefundApprove = async () => {
    if (!orderId) return
    setRefunding(true)
    setNotice('')
    const response = await fetch(`/api/org/marketplace/orders/${orderId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'requested_by_customer' }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setNotice(payload?.error || 'Unable to refund order.')
      setRefunding(false)
      return
    }
    setToast('Refund issued')
    const refreshed = await fetch(`/api/org/marketplace/orders/${orderId}`)
    if (refreshed.ok) {
      const payload = await refreshed.json()
      setOrder(payload.order || null)
      setRefundRequest(payload.refund_request || null)
    }
    setRefunding(false)
  }

  const handleRefundDeny = async () => {
    if (!orderId) return
    setRefunding(true)
    setNotice('')
    const response = await fetch(`/api/org/marketplace/orders/${orderId}/refund-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'denied' }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setNotice(payload?.error || 'Unable to update refund request.')
      setRefunding(false)
      return
    }
    setToast('Refund denied')
    const refreshed = await fetch(`/api/org/marketplace/orders/${orderId}`)
    if (refreshed.ok) {
      const payload = await refreshed.json()
      setOrder(payload.order || null)
      setRefundRequest(payload.refund_request || null)
    }
    setRefunding(false)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="glass-card border border-[#191919] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Order details</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#191919]">Marketplace order</h1>
              </div>
              <Link href="/org/marketplace" className="text-sm font-semibold text-[#b80f0a]">Back to marketplace</Link>
            </div>

            {notice ? <p className="mt-4 text-sm text-[#4a4a4a]">{notice}</p> : null}

            {!order ? (
              <p className="mt-6 text-sm text-[#4a4a4a]">Loading order...</p>
            ) : (
              <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                    <p className="font-semibold text-[#191919]">{product?.title || product?.name || 'Product'}</p>
                    <p className="text-xs text-[#4a4a4a]">{product?.type || 'Marketplace item'}</p>
                    <p className="mt-2 text-sm text-[#191919]">{formatCurrency(order.amount)}</p>
                  </div>
                  <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Buyer</p>
                    <p className="mt-2 font-semibold text-[#191919]">{athlete?.full_name || 'Athlete'}</p>
                    <p className="text-xs text-[#4a4a4a]">{athlete?.email || 'No email on file'}</p>
                  </div>
                  {coach?.full_name ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coach</p>
                      <p className="mt-2 font-semibold text-[#191919]">{coach.full_name}</p>
                      <p className="text-xs text-[#4a4a4a]">{coach.email || 'No email on file'}</p>
                    </div>
                  ) : null}
                  {order.shipping_address ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Shipping address</p>
                      <p className="mt-2 text-[#191919] whitespace-pre-line">{order.shipping_address}</p>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Fulfillment</p>
                    <div className="mt-3 space-y-3">
                      <label className="space-y-2 text-sm">
                        <span className="text-xs font-semibold text-[#4a4a4a]">Status</span>
                        <select
                          value={fulfillmentStatus}
                          onChange={(event) => setFulfillmentStatus(event.target.value)}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        >
                          <option value="unfulfilled">Unfulfilled</option>
                          <option value="processing">Processing</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                        </select>
                      </label>
                      <label className="space-y-2 text-sm">
                        <span className="text-xs font-semibold text-[#4a4a4a]">Tracking number</span>
                        <input
                          value={trackingNumber}
                          onChange={(event) => setTrackingNumber(event.target.value)}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                          placeholder="Optional"
                        />
                      </label>
                      <label className="space-y-2 text-sm">
                        <span className="text-xs font-semibold text-[#4a4a4a]">Notes</span>
                        <textarea
                          rows={3}
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleSave}
                        className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Save fulfillment'}
                      </button>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Refunds</p>
                    <p className="mt-2 text-sm text-[#191919]">Status: {order.refund_status || 'Not refunded'}</p>
                    {refundRequest ? (
                      <div className="mt-3 text-xs text-[#4a4a4a]">
                        <p>Request: {refundRequest.status}</p>
                        {refundRequest.created_at ? <p>Requested {refundRequest.created_at.slice(0, 10)}</p> : null}
                        {refundRequest.status === 'requested' ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleRefundApprove}
                              className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                              disabled={refunding}
                            >
                              {refunding ? 'Processing...' : 'Approve refund'}
                            </button>
                            <button
                              type="button"
                              onClick={handleRefundDeny}
                              className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                              disabled={refunding}
                            >
                              {refunding ? 'Processing...' : 'Deny refund'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRefundApprove}
                        className="mt-4 rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                        disabled={refunding}
                      >
                        {refunding ? 'Processing...' : 'Issue refund'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
