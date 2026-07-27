'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

type NotificationItem = {
  notification_uuid: string
  notification_type: string | null
  subtype: string | null
  environment: string | null
  original_transaction_id: string | null
  status: string
  last_error: string | null
  signed_date: string | null
  processed_at: string | null
  created_at: string
}

type StatusCounts = { processing: number; processed: number; ignored: number; failed: number }

const STATUS_TABS = ['all', 'failed', 'processing', 'processed', 'ignored'] as const
type Tab = typeof STATUS_TABS[number]

function StatusBadge({ status }: { status: string }) {
  const style =
    status === 'processed' ? 'bg-green-100 text-green-800' :
    status === 'failed' ? 'bg-red-100 text-red-800' :
    status === 'processing' ? 'bg-blue-100 text-blue-800' :
    'bg-[#f5f5f5] text-[#6b5f55]'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style}`}>
      {status}
    </span>
  )
}

function EnvBadge({ env }: { env: string | null }) {
  if (!env) return null
  const isSandbox = env.toLowerCase() === 'sandbox'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isSandbox ? 'bg-yellow-100 text-yellow-800' : 'bg-[#f5f5f5] text-[#4a4a4a]'}`}>
      {env}
    </span>
  )
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export default function AppleNotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [counts, setCounts] = useState<StatusCounts>({ processing: 0, processed: 0, ignored: 0, failed: 0 })
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState<NotificationItem | null>(null)

  const load = useCallback(async (activeTab: Tab, cur: string | null) => {
    setLoading(true)
    setNotice('')
    const params = new URLSearchParams()
    if (activeTab !== 'all') params.set('status', activeTab)
    if (cur) params.set('cursor', cur)
    const res = await fetch(`/api/admin/apple-notifications?${params.toString()}`)
    if (!res.ok) { setNotice('Unable to load notifications.'); setLoading(false); return }
    const data = await res.json()
    setItems(data.items || [])
    setNextCursor(data.next_cursor || null)
    if (data.counts) setCounts(data.counts)
    setLoading(false)
  }, [])

  useEffect(() => { void load(tab, cursor) }, [load, tab, cursor])

  const switchTab = (next: Tab) => {
    setTab(next)
    setCursor(null)
    setCursorStack([])
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

  return (
    <main className="page-shell">
      <div className="relative z-10 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Apple IAP Notifications</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">App Store Server Notifications from Apple for IAP events.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-4">
            {counts.failed > 0 && (
              <div className="rounded-2xl border border-[#b80f0a] bg-red-50 px-4 py-3 text-sm">
                <span className="font-semibold text-[#b80f0a]">{counts.failed} failed notification{counts.failed !== 1 ? 's' : ''}</span>
                <span className="text-[#4a4a4a]"> — these indicate IAP sync issues that may need investigation.</span>
              </div>
            )}
            {counts.processing > 0 && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <span className="font-semibold">{counts.processing} notification{counts.processing !== 1 ? 's' : ''} still processing.</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                    tab === t ? 'border-[#191919] bg-[#191919] text-white' : 'border-[#dcdcdc] text-[#191919] hover:border-[#191919]'
                  }`}
                >
                  {t === 'all' ? `All (${Object.values(counts).reduce((a, b) => a + b, 0)})` : `${t} (${counts[t as keyof StatusCounts] ?? 0})`}
                </button>
              ))}
            </div>

            {notice && <p className="text-sm text-[#6b5f55]">{notice}</p>}

            {loading ? (
              <LoadingState label="Loading notifications…" />
            ) : items.length === 0 ? (
              <EmptyState title="No notifications found." description={tab !== 'all' ? `No ${tab} notifications.` : 'No App Store notifications on record.'} />
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <button
                    key={item.notification_uuid}
                    type="button"
                    onClick={() => setSelected(item)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-left text-sm transition hover:border-[#191919]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#191919]">
                        {item.notification_type || 'Unknown'}{item.subtype ? ` · ${item.subtype}` : ''}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[#6b5f55]">
                        {item.original_transaction_id ? `txn: ${item.original_transaction_id}` : 'No transaction ID'}
                      </p>
                      <p className="mt-0.5 text-xs text-[#6b5f55]">{fmt(item.created_at)}</p>
                      {item.status === 'failed' && item.last_error && (
                        <p className="mt-1 truncate text-xs text-[#b80f0a]">{item.last_error}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <EnvBadge env={item.environment} />
                      <StatusBadge status={item.status} />
                    </div>
                  </button>
                ))}

                <div className="flex items-center justify-between pt-1">
                  <button type="button" disabled={cursorStack.length === 0} onClick={goPrev}
                    className="rounded-full border border-[#dcdcdc] px-4 py-1.5 text-xs font-semibold text-[#191919] disabled:opacity-40">
                    ← Previous
                  </button>
                  <button type="button" disabled={!nextCursor} onClick={goNext}
                    className="rounded-full border border-[#dcdcdc] px-4 py-1.5 text-xs font-semibold text-[#191919] disabled:opacity-40">
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
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Notification detail</p>
                <h2 className="mt-1 text-xl font-semibold text-[#191919]">
                  {selected.notification_type || 'Unknown'}{selected.subtype ? ` · ${selected.subtype}` : ''}
                </h2>
              </div>
              <button type="button" onClick={() => setSelected(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold">
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
              {selected.status === 'failed' && selected.last_error && (
                <div className="rounded-2xl border border-[#b80f0a] bg-red-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b80f0a]">Error</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">{selected.last_error}</p>
                </div>
              )}
              {[
                { label: 'Status', value: selected.status },
                { label: 'Environment', value: selected.environment || '—' },
                { label: 'Notification type', value: selected.notification_type || '—' },
                { label: 'Subtype', value: selected.subtype || '—' },
                { label: 'Original transaction ID', value: selected.original_transaction_id || '—' },
                { label: 'Signed date', value: fmt(selected.signed_date) },
                { label: 'Processed at', value: fmt(selected.processed_at) },
                { label: 'Received at', value: fmt(selected.created_at) },
                { label: 'Notification UUID', value: selected.notification_uuid },
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
