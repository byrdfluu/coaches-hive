'use client'

import { useEffect, useState, useCallback } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

type SubscriptionItem = {
  user_id: string
  email: string | null
  full_name: string | null
  purchase_channel: string | null
  apple_original_transaction_id: string | null
  has_access: boolean
  status: string | null
  billing_role: string | null
  plan_key: string | null
  billing_interval: string
  current_period_end: string | null
  current_period_start: string | null
  trial_end: string | null
  updated_at: string | null
  cancel_at_period_end: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  apple_product_id: string | null
  apple_environment: string | null
  renewal_amount: number | null
  active_seat_count: number | null
  included_seat_count: number | null
  additional_seat_count: number | null
}

function StatusBadge({ status }: { status: string | null }) {
  const s = String(status || '').toLowerCase()
  const style =
    s === 'active' ? 'bg-green-100 text-green-800' :
    s === 'trialing' ? 'bg-blue-100 text-blue-800' :
    s === 'past_due' ? 'bg-yellow-100 text-yellow-800' :
    s === 'canceled' ? 'bg-red-100 text-red-800' :
    'bg-[#f5f5f5] text-[#6b5f55]'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style}`}>
      {status || 'unknown'}
    </span>
  )
}

function ChannelBadge({ channel }: { channel: string | null }) {
  if (channel === 'apple_iap') {
    return (
      <span className="rounded-full bg-[#191919] px-2.5 py-0.5 text-[11px] font-semibold text-white">
        Apple IAP
      </span>
    )
  }
  return (
    <span className="rounded-full border border-[#dcdcdc] px-2.5 py-0.5 text-[11px] font-semibold text-[#4a4a4a]">
      Stripe
    </span>
  )
}

export default function AdminSubscriptionsPage() {
  const [items, setItems] = useState<SubscriptionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<SubscriptionItem | null>(null)

  const load = useCallback(async (q: string, cur: string | null) => {
    setLoading(true)
    setNotice('')
    const params = new URLSearchParams()
    if (q) params.set('query', q)
    if (cur) params.set('cursor', cur)
    const res = await fetch(`/api/admin/subscriptions?${params.toString()}`)
    if (!res.ok) {
      setNotice('Unable to load subscriptions.')
      setLoading(false)
      return
    }
    const data = await res.json()
    setItems(data.items || [])
    setNextCursor(data.next_cursor || null)
    setLoading(false)
  }, [])

  useEffect(() => { void load(query, cursor) }, [load, query, cursor])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setCursorStack([])
    setCursor(null)
    setQuery(inputValue.trim())
  }

  const goNext = () => {
    if (!nextCursor) return
    setCursorStack((prev) => [...prev, cursor ?? ''])
    setCursor(nextCursor)
  }

  const goPrev = () => {
    const stack = [...cursorStack]
    const prev = stack.pop() ?? null
    setCursorStack(stack)
    setCursor(prev || null)
  }

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <main className="page-shell">
      <div className="relative z-10 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Subscriptions</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Stripe and Apple IAP subscriptions across all accounts.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Search by name or email…"
                className="flex-1 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-2xl border border-[#191919] bg-[#191919] px-4 py-2 text-sm font-semibold text-white"
              >
                Search
              </button>
              {query && (
                <button
                  type="button"
                  onClick={() => { setInputValue(''); setQuery(''); setCursor(null); setCursorStack([]) }}
                  className="rounded-2xl border border-[#dcdcdc] px-4 py-2 text-sm font-semibold text-[#191919]"
                >
                  Clear
                </button>
              )}
            </form>

            {notice && <p className="text-sm text-[#6b5f55]">{notice}</p>}

            {loading ? (
              <LoadingState label="Loading subscriptions…" />
            ) : items.length === 0 ? (
              <EmptyState title="No subscriptions found." description={query ? 'Try a different search.' : 'No subscriptions on record yet.'} />
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <button
                    key={item.user_id}
                    type="button"
                    onClick={() => setSelected(item)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-left text-sm transition hover:border-[#191919]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[#191919]">{item.full_name || item.email || 'Unknown'}</p>
                      <p className="truncate text-xs text-[#6b5f55]">{item.email}</p>
                      <p className="mt-1 text-xs text-[#6b5f55]">
                        {item.plan_key || '—'} · {item.billing_interval} · {item.billing_role || '—'}
                        {item.active_seat_count !== null ? ` · ${item.active_seat_count} active seat${item.active_seat_count !== 1 ? 's' : ''}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <ChannelBadge channel={item.purchase_channel} />
                      <StatusBadge status={item.status} />
                    </div>
                  </button>
                ))}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    disabled={cursorStack.length === 0}
                    onClick={goPrev}
                    className="rounded-full border border-[#dcdcdc] px-4 py-1.5 text-xs font-semibold text-[#191919] disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    disabled={!nextCursor}
                    onClick={goNext}
                    className="rounded-full border border-[#dcdcdc] px-4 py-1.5 text-xs font-semibold text-[#191919] disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-[500] flex items-end justify-center bg-black/45 backdrop-blur-[2px] px-4 pb-4 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null) }}
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[#191919] bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#dcdcdc] px-6 pb-4 pt-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Subscription detail</p>
                <h2 className="mt-1 text-xl font-semibold text-[#191919]">{selected.full_name || selected.email || 'Unknown'}</h2>
                <p className="text-sm text-[#6b5f55]">{selected.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
              {selected.purchase_channel === 'apple_iap' && (
                <div className="rounded-2xl border border-[#191919] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b80f0a]">Apple IAP subscription</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">
                    This subscription is managed by Apple. Cancellations and refunds must be processed through App Store Connect or by the subscriber in their iPhone Settings. Do not attempt to modify via Stripe.
                  </p>
                </div>
              )}

              {[
                { label: 'Purchase channel', value: selected.purchase_channel || 'stripe' },
                { label: 'Plan', value: selected.plan_key || '—' },
                { label: 'Billing role', value: selected.billing_role || '—' },
                { label: 'Billing interval', value: selected.billing_interval },
                { label: 'Status', value: selected.status || '—' },
                { label: 'Cancel at period end', value: selected.cancel_at_period_end ? 'Yes' : 'No' },
                { label: 'Current period ends', value: selected.current_period_end ? fmt(selected.current_period_end) : '—' },
                { label: 'Current period started', value: selected.current_period_start ? fmt(selected.current_period_start) : '—' },
                { label: 'Trial ends', value: selected.trial_end ? fmt(selected.trial_end) : '—' },
                { label: 'Stripe customer', value: selected.stripe_customer_id || '—' },
                { label: 'Stripe subscription', value: selected.stripe_subscription_id || '—' },
                { label: 'Stripe price / Apple product', value: selected.stripe_price_id || selected.apple_product_id || '—' },
                { label: 'Apple environment', value: selected.apple_environment || '—' },
                ...(selected.active_seat_count !== null ? [
                  { label: 'Active seats', value: String(selected.active_seat_count) },
                  { label: 'Included seats', value: String(selected.included_seat_count ?? '—') },
                  { label: 'Additional seats', value: String(selected.additional_seat_count ?? '—') },
                ] : []),
                { label: 'User ID', value: selected.user_id },
                ...(selected.apple_original_transaction_id ? [
                  { label: 'Apple original transaction ID', value: selected.apple_original_transaction_id },
                ] : []),
              ].map((row) => (
                <div key={row.label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">{row.label}</p>
                  <p className="mt-1 break-all font-semibold text-[#191919]">{row.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
