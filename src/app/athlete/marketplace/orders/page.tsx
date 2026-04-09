'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import AthleteContextBanner from '@/components/AthleteContextBanner'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAthleteProfile } from '@/components/AthleteProfileContext'

type OrderRow = {
  id: string
  product_id?: string | null
  sub_profile_id?: string | null
  athlete_label?: string | null
  title?: string | null
  seller?: string | null
  status?: string | null
  fulfillment_status?: string | null
  refund_status?: string | null
  amount?: number | string | null
  created_at?: string | null
  receipt_url?: string | null
}

const parseAmount = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const cleaned = value.replace(/[^0-9.]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isNaN(parsed) ? 0 : parsed
}

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return '$0'
  if (typeof value === 'string') {
    return value.trim().startsWith('$') ? value : `$${value}`
  }
  return `$${value.toFixed(2).replace(/\.00$/, '')}`
}

export default function AthleteOrderHistoryPage() {
  const searchParams = useSearchParams()
  const { activeSubProfileId, activeAthleteLabel } = useAthleteProfile()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [refundRequests, setRefundRequests] = useState<Record<string, string>>({})
  const [refundErrors, setRefundErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const cartCheckoutSuccess = searchParams?.get('cart_checkout') === 'success'

  const loadOrders = useCallback(async () => {
    setLoading(true)
    const response = await fetch(
      `/api/athlete/orders?${new URLSearchParams(
        activeSubProfileId
          ? { sub_profile_id: activeSubProfileId }
          : { athlete_scope: 'main' },
      ).toString()}`,
      { cache: 'no-store' },
    )
    const payload = response.ok ? await response.json().catch(() => ({})) : {}
    const nextOrders = (payload.orders || []) as OrderRow[]
    setOrders(nextOrders)
    setRefundRequests(
      nextOrders.reduce<Record<string, string>>((map, row) => {
        if (row.refund_status) map[row.id] = row.refund_status
        return map
      }, {})
    )
    setLoading(false)
  }, [activeSubProfileId])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  useEffect(() => {
    if (!cartCheckoutSuccess || typeof window === 'undefined') return
    window.localStorage.removeItem('athlete-marketplace-cart')
    setNotice('Processing your checkout. Recent orders and receipts will refresh automatically.')
    let attempts = 0
    const intervalId = window.setInterval(async () => {
      attempts += 1
      await loadOrders()
      if (attempts >= 5) {
        window.clearInterval(intervalId)
        setNotice('Checkout sync complete. If a receipt is still missing, refresh once more in a few seconds.')
      }
    }, 2000)
    return () => window.clearInterval(intervalId)
  }, [cartCheckoutSuccess, loadOrders])


  const orderLines = useMemo(() => {
    return orders.map((order) => {
      const title = order.title || 'Product'
      const seller = order.seller || 'Seller'
      const date = order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'
      const amount = formatCurrency(parseAmount(order.amount))
      return {
        id: order.id,
        title,
        seller,
        date,
        status: order.status || 'Active',
        amount,
        fulfillment: order.fulfillment_status || 'unfulfilled',
        refundStatus: order.refund_status || refundRequests[order.id] || null,
        receiptUrl: order.receipt_url ?? null,
      }
    })
  }, [orders, refundRequests])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Order history</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">All orders</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">View past and active orders with receipts.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/athlete/settings#export-center"
              className="self-start rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Go to export center
            </Link>
            <Link href="/athlete/marketplace" className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
              Back to marketplace
            </Link>
          </div>
        </header>
        <AthleteContextBanner
          className="mt-6"
          athleteDescription={`Order history is currently showing purchases for ${activeAthleteLabel}.`}
        />

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="glass-card border border-[#191919] bg-white p-5">
            {notice ? <p className="mb-4 text-xs text-[#4a4a4a]">{notice}</p> : null}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[#191919]">Orders</h2>
              <Link href="/support" className="text-sm font-semibold text-[#191919] underline">
                Contact support
              </Link>
            </div>
            <div className="mt-4 space-y-3 text-sm text-[#4a4a4a]">
              {loading ? (
                <LoadingState label="Loading orders..." />
              ) : orderLines.length === 0 ? (
                <EmptyState title="No orders yet." description="Orders you complete will show up here." />
              ) : (
                orderLines.map((order) => (
                  <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <div>
                      <p className="font-semibold text-[#191919]">{order.title}</p>
                      <p className="text-xs font-semibold text-[#191919]">{order.athlete_label || activeAthleteLabel}</p>
                      <p className="text-xs">{order.date} · {order.seller} · {order.fulfillment}</p>
                      {order.refundStatus ? <p className="text-xs">Refund: {order.refundStatus}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                        {order.status}
                      </span>
                      <strong className="text-[#191919]">{order.amount}</strong>
                      {!order.refundStatus ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const response = await fetch(`/api/marketplace/orders/${order.id}/refund-request`, {
                              method: 'POST',
                            })
                            if (response.ok) {
                              setRefundRequests((prev) => ({ ...prev, [order.id]: 'requested' }))
                            } else {
                              const data = await response.json().catch(() => null)
                              setRefundErrors((prev) => ({ ...prev, [order.id]: data?.error || 'Unable to request refund. Try again.' }))
                            }
                          }}
                          className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                        >
                          Request refund
                        </button>
                      ) : null}
                      {refundErrors[order.id] && (
                        <p className="w-full text-xs text-[#b80f0a]">{refundErrors[order.id]}</p>
                      )}
                      {order.receiptUrl ? (
                        <a
                          href={order.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                        >
                          Receipt
                        </a>
                      ) : (
                        <Link
                          href="/athlete/settings#export-center"
                          className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#9a9a9a]"
                        >
                          Receipt
                        </Link>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
