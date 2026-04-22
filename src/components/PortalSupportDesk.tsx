'use client'

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Toast from '@/components/Toast'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

type BannerRole = 'coach' | 'athlete' | 'admin' | 'guardian'

type TicketRow = {
  id: string
  subject: string
  status: string
  priority: string
  last_message_preview?: string | null
  last_message_at?: string | null
  created_at?: string | null
}

type MessageRow = {
  id: string
  ticket_id: string
  sender_role: string
  sender_name?: string | null
  body: string
  created_at?: string | null
  is_internal?: boolean | null
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  pending: 'Pending',
  resolved: 'Resolved',
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const formatRoleLabel = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Support'
  if (normalized === 'admin') return 'Coaches Hive support'
  if (normalized === 'assistant_coach') return 'Assistant coach'
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function PortalSupportDesk({
  bannerRole,
  Sidebar,
}: {
  bannerRole: BannerRole
  Sidebar: ComponentType
}) {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState('medium')
  const [loading, setLoading] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)
  const [toast, setToast] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [replyText, setReplyText] = useState('')

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true)
    const response = await fetch('/api/support/tickets')
    if (!response.ok) {
      setLoadingTickets(false)
      setToast('Unable to load support tickets.')
      return
    }
    const payload = await response.json().catch(() => null)
    const nextTickets = (payload?.tickets || []) as TicketRow[]
    setTickets(nextTickets)
    setSelectedId((current) => {
      if (current && nextTickets.some((ticket) => ticket.id === current)) return current
      return nextTickets[0]?.id || null
    })
    setLoadingTickets(false)
  }, [])

  const loadMessages = useCallback(async (ticketId: string) => {
    setLoadingMessages(true)
    const response = await fetch(`/api/support/messages?ticket_id=${encodeURIComponent(ticketId)}`)
    if (!response.ok) {
      setMessages([])
      setLoadingMessages(false)
      setToast('Unable to load support thread.')
      return
    }
    const payload = await response.json().catch(() => null)
    setMessages((payload?.messages || []) as MessageRow[])
    setLoadingMessages(false)
  }, [])

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUserEmail(data.user?.email ?? null)
    }
    void loadUser()
    void loadTickets()
  }, [supabase, loadTickets])

  useEffect(() => {
    if (!searchParams) return
    const nextSubject = searchParams.get('subject') || ''
    const nextMessage = searchParams.get('message') || ''
    const nextPriority = searchParams.get('priority') || ''
    if (nextSubject && !subject) setSubject(nextSubject)
    if (nextMessage && !message) setMessage(nextMessage)
    if (nextPriority && priority === 'medium') setPriority(nextPriority)
  }, [message, priority, searchParams, subject])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    void loadMessages(selectedId)
  }, [selectedId, loadMessages])

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) || null,
    [tickets, selectedId],
  )

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      setToast('Add a subject and message.')
      return
    }
    setLoading(true)
    const response = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, message, priority }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setToast(payload?.error || 'Unable to send support request.')
      setLoading(false)
      return
    }
    const newTicketId = String(payload?.ticket?.id || '').trim() || null
    setSubject('')
    setMessage('')
    setPriority('medium')
    setLoading(false)
    setToast('Support request sent.')
    await loadTickets()
    if (newTicketId) {
      setSelectedId(newTicketId)
      await loadMessages(newTicketId)
    }
  }

  const handleSendReply = async () => {
    if (!selectedTicket) return
    const trimmedReply = replyText.trim()
    if (!trimmedReply) {
      setToast('Add a reply before sending.')
      return
    }

    setSendingReply(true)
    const response = await fetch('/api/support/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket_id: selectedTicket.id,
        body: trimmedReply,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setToast(payload?.error || 'Unable to send reply.')
      setSendingReply(false)
      return
    }

    setReplyText('')
    await Promise.all([loadTickets(), loadMessages(selectedTicket.id)])
    setSendingReply(false)
    setToast('Reply sent.')
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role={bannerRole} />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <Sidebar />
          <div className="min-w-0 space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-[#191919]">Support</h1>
              <p className="mt-1 text-sm text-[#4a4a4a]">
                Send a request and track the full support conversation here.{userEmail ? ` Signed in as ${userEmail}.` : ''}
              </p>
            </div>

            <section className="glass-card border border-[#191919] bg-white p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-[#191919]">New request</h2>
              <div className="mt-4 space-y-4 text-sm">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Subject</span>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3"
                    placeholder="Brief summary"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Priority</span>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Message</span>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={5}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3"
                    placeholder="Include any details or links that help us solve this fast."
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="w-full rounded-full bg-[#b80f0a] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 sm:w-auto sm:py-2"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send support request'}
                </button>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[#191919]">Support conversations</h2>
                <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                  {tickets.length} ticket{tickets.length === 1 ? '' : 's'}
                </span>
              </div>

              {loadingTickets ? (
                <div className="mt-4">
                  <LoadingState label="Loading your requests..." />
                </div>
              ) : tickets.length === 0 ? (
                <div className="mt-4">
                  <EmptyState title="No requests yet." description="Your submitted requests and support replies will appear here." />
                </div>
              ) : (
                <div className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    {tickets.map((ticket) => {
                      const isActive = selectedTicket?.id === ticket.id
                      const statusLabel = STATUS_LABEL[ticket.status] || ticket.status
                      return (
                        <button
                          key={ticket.id}
                          type="button"
                          onClick={() => setSelectedId(ticket.id)}
                          className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                            isActive ? 'border-[#191919] bg-white' : 'border-[#dcdcdc] bg-[#f5f5f5]'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <p className="min-w-0 flex-1 text-sm font-semibold text-[#191919]">{ticket.subject}</p>
                            <span className="rounded-full border border-[#191919] px-2 py-0.5 text-[11px] font-semibold text-[#191919]">
                              {statusLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#6b5f55]">
                            {ticket.priority} priority
                          </p>
                          {ticket.last_message_preview ? (
                            <p className="mt-2 line-clamp-2 text-sm text-[#4a4a4a]">{ticket.last_message_preview}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-[#6b5f55]">
                            Updated {formatDateTime(ticket.last_message_at || ticket.created_at)}
                          </p>
                        </button>
                      )
                    })}
                  </div>

                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                    {selectedTicket ? (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-semibold text-[#191919]">{selectedTicket.subject}</p>
                            <p className="mt-1 text-xs text-[#6b5f55]">
                              {STATUS_LABEL[selectedTicket.status] || selectedTicket.status} · {selectedTicket.priority} priority · Opened {formatDate(selectedTicket.created_at)}
                            </p>
                          </div>
                          <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                            Ticket {selectedTicket.id.slice(0, 8)}
                          </span>
                        </div>

                        <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                          {loadingMessages ? (
                            <LoadingState label="Loading conversation..." />
                          ) : messages.length === 0 ? (
                            <EmptyState title="No visible replies yet." description="New support replies will appear here." />
                          ) : (
                            messages.map((entry) => {
                              const fromSupport = String(entry.sender_role || '').toLowerCase() === 'admin'
                              return (
                                <div
                                  key={entry.id}
                                  className={`rounded-2xl border px-4 py-3 ${
                                    fromSupport
                                      ? 'border-[#191919] bg-white text-[#191919]'
                                      : 'border-[#dcdcdc] bg-[#fff7f5] text-[#191919]'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">
                                      {fromSupport ? 'Coaches Hive support' : formatRoleLabel(entry.sender_role)}
                                    </p>
                                    <p className="text-xs text-[#6b5f55]">{formatDateTime(entry.created_at)}</p>
                                  </div>
                                  {entry.sender_name ? (
                                    <p className="mt-1 text-xs text-[#6b5f55]">{entry.sender_name}</p>
                                  ) : null}
                                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#191919]">{entry.body}</p>
                                </div>
                              )
                            })
                          )}
                        </div>

                        <div className="mt-4 space-y-3">
                          <label className="block space-y-2">
                            <span className="text-xs font-semibold text-[#4a4a4a]">Reply</span>
                            <textarea
                              value={replyText}
                              onChange={(event) => setReplyText(event.target.value)}
                              rows={4}
                              className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3"
                              placeholder="Reply to this support conversation."
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleSendReply}
                            disabled={sendingReply}
                            className="w-full rounded-full border border-[#191919] bg-white px-4 py-3 text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-white disabled:opacity-60 sm:w-auto sm:py-2"
                          >
                            {sendingReply ? 'Sending...' : 'Send reply'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <EmptyState title="Select a ticket." description="Choose a support request to view the full conversation." />
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
