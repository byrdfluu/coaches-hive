'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import type { SupportTemplate } from '@/lib/supportTemplates'

const statusOptions = ['open', 'pending', 'resolved'] as const
const priorityOptions = ['low', 'medium', 'high', 'urgent'] as const
const channelOptions = ['email', 'in_app'] as const
const queueOptions = ['support', 'sales', 'partnership'] as const

type TicketRow = {
  id: string
  subject: string
  status: string
  priority: string
  channel: string
  requester_name?: string | null
  requester_email?: string | null
  requester_role?: string | null
  org_name?: string | null
  team_name?: string | null
  assigned_to?: string | null
  last_message_preview?: string | null
  last_message_at?: string | null
  created_at?: string | null
  sla_due_at?: string | null
  sla_minutes?: number | null
  metadata?: Record<string, any> | null
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

export default function AdminSupportPage() {
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [toast, setToast] = useState('')
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [templates, setTemplates] = useState<SupportTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'pending' | 'resolved'>('open')
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'in_app'>('all')
  const [queueFilter, setQueueFilter] = useState<'all' | 'support' | 'sales' | 'partnership'>('all')
  const [search, setSearch] = useState('')
  const [replyText, setReplyText] = useState('')
  const [internalNote, setInternalNote] = useState(false)
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  const [actionUserId, setActionUserId] = useState('')
  const [actionOrderId, setActionOrderId] = useState('')
  const [actionPaymentIntentId, setActionPaymentIntentId] = useState('')
  const [actionLoading, setActionLoading] = useState<'refund' | 'lock_account' | 'export_logs' | 'schedule_followup' | ''>('')
  const [newTicket, setNewTicket] = useState({
    subject: '',
    message: '',
    channel: 'email',
    requester_name: '',
    requester_email: '',
    requester_role: 'org_admin',
    org_name: '',
    team_name: '',
    priority: 'medium',
  })

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true)
    const response = await fetch('/api/admin/support/tickets')
    if (!response.ok) {
      setToast('Unable to load support tickets.')
      setLoadingTickets(false)
      return
    }
    const payload = await response.json()
    const rows = (payload.tickets || []) as TicketRow[]
    setTickets(rows)
    if (rows.length > 0) {
      setSelectedId((prev) => prev || rows[0].id)
    }
    setLoadingTickets(false)
  }, [])

  const loadMessages = useCallback(async (ticketId: string) => {
    setLoadingMessages(true)
    const response = await fetch(`/api/admin/support/messages?ticket_id=${ticketId}`)
    if (!response.ok) {
      setToast('Unable to load messages.')
      setLoadingMessages(false)
      return
    }
    const payload = await response.json()
    setMessages(payload.messages || [])
    setLoadingMessages(false)
  }, [])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  useEffect(() => {
    let active = true
    const loadTemplates = async () => {
      const response = await fetch('/api/admin/support')
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      setTemplates(payload.config?.templates || [])
    }
    loadTemplates()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const updateNow = () => setNow(Date.now())
    updateNow()
    const interval = setInterval(updateNow, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    loadMessages(selectedId)
  }, [selectedId, loadMessages])

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) || null,
    [tickets, selectedId]
  )

  useEffect(() => {
    if (!selectedTicket) return
    const metadata = selectedTicket.metadata || {}
    setActionUserId(metadata.requester_id || '')
    setActionOrderId(metadata.order_id || '')
    setActionPaymentIntentId(metadata.payment_intent_id || '')
  }, [selectedTicket])

  const formatSla = (ticket: TicketRow) => {
    if (!ticket.sla_due_at) return { label: 'SLA n/a', overdue: false }
    if (now === null) return { label: '—', overdue: false }
    const due = new Date(ticket.sla_due_at).getTime()
    const diffMinutes = Math.round((due - now) / 60000)
    if (diffMinutes <= 0) {
      const absMinutes = Math.abs(diffMinutes)
      const overdueHours = Math.floor(absMinutes / 60)
      const overdueMinutes = absMinutes % 60
      const overdueLabel = overdueHours > 0 ? `${overdueHours}h ${overdueMinutes}m overdue` : `${overdueMinutes}m overdue`
      return { label: overdueLabel, overdue: true }
    }
    if (diffMinutes < 60) return { label: `${diffMinutes}m left`, overdue: false }
    const hours = Math.floor(diffMinutes / 60)
    const minutes = diffMinutes % 60
    return { label: `${hours}h ${minutes}m left`, overdue: false }
  }

  const getQueue = (ticket: TicketRow): 'support' | 'sales' | 'partnership' => {
    const queue = String(ticket.metadata?.queue || ticket.metadata?.request_type || '').trim().toLowerCase()
    if (queue === 'sales') return 'sales'
    if (queue === 'partnership') return 'partnership'
    return 'support'
  }

  const queueLabel = (queue: 'support' | 'sales' | 'partnership') =>
    queue === 'partnership' ? 'Partnership' : queue === 'sales' ? 'Sales' : 'Support'

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase()
    return tickets.filter((ticket) => {
      if (statusFilter !== 'all' && ticket.status !== statusFilter) return false
      if (channelFilter !== 'all' && ticket.channel !== channelFilter) return false
      if (queueFilter !== 'all' && getQueue(ticket) !== queueFilter) return false
      if (query) {
        const haystack = `${ticket.subject} ${ticket.requester_name || ''} ${ticket.requester_email || ''}`.toLowerCase()
        return haystack.includes(query)
      }
      return true
    })
  }, [tickets, statusFilter, channelFilter, queueFilter, search])

  const updateTicket = async (payload: Record<string, any>) => {
    if (!selectedTicket) return
    const response = await fetch('/api/admin/support/tickets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: selectedTicket.id, ...payload }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      setToast(data?.error || 'Unable to update ticket.')
      return
    }
    const data = await response.json()
    const updated = data.ticket as TicketRow
    setTickets((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  const handleSendReply = async () => {
    if (!selectedTicket) return
    if (!replyText.trim()) {
      setToast('Add a reply before sending.')
      return
    }
    const response = await fetch('/api/admin/support/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket_id: selectedTicket.id,
        body: replyText,
        is_internal: internalNote,
        sender_role: 'admin',
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setToast(payload?.error || 'Unable to send message.')
      return
    }
    setReplyText('')
    setInternalNote(false)
    await loadMessages(selectedTicket.id)
    await loadTickets()
    setToast(internalNote ? 'Internal note added.' : (payload?.warning || 'Reply sent.'))
  }

  const handleTemplateSelect = async (template: SupportTemplate) => {
    setReplyText(template.body)
    const response = await fetch('/api/admin/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'use_template',
        template_id: template.id,
        ticket_id: selectedTicket?.id || null,
      }),
    })
    if (!response.ok) return
    setToast(`${template.title} loaded.`)
  }

  const handleSupportAction = async (action: 'refund' | 'lock_account' | 'export_logs' | 'schedule_followup') => {
    if (!selectedTicket) return
    setActionLoading(action)
    const response = await fetch('/api/admin/support/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        ticket_id: selectedTicket.id,
        order_id: actionOrderId || undefined,
        payment_intent_id: actionPaymentIntentId || undefined,
        user_id: actionUserId || undefined,
        requester_email: selectedTicket.requester_email || undefined,
        reason: action === 'schedule_followup' ? 'Scheduled from support inbox' : undefined,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setToast(payload?.error || 'Unable to run support action.')
      setActionLoading('')
      return
    }

    if (action === 'export_logs') {
      const blob = new Blob([payload.content || ''], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.href = url
      link.download = payload.filename || 'support-logs.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setToast('Logs exported.')
    } else if (action === 'refund') {
      setToast('Refund issued.')
    } else if (action === 'schedule_followup') {
      setToast(`Follow-up scheduled${payload?.follow_up_at ? ` for ${new Date(payload.follow_up_at).toLocaleString()}` : ''}.`)
    } else {
      setToast('Account locked.')
    }

    await loadMessages(selectedTicket.id)
    await loadTickets()
    setActionLoading('')
  }

  const handleCreateTicket = async () => {
    if (!newTicket.subject.trim()) {
      setToast('Subject is required.')
      return
    }
    const response = await fetch('/api/admin/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTicket),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      setToast(data?.error || 'Unable to create ticket.')
      return
    }
    setShowNewTicket(false)
    setNewTicket({
      subject: '',
      message: '',
      channel: 'email',
      requester_name: '',
      requester_email: '',
      requester_role: 'org_admin',
      org_name: '',
      team_name: '',
      priority: 'medium',
    })
    await loadTickets()
    setToast('Ticket created.')
  }

  const handleRunSlaSweep = async () => {
    const response = await fetch('/api/admin/support/sla', { method: 'POST' })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setToast(payload?.error || 'Unable to run SLA sweep.')
      return
    }
    const payload = await response.json()
    await loadTickets()
    setToast(`SLA sweep complete. Escalated ${payload.escalated || 0}, queued CSAT ${payload.csat_queued || 0}.`)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Support inbox</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Live tickets from email and in-app support.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRunSlaSweep}
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-white transition-colors"
            >
              Run SLA sweep
            </button>
            <button
              type="button"
              onClick={() => setShowNewTicket(true)}
              className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Log ticket
            </button>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#191919]">Inbox</h2>
                <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                  {filteredTickets.length} tickets
                </span>
              </div>
              <div className="mt-3 grid gap-3">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by subject or requester"
                  className="w-full rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919]"
                />
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`rounded-full border px-3 py-1 font-semibold ${
                      statusFilter === 'all' ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
                    }`}
                  >
                    All
                  </button>
                  {statusOptions.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={`rounded-full border px-3 py-1 font-semibold capitalize ${
                        statusFilter === status ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setChannelFilter('all')}
                    className={`rounded-full border px-3 py-1 font-semibold ${
                      channelFilter === 'all' ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
                    }`}
                  >
                    All channels
                  </button>
                  {channelOptions.map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => setChannelFilter(channel)}
                      className={`rounded-full border px-3 py-1 font-semibold capitalize ${
                        channelFilter === channel ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
                      }`}
                    >
                      {channel === 'in_app' ? 'In-app' : 'Email'}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setQueueFilter('all')}
                    className={`rounded-full border px-3 py-1 font-semibold ${
                      queueFilter === 'all' ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
                    }`}
                  >
                    All queues
                  </button>
                  {queueOptions.map((queue) => (
                    <button
                      key={queue}
                      type="button"
                      onClick={() => setQueueFilter(queue)}
                      className={`rounded-full border px-3 py-1 font-semibold ${
                        queueFilter === queue ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
                      }`}
                    >
                      {queueLabel(queue)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {loadingTickets ? <LoadingState label="Loading tickets..." /> : null}
                {!loadingTickets && filteredTickets.length === 0 ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm text-[#6b5f55]">
                    No tickets match your filters.
                  </div>
                ) : null}
                {filteredTickets.map((ticket) => {
                  const sla = formatSla(ticket)
                  const queue = getQueue(ticket)
                  return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedId(ticket.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      selectedId === ticket.id
                        ? 'border-[#191919] bg-white'
                        : 'border-[#dcdcdc] bg-[#f5f5f5] hover:border-[#191919]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#191919]">{ticket.subject}</p>
                        <p className="mt-1 text-xs text-[#6b5f55]">
                          {ticket.requester_name || 'Requester'} · {ticket.channel === 'in_app' ? 'In-app' : 'Email'}
                        </p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">{queueLabel(queue)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-[11px]">
                        <span className="rounded-full border border-[#191919] px-2 py-0.5 font-semibold text-[#191919] capitalize">
                          {ticket.status}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 font-semibold ${
                            sla.overdue ? 'border-[#b80f0a] text-[#b80f0a]' : 'border-[#dcdcdc] text-[#6b5f55]'
                          }`}
                        >
                          {sla.label}
                        </span>
                      </div>
                    </div>
                    {ticket.last_message_preview ? (
                      <p className="mt-2 text-xs text-[#6b5f55]">{ticket.last_message_preview}</p>
                    ) : null}
                  </button>
                )})}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-5">
              {selectedTicket ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Ticket</p>
                      <h2 className="mt-2 text-xl font-semibold text-[#191919]">{selectedTicket.subject}</h2>
                      <p className="mt-1 text-xs text-[#6b5f55]">{selectedTicket.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => updateTicket({ action: 'assign_to_me' })}
                        className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                      >
                        Assign to me
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTicket({ status: 'resolved' })}
                        className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                      >
                        Resolve
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTicket({ status: 'open' })}
                        className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                      >
                        Reopen
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3 text-xs">
                    <div className="rounded-full border border-[#dcdcdc] px-3 py-1">
                      Status: <span className="font-semibold capitalize">{selectedTicket.status}</span>
                    </div>
                    <div className="rounded-full border border-[#dcdcdc] px-3 py-1">
                      Channel: <span className="font-semibold">{selectedTicket.channel === 'in_app' ? 'In-app' : 'Email'}</span>
                    </div>
                    <div className="rounded-full border border-[#dcdcdc] px-3 py-1">
                      Queue: <span className="font-semibold">{queueLabel(getQueue(selectedTicket))}</span>
                    </div>
                    <div className="rounded-full border border-[#dcdcdc] px-3 py-1">
                      Priority: <span className="font-semibold capitalize">{selectedTicket.priority}</span>
                    </div>
                    {selectedTicket.sla_due_at ? (
                      <div className="rounded-full border border-[#dcdcdc] px-3 py-1">
                        SLA: <span className="font-semibold">{formatSla(selectedTicket).label}</span>
                      </div>
                    ) : null}
                    <select
                      value={selectedTicket.priority}
                      onChange={(event) => updateTicket({ priority: event.target.value })}
                      className="rounded-full border border-[#191919] bg-white px-3 py-1 text-xs font-semibold text-[#191919]"
                    >
                      {priorityOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-xs text-[#6b5f55]">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em]">Requester</p>
                      <p className="mt-1 text-sm font-semibold text-[#191919]">
                        {selectedTicket.requester_name || 'Unknown'}
                      </p>
                      <p>{selectedTicket.requester_email || 'No email on file'}</p>
                      <p className="capitalize">Role: {selectedTicket.requester_role || 'member'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em]">Organization</p>
                      <p className="mt-1 text-sm font-semibold text-[#191919]">
                        {selectedTicket.org_name || 'Not linked'}
                      </p>
                      <p>{selectedTicket.team_name || 'No team assigned'}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <div className="grid w-full gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-[#6b5f55]">Action targets</p>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <label className="grid min-w-0 gap-1">
                          <span className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">User id</span>
                          <input
                            value={actionUserId}
                            onChange={(event) => setActionUserId(event.target.value)}
                            placeholder="Supabase user id"
                            className="w-full min-w-0 rounded-full border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                          />
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">Order id</span>
                          <input
                            value={actionOrderId}
                            onChange={(event) => setActionOrderId(event.target.value)}
                            placeholder="Order id"
                            className="w-full min-w-0 rounded-full border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                          />
                        </label>
                        <label className="grid min-w-0 gap-1 sm:col-span-2 xl:col-span-1">
                          <span className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">Payment intent</span>
                          <input
                            value={actionPaymentIntentId}
                            onChange={(event) => setActionPaymentIntentId(event.target.value)}
                            placeholder="pi_123..."
                            className="w-full min-w-0 rounded-full border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919]"
                          />
                        </label>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSupportAction('refund')}
                      disabled={actionLoading === 'refund'}
                      className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
                    >
                      {actionLoading === 'refund' ? 'Refunding...' : 'Refund'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSupportAction('lock_account')}
                      disabled={actionLoading === 'lock_account'}
                      className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
                    >
                      {actionLoading === 'lock_account' ? 'Locking...' : 'Lock account'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSupportAction('schedule_followup')}
                      disabled={actionLoading === 'schedule_followup'}
                      className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
                    >
                      {actionLoading === 'schedule_followup' ? 'Scheduling...' : 'Schedule follow-up'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSupportAction('export_logs')}
                      disabled={actionLoading === 'export_logs'}
                      className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
                    >
                      {actionLoading === 'export_logs' ? 'Exporting...' : 'Export logs'}
                    </button>
                  </div>

                  {templates.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-[#6b5f55]">Suggested replies</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {templates.map((template) => {
                          const suggested = selectedTicket.metadata?.suggested_template === template.id
                          return (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => handleTemplateSelect(template)}
                              className={`rounded-full border px-3 py-1 font-semibold ${
                                suggested ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
                              }`}
                            >
                              {template.title}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-white">
                    <div className="border-b border-[#e5e5e5] px-4 py-3 text-xs font-semibold text-[#6b5f55]">
                      Conversation
                    </div>
                    <div className="max-h-[360px] space-y-3 overflow-y-auto px-4 py-3 text-sm">
                      {loadingMessages ? <LoadingState label="Loading messages..." /> : null}
                      {!loadingMessages && messages.length === 0 ? (
                        <p className="text-xs text-[#6b5f55]">No messages yet.</p>
                      ) : null}
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`rounded-2xl border px-3 py-2 ${
                            message.is_internal
                              ? 'border-[#dcdcdc] bg-[#f5f5f5] text-[#6b5f55]'
                              : 'border-[#191919] bg-white text-[#191919]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em]">
                            <span>{message.is_internal ? 'Internal note' : message.sender_role}</span>
                            <span>{message.created_at ? new Date(message.created_at).toLocaleString() : ''}</span>
                          </div>
                          <p className="mt-2 text-sm font-semibold">{message.sender_name || 'Support'}</p>
                          <p className="mt-1 text-sm">{message.body}</p>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-[#e5e5e5] px-4 py-3">
                      <textarea
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        placeholder={internalNote ? 'Write an internal note...' : 'Write a reply to the requester...'}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        rows={3}
                      />
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <label className="flex items-center gap-2 text-[#6b5f55]">
                          <input
                            type="checkbox"
                            checked={internalNote}
                            onChange={(event) => setInternalNote(event.target.checked)}
                          />
                          Internal note
                        </label>
                        <button
                          type="button"
                          onClick={handleSendReply}
                          className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm text-[#6b5f55]">
                  Select a ticket to view details.
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {showNewTicket ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Log ticket</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Add support request</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowNewTicket(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-[#6b5f55]">Subject</span>
                <input
                  value={newTicket.subject}
                  onChange={(event) => setNewTicket((prev) => ({ ...prev, subject: event.target.value }))}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-[#6b5f55]">Message</span>
                <textarea
                  value={newTicket.message}
                  onChange={(event) => setNewTicket((prev) => ({ ...prev, message: event.target.value }))}
                  rows={3}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#6b5f55]">Channel</span>
                  <select
                    value={newTicket.channel}
                    onChange={(event) => setNewTicket((prev) => ({ ...prev, channel: event.target.value }))}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                  >
                    <option value="email">Email</option>
                    <option value="in_app">In-app</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#6b5f55]">Priority</span>
                  <select
                    value={newTicket.priority}
                    onChange={(event) => setNewTicket((prev) => ({ ...prev, priority: event.target.value }))}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                  >
                    {priorityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#6b5f55]">Requester name</span>
                  <input
                    value={newTicket.requester_name}
                    onChange={(event) => setNewTicket((prev) => ({ ...prev, requester_name: event.target.value }))}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#6b5f55]">Requester email</span>
                  <input
                    value={newTicket.requester_email}
                    onChange={(event) => setNewTicket((prev) => ({ ...prev, requester_email: event.target.value }))}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#6b5f55]">Org name</span>
                  <input
                    value={newTicket.org_name}
                    onChange={(event) => setNewTicket((prev) => ({ ...prev, org_name: event.target.value }))}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#6b5f55]">Team name</span>
                  <input
                    value={newTicket.team_name}
                    onChange={(event) => setNewTicket((prev) => ({ ...prev, team_name: event.target.value }))}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCreateTicket}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                >
                  Create ticket
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewTicket(false)}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
