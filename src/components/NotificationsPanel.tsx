'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Toast from '@/components/Toast'

type NotificationItem = {
  id: string
  title: string
  body?: string | null
  action_url?: string | null
  read_at?: string | null
  created_at: string
  type?: string | null
  data?: {
    category?: string | null
    channels?: string[] | string | null
    priority?: 'low' | 'medium' | 'high' | string | null
    action_required?: boolean | null
    cta_label?: string | null
    athlete_label?: string | null
    coach_name?: string | null
    session_title?: string | null
    session_type?: string | null
    formatted_date?: string | null
    formatted_time?: string | null
    location?: string | null
    notes?: string | null
  } | null
}

type NotificationsPanelProps = {
  heading: string
}

export default function NotificationsPanel({ heading }: NotificationsPanelProps) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorLoading, setErrorLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastActionLabel, setToastActionLabel] = useState<string | undefined>()
  const [toastAction, setToastAction] = useState<(() => void) | undefined>()
  const [toastDuration, setToastDuration] = useState<number | undefined>()
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{
    ids: string[]
    snapshot: NotificationItem[]
    timer: ReturnType<typeof setTimeout> | null
  } | null>(null)

  const showToast = useCallback(
    (message: string, actionLabel?: string, action?: () => void, durationMs?: number) => {
    setToastMessage(message)
    setToastActionLabel(actionLabel)
    setToastAction(() => action)
    setToastDuration(durationMs)
  },
    []
  )

  const loadNotifications = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setErrorLoading(false)
      try {
        const response = await fetch('/api/notifications')
        if (!response.ok) {
          throw new Error('Unable to load notifications')
        }
        const payload = await response.json()
        setItems(payload.notifications || [])
        if (isRefresh) {
          showToast('Notifications refreshed.')
        }
      } catch (error) {
        console.error('Unable to load notifications:', error)
        setErrorLoading(true)
        setItems([])
        if (isRefresh) {
          showToast('Unable to refresh notifications; showing cached items.')
        }
      } finally {
        if (isRefresh) {
          setRefreshing(false)
        } else {
          setLoading(false)
        }
      }
    },
    [showToast]
  )

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  useEffect(() => {
    setSelectedIds([])
  }, [items, searchTerm, activeCategory, unreadOnly, startDate, endDate])

  const categoryOptions = ['All', 'Sessions', 'Payments', 'Messages', 'System']
  const typeCategoryMap = useMemo<Record<string, string>>(
    () => ({
      session_booked: 'Sessions',
      session_payment: 'Payments',
      marketplace_order: 'Payments',
      review_submitted: 'System',
      org_invite: 'Messages',
      org_invite_approval: 'Messages',
      org_invite_declined: 'Messages',
      org_invite_approved: 'Messages',
      message_new: 'Messages',
    }),
    [],
  )

  const normalizeCategory = (value?: string | null) => {
    if (!value) return null
    const normalized = value.toLowerCase()
    if (normalized.includes('session') || normalized.includes('calendar') || normalized.includes('booking')) {
      return 'Sessions'
    }
    if (
      normalized.includes('payment') ||
      normalized.includes('invoice') ||
      normalized.includes('receipt') ||
      normalized.includes('marketplace') ||
      normalized.includes('order')
    ) {
      return 'Payments'
    }
    if (normalized.includes('message') || normalized.includes('invite') || normalized.includes('chat') || normalized.includes('thread')) {
      return 'Messages'
    }
    if (normalized.includes('system') || normalized.includes('account') || normalized.includes('admin') || normalized.includes('review')) {
      return 'System'
    }
    return null
  }

  const resolveCategory = useCallback((item: NotificationItem) => {
    const directCategory = item.data?.category?.toString().trim()
    if (directCategory) {
      const normalizedCategory = normalizeCategory(directCategory)
      return normalizedCategory || directCategory
    }
    const type = item.type?.toLowerCase() || ''
    if (typeCategoryMap[type]) return typeCategoryMap[type]
    const normalizedType = normalizeCategory(type)
    return normalizedType || 'System'
  }, [typeCategoryMap])

  const resolveChannels = (item: NotificationItem) => {
    const channels = item.data?.channels
    if (!channels) return []
    if (Array.isArray(channels)) return channels
    return [channels]
  }

  const filteredItems = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase()
    return items.filter((item) => {
      const matchesUnread = !unreadOnly || !item.read_at
      if (!matchesUnread) return false
      const category = resolveCategory(item)
      const matchesCategory = activeCategory === 'All' || category === activeCategory
      if (!matchesCategory) return false
      if (lowerSearch) {
        const haystack = `${item.title} ${item.body ?? ''}`.toLowerCase()
        if (!haystack.includes(lowerSearch)) return false
      }
      if (startDate) {
        const start = new Date(`${startDate}T00:00:00`)
        if (new Date(item.created_at).getTime() < start.getTime()) return false
      }
      if (endDate) {
        const end = new Date(`${endDate}T23:59:59`)
        if (new Date(item.created_at).getTime() > end.getTime()) return false
      }
      return true
    })
  }, [items, searchTerm, activeCategory, unreadOnly, startDate, endDate, resolveCategory])

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      const aUnread = !a.read_at
      const bUnread = !b.read_at
      if (aUnread !== bUnread) {
        return aUnread ? -1 : 1
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [filteredItems])

  const getDateBucket = (dateStr: string) => {
    const now = new Date()
    const date = new Date(dateStr)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayStart = new Date(todayStart.getTime() - 86400000)
    const weekStart = new Date(todayStart.getTime() - 6 * 86400000)
    if (date >= todayStart) return 'Today'
    if (date >= yesterdayStart) return 'Yesterday'
    if (date >= weekStart) return 'This week'
    return 'Older'
  }

  const unreadIds = items.filter((item) => !item.read_at).map((item) => item.id)
  const readIds = items.filter((item) => item.read_at).map((item) => item.id)
  const visibleIds = sortedItems.map((item) => item.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
  const unreadCount = items.filter((item) => !item.read_at).length

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      showToast('Notifications marked as read.')
    } catch (error) {
      console.error('Unable to mark notifications read:', error)
      showToast('Unable to mark notifications read right now.')
    }
    setItems((prev) =>
      prev.map((item) => (ids.includes(item.id) ? { ...item, read_at: new Date().toISOString() } : item))
    )
  }

  const commitDelete = async (ids: string[], { silentToast = false } = {}) => {
    if (ids.length === 0) return
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!silentToast) showToast('Notifications removed.')
    } catch (error) {
      console.error('Unable to delete notifications:', error)
      showToast('Unable to remove notifications right now.')
      return
    }
  }

  const deleteNotifications = async (ids: string[]) => {
    if (ids.length === 0) return
    await commitDelete(ids)
    setItems((prev) => prev.filter((item) => !ids.includes(item.id)))
  }

  const stageDelete = (ids: string[], snapshot: NotificationItem[]) => {
    if (ids.length === 0) return
    if (pendingDelete?.timer) {
      clearTimeout(pendingDelete.timer)
    }
    setItems((prev) => prev.filter((item) => !ids.includes(item.id)))
    const timer = setTimeout(async () => {
      await commitDelete(ids, { silentToast: true })
      setPendingDelete(null)
    }, 2600)
    setPendingDelete({ ids, snapshot, timer })
    showToast(
      'Notifications removed.',
      'Undo',
      () => {
      if (timer) clearTimeout(timer)
      setPendingDelete(null)
      setItems(snapshot)
      showToast('Removal undone.')
      },
      7000
    )
  }

  const statusLabel = errorLoading ? 'Offline' : 'Live'

  const handleRefresh = () => {
    loadNotifications({ isRefresh: true })
  }

  return (
    <>
      <section className="glass-card min-w-0 border border-[#191919] bg-white p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div>
              <h1 className="display text-2xl font-semibold text-[#191919] sm:text-3xl">{heading}</h1>
              <p className="mt-2 text-sm leading-6 text-[#4a4a4a]">Invites, reminders, and platform updates.</p>
            </div>
            <span
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                errorLoading
                  ? 'border-[#191919] bg-[#f5f5f5] text-[#191919]'
                  : 'border-[#191919] bg-white text-[#191919]'
              }`}
            >
              {statusLabel}
            </span>
            <span className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#191919]">
              {unreadCount} unread
            </span>
          </div>
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <button
              type="button"
              className="w-full rounded-full border border-[#191919] px-4 py-3 text-sm font-semibold text-[#191919] transition hover:bg-[#191919] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-2"
              onClick={handleRefresh}
              disabled={loading || refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              className="w-full rounded-full border border-[#191919] px-4 py-3 text-sm font-semibold text-[#191919] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-2"
              onClick={() => markRead(unreadIds)}
              disabled={unreadIds.length === 0 || loading}
            >
              Mark all read
            </button>
            <button
              type="button"
              className="w-full rounded-full border border-[#191919] px-4 py-3 text-sm font-semibold text-[#191919] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-2"
              onClick={() => deleteNotifications(readIds)}
              disabled={readIds.length === 0 || loading}
            >
              Delete read
            </button>
            <button
              type="button"
              className="w-full rounded-full border border-[#191919] px-4 py-3 text-sm font-semibold text-[#191919] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-2"
              onClick={() => setDeleteAllOpen(true)}
              disabled={items.length === 0 || loading}
            >
              Delete all
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search notifications"
                className="w-full min-w-0 rounded-full border border-[#dcdcdc] px-4 py-3 text-sm text-[#191919] focus:border-[#191919] focus:outline-none sm:py-2"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUnreadOnly((prev) => !prev)}
                  className={`rounded-full border px-4 py-2.5 text-xs font-semibold transition ${
                    unreadOnly
                      ? 'border-[#b80f0a] bg-[#fff6f5] text-[#b80f0a]'
                      : 'border-[#dcdcdc] bg-white text-[#191919] hover:border-[#191919]'
                  }`}
                >
                  Unread only
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  {categoryOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setActiveCategory(option)}
                      className={`rounded-full border px-3 py-2.5 text-xs font-semibold transition ${
                        activeCategory === option
                          ? 'border-[#191919] bg-white text-[#191919]'
                          : 'border-[#dcdcdc] bg-transparent text-[#4a4a4a] hover:border-[#191919]'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center">
              <div className="grid gap-1 text-xs text-[#4a4a4a] sm:min-w-[148px]">
                <span>From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="w-full rounded-full border border-[#dcdcdc] bg-white px-3 py-2.5 text-xs text-[#191919]"
                />
              </div>
              <div className="grid gap-1 text-xs text-[#4a4a4a] sm:min-w-[148px]">
                <span>To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="w-full rounded-full border border-[#dcdcdc] bg-white px-3 py-2.5 text-xs text-[#191919]"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  setActiveCategory('All')
                  setUnreadOnly(false)
                  setStartDate('')
                  setEndDate('')
                }}
                className="w-full rounded-full border border-[#dcdcdc] bg-white px-3 py-2.5 text-xs font-semibold text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919] sm:w-auto"
              >
                Clear
              </button>
            </div>
          </div>
          {selectedIds.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-[#b80f0a] bg-[#fff6f5] px-4 py-3 text-xs text-[#191919] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <span>
                {selectedIds.length} selected
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-[#191919] bg-white px-3 py-2 text-[11px] font-semibold text-[#191919]"
                  onClick={() => markRead(selectedIds)}
                >
                  Mark read
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] bg-white px-3 py-2 text-[11px] font-semibold text-[#191919]"
                  onClick={() => deleteNotifications(selectedIds)}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-3 text-xs text-[#4a4a4a] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span>{sortedItems.length} shown</span>
            <span>•</span>
            <button
              type="button"
              className="rounded-full border border-[#dcdcdc] bg-white px-3 py-2 text-[11px] font-semibold text-[#191919]"
              onClick={() => {
                if (allVisibleSelected) {
                  setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)))
                } else {
                  setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])))
                }
              }}
              disabled={visibleIds.length === 0}
            >
              {allVisibleSelected ? 'Clear selection' : 'Select all visible'}
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-3 text-sm">
          {loading ? (
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4 text-[#4a4a4a] animate-pulse">
              Loading notifications...
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4 text-[#4a4a4a]">
              No notifications match these filters.
            </div>
          ) : (
            (() => {
              const rendered: React.ReactNode[] = []
              let lastBucket = ''
              sortedItems.forEach((item) => {
                const bucket = getDateBucket(item.created_at)
                if (bucket !== lastBucket) {
                  lastBucket = bucket
                  rendered.push(
                    <p key={`bucket-${bucket}`} className="pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">
                      {bucket}
                    </p>
                  )
                }
              const category = resolveCategory(item)
              const channels = resolveChannels(item)
              const priority = item.data?.priority
              const actionRequired = item.data?.action_required
              const createdLabel = new Date(item.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
              rendered.push(
                <div
                  key={item.id}
                  className={`rounded-2xl border px-4 py-3 ${
                    item.read_at ? 'border-[#dcdcdc] bg-white' : 'border-[#b80f0a] bg-[#fff6f5]'
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-[#b80f0a]"
                        checked={selectedIds.includes(item.id)}
                        onChange={(event) => {
                          setSelectedIds((prev) =>
                            event.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id)
                          )
                        }}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-[#191919]">{item.title}</p>
                          <span className="rounded-full border border-[#dcdcdc] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]">
                            {category}
                          </span>
                          {item.data?.athlete_label ? (
                            <span className="rounded-full border border-[#191919] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#191919]">
                              {item.data.athlete_label}
                            </span>
                          ) : null}
                          {actionRequired ? (
                            <span className="rounded-full border border-[#b80f0a] bg-[#fff6f5] px-2 py-0.5 text-[10px] font-semibold text-[#b80f0a]">
                              Action required
                            </span>
                          ) : null}
                          {priority ? (
                            <span className="rounded-full border border-[#191919] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#191919]">
                              {priority.toString().toUpperCase()} priority
                            </span>
                          ) : null}
                        </div>
                        {item.body && expandedId !== item.id ? (
                          <p className="mt-1 text-xs text-[#4a4a4a] line-clamp-2">{item.body.split('\n')[0]}</p>
                        ) : null}
                        {expandedId === item.id ? (
                          <div className="mt-2 rounded-xl border border-[#dcdcdc] bg-[#f9f9f9] px-3 py-3 text-xs text-[#191919] space-y-1.5">
                            {item.data?.coach_name && (
                              <p className="text-[#4a4a4a]">From: <span className="font-semibold text-[#191919]">{item.data.coach_name}</span></p>
                            )}
                            {item.data?.athlete_label && (
                              <p className="text-[#4a4a4a]">Athlete: <span className="font-semibold text-[#191919]">{item.data.athlete_label}</span></p>
                            )}
                            {item.data?.session_title && (
                              <p className="font-semibold text-[#191919]">{item.data.session_title}</p>
                            )}
                            {item.data?.session_type && (
                              <p className="text-[#4a4a4a] capitalize">{item.data.session_type}</p>
                            )}
                            {item.data?.formatted_date && (
                              <p>📅 {item.data.formatted_date}{item.data.formatted_time ? ` at ${item.data.formatted_time}` : ''}</p>
                            )}
                            {item.data?.location && (
                              <p>📍 {item.data.location}</p>
                            )}
                            {item.data?.notes && (
                              <p className="text-[#4a4a4a] whitespace-pre-line">{item.data.notes}</p>
                            )}
                            {!item.data?.coach_name && item.body && (
                              <p className="whitespace-pre-line">{item.body}</p>
                            )}
                          </div>
                        ) : null}
                        {channels.length > 0 ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {channels.map((channel) => (
                              <span
                                key={`${item.id}-${channel}`}
                                className="rounded-full border border-[#dcdcdc] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]"
                              >
                                {channel.toString().replace(/[_-]/g, ' ')}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className="mt-2 text-xs font-semibold text-[#b80f0a]"
                          onClick={() => {
                            setExpandedId((prev) => (prev === item.id ? null : item.id))
                            if (!item.read_at) markRead([item.id])
                          }}
                        >
                          {expandedId === item.id ? 'Hide details' : (item.data?.cta_label || 'View details')}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-row items-center justify-between gap-2 text-xs text-[#4a4a4a] lg:flex-col lg:items-end">
                      <span>{createdLabel}</span>
                      {!item.read_at ? (
                        <button
                          type="button"
                          className="rounded-full border border-[#191919] px-3 py-2 text-[11px] font-semibold text-[#191919] disabled:opacity-50"
                          onClick={() => markRead([item.id])}
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
              })
              return rendered
            })()
          )}
        </div>
      </section>
      {deleteAllOpen ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Confirm delete</p>
                <h2 className="mt-2 text-xl font-semibold text-[#191919]">Delete all notifications?</h2>
                <p className="mt-2 text-sm text-[#4a4a4a]">
                  This removes {items.length} notifications from your inbox. You can undo right after deleting.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteAllOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteAllOpen(false)}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteAllOpen(false)
                  stageDelete(
                    items.map((item) => item.id),
                    items
                  )
                }}
                className="rounded-full border border-[#b80f0a] bg-white px-4 py-2 text-xs font-semibold text-[#191919] transition hover:bg-[#b80f0a] hover:text-white"
              >
                Delete all
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <Toast
        message={toastMessage}
        onClose={() => {
          setToastMessage('')
          setToastActionLabel(undefined)
          setToastAction(undefined)
          setToastDuration(undefined)
        }}
        actionLabel={toastActionLabel}
        onAction={toastAction}
        durationMs={toastDuration}
      />
    </>
  )
}
