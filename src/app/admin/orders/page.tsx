'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type OrderRow = {
  id: string
  coach_id?: string | null
  athlete_id?: string | null
  org_id?: string | null
  amount?: number | string | null
  total?: number | string | null
  price?: number | string | null
  status?: string | null
  refund_status?: string | null
  payment_intent_id?: string | null
  refund_amount?: number | string | null
  refunded_at?: string | null
  created_at?: string | null
}

type OrdersPagination = {
  page: number
  page_size: number
  total: number
  has_next: boolean
}

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return '$0'
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? value : `$${parsed.toFixed(2).replace(/\\.00$/, '')}`
  }
  return `$${value.toFixed(2).replace(/\\.00$/, '')}`
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const getOrderStatus = (order: OrderRow) => {
  const refund = String(order.refund_status || '').toLowerCase()
  if (refund === 'refunded') return 'Refunded'
  const status = String(order.status || '').toLowerCase()
  if (status === 'failed') return 'Failed'
  if (status === 'disputed') return 'Disputed'
  if (status === 'pending') return 'Pending'
  return 'Paid'
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [coaches, setCoaches] = useState<Record<string, { name: string; email: string }>>({})
  const [athletes, setAthletes] = useState<Record<string, { name: string; email: string }>>({})
  const [orgs, setOrgs] = useState<Record<string, string>>({})
  const [pagination, setPagination] = useState<OrdersPagination>({ page: 1, page_size: 50, total: 0, has_next: false })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState('')

  useEffect(() => {
    let active = true
    const loadOrders = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch(`/api/admin/orders?page=${page}&page_size=50`)
      if (!response.ok) {
        if (active) {
          setNotice('Unable to load orders.')
          setLoading(false)
        }
        return
      }
      const payload = await response.json()
      if (!active) return
      setOrders(payload.orders || [])
      setCoaches(payload.coaches || {})
      setAthletes(payload.athletes || {})
      setOrgs(payload.orgs || {})
      setPagination({
        page: Number(payload.pagination?.page || page),
        page_size: Number(payload.pagination?.page_size || 50),
        total: Number(payload.pagination?.total || 0),
        has_next: Boolean(payload.pagination?.has_next),
      })
      setLoading(false)
    }
    loadOrders()
    return () => {
      active = false
    }
  }, [page])

  const handleOrderAction = async (orderId: string, action: 'approve' | 'dispute' | 'refund') => {
    setActionLoadingId(`${orderId}:${action}`)
    const response = await fetch('/api/admin/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, action }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setNotice(payload?.error || 'Unable to update order.')
      setActionLoadingId('')
      return
    }
    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...(payload.order || {}) } : order)))
    setNotice(
      action === 'approve'
        ? 'Order approved.'
        : action === 'dispute'
        ? 'Order marked disputed.'
        : 'Order refunded.',
    )
    setActionLoadingId('')
  }

  const grossRevenue = useMemo(() => {
    return orders.reduce((sum, order) => {
      const value = Number(order.amount ?? order.total ?? order.price ?? 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
  }, [orders])

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return orders
    return orders.filter((order) => {
      const coach = order.coach_id ? coaches[order.coach_id]?.name || '' : ''
      const athlete = order.athlete_id ? athletes[order.athlete_id]?.name || '' : ''
      const org = order.org_id ? orgs[order.org_id] || '' : ''
      return (
        order.id.toLowerCase().includes(term) ||
        coach.toLowerCase().includes(term) ||
        athlete.toLowerCase().includes(term) ||
        org.toLowerCase().includes(term)
      )
    })
  }, [orders, search, coaches, athletes, orgs])

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.page_size || 50)))

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Marketplace orders</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">All marketplace purchases across coaches and orgs.</p>
          </div>
          <Link href="/admin" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
            Back to admin
          </Link>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              {[
                { label: 'Total orders', value: pagination.total.toString() },
                { label: 'Gross revenue', value: formatCurrency(grossRevenue) },
                { label: 'Refunded', value: orders.filter((order) => String(order.refund_status || '').toLowerCase() === 'refunded').length.toString() },
              ].map((stat) => (
                <div key={stat.label} className="glass-card border border-[#191919] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
              ))}
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Orders</h2>
                  <p className="text-sm text-[#6b5f55]">Search by order ID, coach, athlete, or org.</p>
                </div>
                <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919] md:w-64"
                    placeholder="Search loaded page"
                  />
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={loading || page <= 1}
                  >
                    Prev
                  </button>
                  <span className="text-xs font-semibold text-[#6b5f55]">
                    Page {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                    onClick={() => setPage((prev) => prev + 1)}
                    disabled={loading || !pagination.has_next}
                  >
                    Next
                  </button>
                </div>
              </div>
              {notice ? <p className="mt-3 text-xs text-[#6b5f55]">{notice}</p> : null}
              <div className="mt-4 space-y-3 text-sm overflow-x-auto">
                {loading ? (
                  <LoadingState label="Loading orders..." />
                ) : filteredOrders.length === 0 ? (
                  <EmptyState title="No orders found." description="Try a different search term or date range." />
                ) : (
                  <div className="min-w-[980px] space-y-3">
                    <div className="grid gap-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs uppercase tracking-[0.2em] text-[#6b5f55] md:grid-cols-[1.2fr_1fr_1fr_1fr_0.8fr_0.8fr_0.8fr_1.4fr]">
                      <span>Order</span>
                      <span>Coach</span>
                      <span>Athlete</span>
                      <span>Org</span>
                      <span>Amount</span>
                      <span>Status</span>
                      <span>Date</span>
                      <span>Actions</span>
                    </div>
                    {filteredOrders.map((order) => {
                      const coach = order.coach_id ? coaches[order.coach_id]?.name || 'Coach' : 'Org'
                      const athlete = order.athlete_id ? athletes[order.athlete_id]?.name || 'Athlete' : 'Athlete'
                      const org = order.org_id ? orgs[order.org_id] || 'Organization' : '—'
                      const amount = formatCurrency(order.amount ?? order.total ?? order.price)
                      const status = getOrderStatus(order)
                      const refunded = String(order.refund_status || '').toLowerCase() === 'refunded' || String(order.status || '').toLowerCase() === 'refunded'
                      const loadingApprove = actionLoadingId === `${order.id}:approve`
                      const loadingDispute = actionLoadingId === `${order.id}:dispute`
                      const loadingRefund = actionLoadingId === `${order.id}:refund`
                      return (
                        <div
                          key={order.id}
                          className="grid gap-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#191919] md:grid-cols-[1.2fr_1fr_1fr_1fr_0.8fr_0.8fr_0.8fr_1.4fr]"
                        >
                          <span className="font-semibold">{order.id}</span>
                          <span>{coach}</span>
                          <span>{athlete}</span>
                          <span>{org}</span>
                          <span>{amount}</span>
                          <span className="rounded-full border border-[#191919] px-2 py-1 text-xs font-semibold text-[#191919]">{status}</span>
                          <span className="text-[#6b5f55]">{formatDate(order.created_at)}</span>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-[#191919] px-2 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                              onClick={() => handleOrderAction(order.id, 'approve')}
                              disabled={Boolean(actionLoadingId) || refunded}
                            >
                              {loadingApprove ? 'Approving...' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-[#191919] px-2 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50"
                              onClick={() => handleOrderAction(order.id, 'dispute')}
                              disabled={Boolean(actionLoadingId) || refunded}
                            >
                              {loadingDispute ? 'Updating...' : 'Dispute'}
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-[#b80f0a] px-2 py-1 text-xs font-semibold text-[#b80f0a] disabled:opacity-50"
                              onClick={() => handleOrderAction(order.id, 'refund')}
                              disabled={Boolean(actionLoadingId) || refunded}
                            >
                              {loadingRefund ? 'Refunding...' : 'Refund'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
