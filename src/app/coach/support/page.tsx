'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import CoachSidebar from '@/components/CoachSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Toast from '@/components/Toast'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

type TicketRow = {
  id: string
  subject: string
  status: string
  priority: string
  last_message_preview?: string | null
  last_message_at?: string | null
  created_at?: string | null
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

export default function CoachSupportPage() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState('medium')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [loadingTickets, setLoadingTickets] = useState(true)

  const loadTickets = useCallback(async () => {
    const response = await fetch('/api/support/tickets')
    if (!response.ok) return
    const payload = await response.json()
    setTickets(payload.tickets || [])
    setLoadingTickets(false)
  }, [])

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUserEmail(data.user?.email ?? null)
    }
    loadUser()
    loadTickets()
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
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setToast(payload?.error || 'Unable to send support request.')
      setLoading(false)
      return
    }
    setSubject('')
    setMessage('')
    setPriority('medium')
    setLoading(false)
    setToast('Support request sent.')
    loadTickets()
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-[#191919]">Support</h1>
              <p className="mt-1 text-sm text-[#4a4a4a]">
                Send a request and we will respond as soon as possible.{userEmail ? ` Signed in as ${userEmail}.` : ''}
              </p>
            </div>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-sm font-semibold text-[#191919]">New request</h2>
              <div className="mt-4 space-y-4 text-sm">
                <label className="space-y-2 block">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Subject</span>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3"
                    placeholder="Brief summary"
                  />
                </label>
                <label className="space-y-2 block">
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
                <label className="space-y-2 block">
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
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send support request'}
                </button>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-sm font-semibold text-[#191919]">My requests</h2>
              <div className="mt-4">
                {loadingTickets ? (
                  <LoadingState label="Loading your requests..." />
                ) : tickets.length === 0 ? (
                  <EmptyState title="No requests yet." description="Your submitted requests will appear here." />
                ) : (
                  <div className="space-y-3">
                    {tickets.map((ticket) => {
                      const statusLabel = STATUS_LABEL[ticket.status] || ticket.status
                      const isResolved = ticket.status === 'resolved'
                      return (
                        <div key={ticket.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-[#191919]">{ticket.subject}</p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                isResolved ? 'border-[#6b5f55] text-[#6b5f55]' : 'border-[#191919] text-[#191919]'
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          {ticket.last_message_preview && (
                            <p className="mt-1 text-sm text-[#4a4a4a] line-clamp-2">{ticket.last_message_preview}</p>
                          )}
                          <p className="mt-2 text-xs text-[#6b5f55]">Submitted {formatDate(ticket.created_at)}</p>
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
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
