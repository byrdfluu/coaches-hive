'use client'

import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatShortDate, formatShortDateTime, formatTime } from '@/lib/dateUtils'

const fallbackStats = [
  { label: 'Total users', value: '—', meta: 'Coaches & athletes', href: '/admin/users' },
  { label: 'Marketplace order disputes', value: '—', meta: 'Orders & refunds', href: '/admin/disputes' },
  { label: 'Marketplace gross revenue', value: '—', meta: 'All marketplace orders', href: '/admin/orders' },
  { label: 'Active orgs', value: '—', meta: 'Organizations', href: '/admin/orgs' },
  { label: 'Platform revenue', value: '—', meta: 'All revenue streams', href: '/admin/revenue' },
]


export default function AdminConsole() {
  const [now, setNow] = useState<Date | null>(null)
  const [verificationRequests, setVerificationRequests] = useState<Array<{ userId: string; entityType: 'profile' | 'organization'; name: string; submitted: string; status: string; docs: string }>>([])
  const [verificationChecklist, setVerificationChecklist] = useState({
    government_id_matched: { done: 0, total: 0 },
    profile_completeness: { done: 0, total: 0 },
    certifications_uploaded: { done: 0, total: 0 },
  })
  const [metrics, setMetrics] = useState<null | {
    users: { total: number; coaches: number; athletes: number; orgUsers: number }
    orgs: number
    orders: number
    disputes: number
    grossRevenue: number
    refunds: number
    sessions: number
    platformRevenue: number
    acquisition: {
      totalCaptured: number
      uncaptured: number
      coachesCaptured: number
      athletesCaptured: number
      topSources: Array<{ source: string; count: number }>
      coachSources: Array<{ source: string; count: number }>
      athleteSources: Array<{ source: string; count: number }>
    }
    activation: {
      athletes: { total: number; activated: number; rate: number }
      coaches: { total: number; activated: number; rate: number }
      orgs: { total: number; activated: number; rate: number }
    }
    retention: {
      days7: {
        athletes: { active: number; rate: number }
        coaches: { active: number; rate: number }
        orgs: { active: number; rate: number }
      }
      days30: {
        athletes: { active: number; rate: number }
        coaches: { active: number; rate: number }
        orgs: { active: number; rate: number }
      }
    }
    conversion: {
      athletes: { total: number; converted: number; rate: number }
      coaches: { total: number; converted: number; rate: number }
      orgs: { total: number; converted: number; rate: number }
    }
  }>(null)
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [users, setUsers] = useState<Array<{ id: string; email: string; role: string; full_name: string; status: string }>>([])
  const [search, setSearch] = useState('')
  const [impersonationNotice, setImpersonationNotice] = useState('')
  const [toast, setToast] = useState('')
  const [notices, setNotices] = useState<Array<{ id: string; message: string; created_at: string; author: string }>>([])
  const [noticeMessage, setNoticeMessage] = useState('')
  const [noticeModal, setNoticeModal] = useState(false)
  const [reviewQueue, setReviewQueue] = useState<Array<{ id: string; name: string; item: string; status: string; eta: string }>>([])
  const [incidentFeed, setIncidentFeed] = useState<Array<{ id: string; title: string; detail: string; time: string }>>([])
  const [supportTickets, setSupportTickets] = useState<Array<{ id: string; subject: string; assignee: string; eta: string }>>([])
  const [auditFeed, setAuditFeed] = useState<Array<{ id: string; action: string; actor: string; time: string }>>([])
  const [dataComplianceSummary, setDataComplianceSummary] = useState({
    verificationsPending: 0,
    verificationsFlagged: 0,
    dataRequests: 0,
    incidentsOpen: 0,
    auditEvents: 0,
  })
  const [reviewActionLoading, setReviewActionLoading] = useState<'approve' | 'request_docs' | null>(null)
  const [securityConfig, setSecurityConfig] = useState({
    enforce_mfa: false,
    require_sso: false,
    disable_password: false,
    dual_approval_payouts: false,
    ip_allowlist: '',
  })
  const [securitySaving, setSecuritySaving] = useState(false)

  useEffect(() => {
    setNow(new Date())
  }, [])

  const parseJsonOrNull = async <T,>(response: Response): Promise<T | null> => {
    try {
      return (await response.json()) as T
    } catch {
      return null
    }
  }

  const formatActionLabel = (action: string) => {
    if (!action) return 'System event'
    return action
      .replace(/[_\\.]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }

  const updateVerification = useCallback(async (userId: string, status: string, entityType: 'profile' | 'organization' = 'profile') => {
    const action = status === 'approved'
      ? 'approve'
      : (status === 'needs_review' ? 'request_docs' : 'reject')
    const reason = action === 'approve'
      ? ''
      : (action === 'request_docs' ? 'Requested additional verification details from admin dashboard.' : 'Rejected from admin dashboard.')

    const response = await fetch('/api/admin/verifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        user_id: userId,
        entity_type: entityType,
        reason,
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setToast(payload?.error || 'Unable to update verification.')
      return
    }
    if (entityType === 'profile') {
      setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, status: status === 'approved' ? 'Verified' : user.status } : user)))
    }
    setVerificationRequests((prev) => prev.filter((item) => !(item.userId === userId && item.entityType === entityType)))
    setDataComplianceSummary((prev) => ({
      ...prev,
      verificationsPending: Math.max(0, prev.verificationsPending - 1),
      verificationsFlagged: status === 'needs_review' ? prev.verificationsFlagged + 1 : prev.verificationsFlagged,
    }))
    setToast(`Verification updated: ${status}`)
  }, [])

  const handleReviewQueueAction = useCallback(async (action: 'approve' | 'request_docs') => {
    const reviewIds = reviewQueue.map((entry) => entry.id).filter(Boolean)
    if (!reviewIds.length) {
      setToast('No reviews in queue.')
      return
    }
    setReviewActionLoading(action)
    const response = await fetch('/api/admin/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        action === 'approve'
          ? { review_ids: reviewIds, status: 'approved' }
          : { action: 'request_docs', review_ids: reviewIds },
      ),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setToast(payload?.error || 'Unable to update reviews.')
      setReviewActionLoading(null)
      return
    }

    if (action === 'approve') {
      setReviewQueue([])
      setToast(`Approved ${payload?.updated_count || reviewIds.length} review(s).`)
    } else {
      setToast(`Created ${payload?.created_tickets || 0} doc request ticket(s).`)
    }
    setReviewActionLoading(null)
  }, [reviewQueue])

  useEffect(() => {
    let active = true
    const loadMetrics = async () => {
      setLoadingMetrics(true)
      const response = await fetch('/api/admin/metrics')
      if (!response.ok) {
        setToast('Unable to load metrics.')
        setLoadingMetrics(false)
        return
      }
      const payload = await parseJsonOrNull<any>(response)
      if (!payload) {
        setToast('Unable to load metrics.')
        setLoadingMetrics(false)
        return
      }
      if (!active) return
      setMetrics(payload)
      setLastRefreshed(new Date())
      setLoadingMetrics(false)
    }
    const loadUsers = async () => {
      setLoadingUsers(true)
      const response = await fetch('/api/admin/users')
      if (!response.ok) {
        setToast('Unable to load users.')
        setLoadingUsers(false)
        return
      }
      const payload = await parseJsonOrNull<any>(response)
      if (!payload) {
        setToast('Unable to load users.')
        setLoadingUsers(false)
        return
      }
      if (!active) return
      setUsers(payload.users || [])
      setLoadingUsers(false)
    }
    const loadNotices = async () => {
      const response = await fetch('/api/admin/notices')
      if (!response.ok) return
      const payload = await parseJsonOrNull<any>(response)
      if (!payload) return
      if (!active) return
      setNotices(payload.config?.items || [])
    }
    const loadVerifications = async () => {
      const response = await fetch('/api/admin/verifications')
      if (!response.ok) return
      const payload = await parseJsonOrNull<any>(response)
      if (!payload) return
      if (!active) return
      const items = (payload.queue || []).slice(0, 4).map((entry: { id: string; entity_type?: 'profile' | 'organization'; name: string; status: string }) => ({
        userId: entry.id,
        entityType: entry.entity_type === 'organization' ? 'organization' : 'profile',
        name: entry.name,
        submitted: 'Recently',
        status: entry.status || 'pending',
        docs: entry.entity_type === 'organization' ? 'KYB request' : 'KYC request',
      }))
      setVerificationRequests(items)
      const summary = payload.summary || {}
      const checklist = payload.checklist || {}
      setDataComplianceSummary((prev) => ({
        ...prev,
        verificationsPending: Number(summary.pending || 0),
        verificationsFlagged: Number(summary.flagged || 0),
      }))
      setVerificationChecklist({
        government_id_matched: {
          done: Number(checklist.government_id_matched?.done || 0),
          total: Number(checklist.government_id_matched?.total || 0),
        },
        profile_completeness: {
          done: Number(checklist.profile_completeness?.done || 0),
          total: Number(checklist.profile_completeness?.total || 0),
        },
        certifications_uploaded: {
          done: Number(checklist.certifications_uploaded?.done || 0),
          total: Number(checklist.certifications_uploaded?.total || 0),
        },
      })
    }
    const loadReviewQueue = async () => {
      const response = await fetch('/api/admin/reviews')
      if (!response.ok) return
      const payload = await parseJsonOrNull<any>(response)
      if (!payload) return
      if (!active) return
      const reviews = (payload.reviews || []).filter((review: any) => String(review.status || '').toLowerCase() === 'pending')
      const coaches = payload.coaches || {}
      const athletes = payload.athletes || {}
      const items = reviews.slice(0, 3).map((review: any) => {
        const coach = coaches[review.coach_id]
        const athlete = athletes[review.athlete_id]
        return {
          id: review.id,
          name: coach?.name || 'Coach review',
          item: athlete?.name ? `Review from ${athlete.name}` : 'New coach review',
          status: 'Pending',
          eta: review.created_at ? formatShortDateTime(new Date(review.created_at)) : now ? formatShortDateTime(now) : '—',
        }
      })
      setReviewQueue(items)
    }
    const loadIncidents = async () => {
      const monitorResponse = await fetch('/api/admin/operations/monitor', { method: 'POST' })
      const operationsResponse = await fetch('/api/admin/operations')

      if (operationsResponse.ok) {
        const payload = await parseJsonOrNull<any>(operationsResponse)
        if (!payload) return
        if (!active) return
        const incidents = (payload.config?.incidentFeed || []) as Array<{
          id: string
          title: string
          detail: string
          created_at?: string
          status?: string
          severity?: string
        }>
        const unresolved = incidents.filter((item) => String(item.status || '').toLowerCase() !== 'resolved')
        const items = (unresolved.length ? unresolved : incidents).slice(0, 3).map((incident) => ({
          id: incident.id,
          title: incident.title || 'Operational signal',
          detail: `${incident.severity ? `${String(incident.severity).toUpperCase()} · ` : ''}${incident.detail || ''}`,
          time: incident.created_at ? formatTime(new Date(incident.created_at)) : now ? formatTime(now) : '—',
        }))
        setIncidentFeed(items)
        setDataComplianceSummary((prev) => ({
          ...prev,
          incidentsOpen: unresolved.length,
        }))
        return
      }

      const auditFallback = await fetch('/api/admin/audit?limit=4')
      if (!auditFallback.ok) return
      const payload = await parseJsonOrNull<any>(auditFallback)
      if (!payload) return
      if (!active) return
      const logs = (payload.logs || []) as Array<{ id: string; action: string; created_at: string; actor_email?: string | null }>
      const items = logs.slice(0, 3).map((log) => ({
        id: log.id,
        title: formatActionLabel(log.action),
        detail: log.actor_email ? `By ${log.actor_email}` : 'System action recorded',
        time: log.created_at ? formatTime(new Date(log.created_at)) : now ? formatTime(now) : '—',
      }))
      setIncidentFeed(items)
      setDataComplianceSummary((prev) => ({
        ...prev,
        incidentsOpen: items.length,
      }))
      if (monitorResponse.ok) {
        await monitorResponse.json().catch(() => null)
      }
    }
    const loadSupportTickets = async () => {
      const response = await fetch('/api/admin/support/tickets?status=open')
      if (!response.ok) return
      const payload = await parseJsonOrNull<any>(response)
      if (!payload) return
      if (!active) return
      const tickets = (payload.tickets || []) as Array<{ id: string; subject: string; assigned_to?: string | null; sla_due_at?: string | null }>
      const items = tickets.slice(0, 3).map((ticket) => ({
        id: ticket.id,
        subject: ticket.subject || 'Support request',
        assignee: ticket.assigned_to ? 'Assigned' : 'Unassigned',
        eta: ticket.sla_due_at ? formatShortDateTime(new Date(ticket.sla_due_at)) : now ? formatShortDate(now) : '—',
      }))
      setSupportTickets(items)
    }
    const loadAuditFeed = async () => {
      const response = await fetch('/api/admin/audit?limit=3')
      if (!response.ok) return
      const payload = await parseJsonOrNull<any>(response)
      if (!payload) return
      if (!active) return
      const logs = Array.isArray(payload.logs) ? payload.logs : []
      const items = logs.slice(0, 3).map((log: any) => ({
        id: String(log.id || ''),
        action: formatActionLabel(String(log.action || 'System event')),
        actor: String(log.actor_email || 'System'),
        time: log.created_at ? formatTime(new Date(log.created_at)) : now ? formatTime(now) : '—',
      }))
      setAuditFeed(items)
    }
    const loadSecurity = async () => {
      const response = await fetch('/api/admin/security')
      if (!response.ok) return
      const payload = await parseJsonOrNull<any>(response)
      if (!payload) return
      if (!active) return
      setSecurityConfig({
        enforce_mfa: Boolean(payload.config?.enforce_mfa),
        require_sso: Boolean(payload.config?.require_sso),
        disable_password: Boolean(payload.config?.disable_password),
        dual_approval_payouts: Boolean(payload.config?.dual_approval_payouts),
        ip_allowlist: payload.config?.ip_allowlist || '',
      })
    }
    const loadCompliance = async () => {
      const [retentionResponse, auditResponse] = await Promise.all([
        fetch('/api/admin/retention'),
        fetch('/api/admin/audit?limit=1'),
      ])

      let dataRequests = 0
      if (retentionResponse.ok) {
        const payload = await parseJsonOrNull<any>(retentionResponse)
        const policies = Array.isArray(payload?.policies) ? payload.policies : []
        dataRequests = policies.filter((policy: any) => Boolean(policy?.enabled)).length
      }

      let auditEvents = 0
      if (auditResponse.ok) {
        const payload = await parseJsonOrNull<any>(auditResponse)
        auditEvents = Number(payload?.total_count || 0)
      }

      if (!active) return
      setDataComplianceSummary((prev) => ({
        ...prev,
        dataRequests,
        auditEvents,
      }))
    }
    loadMetrics()
    loadUsers()
    loadNotices()
    loadVerifications()
    loadReviewQueue()
    loadIncidents()
    loadSupportTickets()
    loadAuditFeed()
    loadSecurity()
    loadCompliance()
    return () => {
      active = false
    }
  }, [now])

  const refreshMetrics = useCallback(async () => {
    setLoadingMetrics(true)
    const response = await fetch('/api/admin/metrics')
    if (!response.ok) { setLoadingMetrics(false); setToast('Unable to refresh metrics.'); return }
    const payload = await parseJsonOrNull<any>(response)
    if (!payload) { setLoadingMetrics(false); setToast('Unable to refresh metrics.'); return }
    setMetrics(payload)
    setLastRefreshed(new Date())
    setLoadingMetrics(false)
  }, [])

  const adminStats = useMemo(() => {
    if (!metrics) return fallbackStats
    return [
      {
        label: 'Total users',
        value: metrics.users.total.toString(),
        meta: `${metrics.users.coaches} coaches · ${metrics.users.athletes} athletes`,
        href: '/admin/users',
      },
      {
        label: 'Marketplace order disputes',
        value: metrics.disputes.toString(),
        meta: `${metrics.refunds} refunded`,
        href: '/admin/disputes',
      },
      {
        label: 'Marketplace gross revenue',
        value: `$${metrics.grossRevenue.toFixed(0)}`,
        meta: `${metrics.sessions} sessions`,
        href: '/admin/orders',
      },
      {
        label: 'Active orgs',
        value: metrics.orgs.toString(),
        meta: `${metrics.users.orgUsers} org admins`,
        href: '/admin/orgs',
      },
      {
        label: 'Platform revenue',
        value: `$${metrics.platformRevenue.toFixed(0)}`,
        meta: 'All revenue streams',
        href: '/admin/revenue',
      },
    ]
  }, [metrics])

  const healthMetrics = useMemo(() => {
    if (!metrics) return []
    return [
      {
        label: 'Athletes',
        activation: metrics.activation.athletes,
        retention7: metrics.retention.days7.athletes,
        retention30: metrics.retention.days30.athletes,
        conversion: metrics.conversion.athletes,
      },
      {
        label: 'Coaches',
        activation: metrics.activation.coaches,
        retention7: metrics.retention.days7.coaches,
        retention30: metrics.retention.days30.coaches,
        conversion: metrics.conversion.coaches,
      },
      {
        label: 'Orgs',
        activation: metrics.activation.orgs,
        retention7: metrics.retention.days7.orgs,
        retention30: metrics.retention.days30.orgs,
        conversion: metrics.conversion.orgs,
      },
    ]
  }, [metrics])

  const acquisitionSummary = useMemo(() => {
    if (!metrics) return null
    return metrics.acquisition
  }, [metrics])

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return []
    return users.filter((user) =>
      user.email.toLowerCase().includes(term) ||
      user.full_name.toLowerCase().includes(term) ||
      String(user.role || '').toLowerCase().includes(term)
    ).slice(0, 8)
  }, [users, search])

  const startImpersonation = async (userId: string, role: string) => {
    setImpersonationNotice('Starting impersonation...')
    const response = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setToast(payload.error || 'Unable to impersonate.')
      return
    }
    setImpersonationNotice(`Impersonating ${role} (${userId}).`)
  }

  const exportMetrics = async () => {
    const payload = metrics || (await fetch('/api/admin/metrics').then((res) => (res.ok ? res.json() : null)))
    if (!payload) {
      setToast('Unable to export metrics.')
      return
    }
    const rows = [
      ['Metric', 'Value'],
      ['Total users', payload.users?.total ?? '—'],
      ['Coaches', payload.users?.coaches ?? '—'],
      ['Athletes', payload.users?.athletes ?? '—'],
      ['Org admins', payload.users?.orgUsers ?? '—'],
      ['Active orgs', payload.orgs ?? '—'],
      ['Orders', payload.orders ?? '—'],
      ['Marketplace gross revenue', payload.grossRevenue ?? '—'],
      ['Platform revenue', payload.platformRevenue ?? '—'],
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/\"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `admin-metrics-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const createNotice = async () => {
    const message = noticeMessage.trim()
    if (!message) {
      setToast('Write a notice first.')
      return
    }
    const response = await fetch('/api/admin/notices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    if (!response.ok) {
      setToast('Unable to create notice.')
      return
    }
    const payload = await response.json()
    setNotices((prev) => [payload.notice, ...prev].slice(0, 10))
    setNoticeMessage('')
    setNoticeModal(false)
    setToast('Notice created.')
  }

  const saveSecurityConfig = async () => {
    setSecuritySaving(true)
    const response = await fetch('/api/admin/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: securityConfig }),
    })
    if (!response.ok) {
      setToast('Unable to save security settings.')
      setSecuritySaving(false)
      return
    }
    setSecuritySaving(false)
    setToast('Security settings saved.')
  }

  return (
    <>
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">
              Admin Console
            </p>
            <h1 className="display text-3xl font-semibold md:text-4xl">
              Control tower overview
            </h1>
            <p className="mt-2 text-sm text-[#6b5f55]">
              Switch between coach, athlete, and admin views while testing
              permissions.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="ghost-button w-full sm:w-auto" onClick={exportMetrics}>Export report</button>
            <button className="accent-button w-full sm:w-auto" onClick={() => setNoticeModal(true)}>Create notice</button>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-10">
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Platform metrics</p>
                <div className="flex items-center gap-3">
                  {lastRefreshed && (
                    <span className="text-xs text-[#6b5f55]">
                      Last updated {Math.floor((Date.now() - lastRefreshed.getTime()) / 60000)} min ago
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={refreshMetrics}
                    disabled={loadingMetrics}
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-50 hover:bg-[#191919] hover:text-white transition-colors"
                  >
                    {loadingMetrics ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
              </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {adminStats.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="glass-card p-5 transition hover:border-[#191919] hover:bg-[#f7f3ef]"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">
                {stat.label}
              </p>
              <p className="mt-3 text-3xl font-semibold">{stat.value}</p>
              <p className="text-sm text-[#6b5f55]">{stat.meta}</p>
            </Link>
          ))}
              {loadingMetrics ? (
                <div className="glass-card flex items-center justify-center border border-dashed border-[#dcdcdc] bg-white p-5 text-xs text-[#6b5f55]">
                  Loading metrics...
                </div>
              ) : null}
            </div>
            </section>

            <section className="glass-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">How users found Coaches Hive</h2>
                  <p className="mt-1 text-sm text-[#6b5f55]">Last onboarding survey answer captured on athlete and coach accounts.</p>
                </div>
                <Link href="/admin/users" className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]">
                  Open user lists
                </Link>
              </div>
              {!acquisitionSummary ? (
                <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#6b5f55]">
                  Acquisition data loading...
                </div>
              ) : (
                <>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: 'Captured responses', value: acquisitionSummary.totalCaptured.toString() },
                      { label: 'Missing responses', value: acquisitionSummary.uncaptured.toString() },
                      { label: 'Coach responses', value: acquisitionSummary.coachesCaptured.toString() },
                      { label: 'Athlete responses', value: acquisitionSummary.athletesCaptured.toString() },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                        <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    {[
                      { label: 'Top sources', items: acquisitionSummary.topSources, empty: 'No acquisition sources captured yet.' },
                      { label: 'Coach sources', items: acquisitionSummary.coachSources, empty: 'No coach sources captured yet.' },
                      { label: 'Athlete sources', items: acquisitionSummary.athleteSources, empty: 'No athlete sources captured yet.' },
                    ].map((group) => (
                      <div key={group.label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                        <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{group.label}</p>
                        {group.items.length === 0 ? (
                          <p className="mt-3 text-xs text-[#6b5f55]">{group.empty}</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {group.items.map((item) => (
                              <div key={`${group.label}-${item.source}`} className="flex items-center justify-between gap-3 rounded-2xl border border-[#e2dfdb] bg-white px-3 py-2">
                                <span className="min-w-0 flex-1 truncate text-[#191919]">{item.source}</span>
                                <span className="shrink-0 rounded-full border border-[#191919] px-2 py-1 text-xs font-semibold text-[#191919]">
                                  {item.count}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="glass-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Activation + retention</h2>
                  <p className="mt-1 text-sm text-[#6b5f55]">Track first-value, retention, and conversion by role.</p>
                </div>
                <Link href="/admin/revenue" className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]">
                  View revenue
                </Link>
              </div>
              {!metrics ? (
                <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#6b5f55]">
                  Metrics loading...
                </div>
              ) : (
                <div className="mt-4 grid gap-4 lg:grid-cols-3 text-sm">
                  {healthMetrics.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{item.label}</p>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[#6b5f55]">Activation</span>
                          <span className="font-semibold text-[#191919]">{item.activation.rate}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[#6b5f55]">7-day retention</span>
                          <span className="font-semibold text-[#191919]">{item.retention7.rate}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[#6b5f55]">30-day retention</span>
                          <span className="font-semibold text-[#191919]">{item.retention30.rate}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[#6b5f55]">Conversion</span>
                          <span className="font-semibold text-[#191919]">{item.conversion.rate}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="glass-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Recent notices</h2>
                  <p className="mt-1 text-sm text-[#6b5f55]">Latest internal broadcasts.</p>
                </div>
                <button
                  className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                  onClick={() => setNoticeModal(true)}
                >
                  New notice
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {notices.length === 0 ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#6b5f55]">
                    No notices yet.
                  </div>
                ) : (
                  notices.map((notice) => (
                    <div key={notice.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="font-semibold text-[#191919]">{notice.message}</p>
                      <p className="text-xs text-[#6b5f55]">
                        {notice.author} · {new Date(notice.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="glass-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Global user search</h2>
                  <p className="mt-1 text-sm text-[#6b5f55]">Find any user, then jump to their admin view or impersonate.</p>
                </div>
                {impersonationNotice ? (
                  <span className="rounded-full border border-[#191919] px-3 py-1 text-xs text-[#191919]">{impersonationNotice}</span>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-[1fr_auto]">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-[#191919] outline-none focus:border-[#191919]"
                  placeholder="Search by name, email, or role"
                />
                <Link
                  href="/admin/users"
                  className="w-full rounded-full border border-[#191919] bg-white px-5 py-3 text-center text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a] md:w-auto"
                >
                  Open user lists
                </Link>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {loadingUsers ? (
                  <LoadingState label="Loading users..." />
                ) : !search.trim() ? (
                  <EmptyState title="Start typing to search all users." description="Search by name, email, or role." />
                ) : filteredUsers.length === 0 ? (
                  <EmptyState title="No users found." description="Try a different search term." />
                ) : (
                  filteredUsers.map((user) => {
                    const role = String(user.role || 'unknown')
                    const listHref = role === 'athlete' ? '/admin/athletes' : role === 'coach' ? '/admin/coaches' : '/admin/orgs'
                    return (
                      <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                        <div>
                          <p className="font-semibold text-[#191919]">{user.full_name || user.email}</p>
                          <p className="text-xs text-[#6b5f55]">{user.email} · {role}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Link href={listHref} className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                            View in admin
                          </Link>
                          {role === 'coach' || role === 'athlete' ? (
                            <button
                              className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                              onClick={() => startImpersonation(user.id, role)}
                            >
                              Impersonate
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            <section className="glass-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Permissions & roles</h2>
              <Link className="text-sm font-semibold text-[#191919] underline" href="/admin/users">
                Manage roles
              </Link>
            </div>
            <p className="mt-2 text-sm text-[#6b5f55]">Support, finance, ops, superadmin. Two-person checks for risky actions.</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="font-semibold text-[#191919]">Support</p>
                <p className="text-xs text-[#6b5f55]">View/impersonate, resend receipts, no refunds.</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="font-semibold text-[#191919]">Finance</p>
                <p className="text-xs text-[#6b5f55]">Refunds, disputes, payouts. Requires MFA.</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="font-semibold text-[#191919]">Ops</p>
                <p className="text-xs text-[#6b5f55]">Verifications, document review, risk flags.</p>
              </div>
            </div>
          </section>

            <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="glass-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Review queue</h2>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
                  type="button"
                  disabled={reviewActionLoading !== null || reviewQueue.length === 0}
                  onClick={() => handleReviewQueueAction('approve')}
                >
                  {reviewActionLoading === 'approve' ? 'Approving…' : 'Bulk approve'}
                </button>
                <button
                  className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
                  type="button"
                  disabled={reviewActionLoading !== null || reviewQueue.length === 0}
                  onClick={() => handleReviewQueueAction('request_docs')}
                >
                  {reviewActionLoading === 'request_docs' ? 'Requesting…' : 'Request docs'}
                </button>
                <Link className="text-sm font-semibold text-[#b80f0a]" href="/admin/reviews">
                  View all
                </Link>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {reviewQueue.length === 0 ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#6b5f55]">
                  No pending reviews in queue.
                </div>
              ) : reviewQueue.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#ede3d7] bg-white px-4 py-4"
                >
                  <div>
                    <p className="text-sm text-[#6b5f55]">{entry.item}</p>
                    <p className="text-lg font-semibold">{entry.name}</p>
                    <p className="text-sm text-[#6b5f55]">
                      {entry.status}
                    </p>
                    <p className="text-xs text-[#6b5f55]">SLA timer: {entry.eta}</p>
                  </div>
                  <span className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white">
                    {entry.eta}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h2 className="text-xl font-semibold">System signals</h2>
            <p className="mt-2 text-sm text-[#6b5f55]">
              Recent incidents and operational updates.
            </p>
            <div className="mt-6 space-y-3 text-sm">
              {incidentFeed.length === 0 ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#6b5f55]">
                  No operational incidents reported.
                </div>
              ) : incidentFeed.map((incident) => (
                <div
                  key={incident.time + incident.title}
                  className="rounded-2xl border border-[#ede3d7] bg-white px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{incident.title}</p>
                    <span className="text-xs text-[#6b5f55]">
                      {incident.time}
                    </span>
                  </div>
                  <p className="mt-1 text-[#6b5f55]">{incident.detail}</p>
                </div>
              ))}
            </div>
          </div>
            </section>


            <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="glass-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Verification requests</h2>
              <Link className="text-sm font-semibold text-[#191919] underline" href="/admin/verifications">
                Open queue
              </Link>
            </div>
            <div className="mt-4 space-y-3 text-sm text-[#191919]">
              {verificationRequests.length === 0 ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#6b5f55]">
                  No verification requests yet.
                </div>
              ) : verificationRequests.map((item) => (
                <div key={item.name} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-[#6b5f55]">{item.docs} · Submitted {item.submitted}</p>
                    <p className="text-xs text-[#6b5f55]">Status: {item.status}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]" onClick={() => updateVerification(item.userId, 'approved', item.entityType)}>Approve</button>
                    <button className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]" onClick={() => updateVerification(item.userId, 'needs_review', item.entityType)}>Request edits</button>
                    <button className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]" onClick={() => updateVerification(item.userId, 'denied', item.entityType)}>Deny</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h2 className="text-xl font-semibold">Verification checklist</h2>
            <p className="mt-2 text-sm text-[#6b5f55]">Minimum requirements to grant a verified badge.</p>
            <ul className="mt-4 space-y-2 text-sm text-[#191919]">
              <li>
                • Government ID uploaded and matched ({verificationChecklist.government_id_matched.done}/{verificationChecklist.government_id_matched.total})
              </li>
              <li>
                • Profile completeness (bio, rates, availability) ({verificationChecklist.profile_completeness.done}/{verificationChecklist.profile_completeness.total})
              </li>
              <li>
                • Certifications/licenses uploaded ({verificationChecklist.certifications_uploaded.done}/{verificationChecklist.certifications_uploaded.total})
              </li>
            </ul>
          </div>
            </section>
            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="glass-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Support console</h2>
              <Link className="text-sm font-semibold text-[#191919] underline" href="/admin/support">
                Open tickets
              </Link>
            </div>
            <p className="mt-2 text-sm text-[#6b5f55]">Unified view of user activity for help and refunds.</p>
            <div className="mt-4 space-y-3 text-sm">
              {supportTickets.length === 0 ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#6b5f55]">
                  No open support tickets.
                </div>
              ) : supportTickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <div>
                    <p className="font-semibold text-[#191919]">{t.subject}</p>
                    <p className="text-xs text-[#6b5f55]">{t.id} · {t.assignee}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">{t.eta}</span>
                    <Link className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]" href="/admin/support">
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h2 className="text-xl font-semibold">Data & compliance</h2>
            <p className="mt-2 text-sm text-[#6b5f55]">KYC/KYB, exports, and deletion requests.</p>
            <div className="mt-4 space-y-3 text-sm text-[#191919]">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="font-semibold">Verifications</p>
                <p className="text-xs text-[#6b5f55]">
                  {dataComplianceSummary.verificationsPending} pending ({dataComplianceSummary.verificationsFlagged} flagged)
                </p>
                <Link className="mt-2 inline-flex rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]" href="/admin/verifications">
                  Open KYC queue
                </Link>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="font-semibold">Data requests</p>
                <p className="text-xs text-[#6b5f55]">{dataComplianceSummary.dataRequests} active retention/export policies</p>
                <Link className="mt-2 inline-flex rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]" href="/admin/retention">
                  Open requests
                </Link>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="font-semibold">Incidents</p>
                <p className="text-xs text-[#6b5f55]">{dataComplianceSummary.incidentsOpen} open incidents</p>
                <Link className="mt-2 inline-flex rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]" href="/admin/uptime">
                  Incident log
                </Link>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                <p className="font-semibold">Audit exports</p>
                <p className="text-xs text-[#6b5f55]">{dataComplianceSummary.auditEvents} logged admin actions.</p>
                <Link className="mt-2 inline-flex rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]" href="/admin/audit">
                  Export audit log
                </Link>
              </div>
            </div>
          </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="glass-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Security controls</h2>
              <button
                className="text-sm font-semibold text-[#191919] underline"
                onClick={saveSecurityConfig}
                type="button"
              >
                {securitySaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
            <p className="mt-2 text-sm text-[#6b5f55]">Organization-wide access protections.</p>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 border-[#191919]"
                  checked={securityConfig.enforce_mfa}
                  onChange={(event) => setSecurityConfig((prev) => ({ ...prev, enforce_mfa: event.target.checked }))}
                />
                <span>
                  Enforce MFA for all admins
                  <p className="text-xs text-[#6b5f55]">Applies to admin console actions.</p>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 border-[#191919]"
                  checked={securityConfig.require_sso}
                  onChange={(event) => setSecurityConfig((prev) => ({ ...prev, require_sso: event.target.checked }))}
                />
                <span>
                  Require SSO for staff access
                  <p className="text-xs text-[#6b5f55]">Applies to admin console actions.</p>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 border-[#191919]"
                  checked={securityConfig.disable_password}
                  onChange={(event) => setSecurityConfig((prev) => ({ ...prev, disable_password: event.target.checked }))}
                />
                <span>
                  Disable password login for admins
                  <p className="text-xs text-[#6b5f55]">Applies to admin console actions.</p>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 border-[#191919]"
                  checked={securityConfig.dual_approval_payouts}
                  onChange={(event) => setSecurityConfig((prev) => ({ ...prev, dual_approval_payouts: event.target.checked }))}
                />
                <span>
                  Require dual approval for payouts
                  <p className="text-xs text-[#6b5f55]">Applies to admin console actions.</p>
                </span>
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-semibold text-[#191919]">IP allowlist</span>
                <input
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  placeholder="Add trusted IPs or ranges"
                  value={securityConfig.ip_allowlist}
                  onChange={(event) => setSecurityConfig((prev) => ({ ...prev, ip_allowlist: event.target.value }))}
                />
              </label>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Audit log</h2>
              <Link className="text-sm font-semibold text-[#191919] underline" href="/admin/audit">
                View full log
              </Link>
            </div>
            <p className="mt-2 text-sm text-[#6b5f55]">Recent sensitive actions.</p>
            <div className="mt-4 space-y-3 text-sm text-[#191919]">
              {auditFeed.length === 0 ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#6b5f55]">
                  No admin audit events yet.
                </div>
              ) : auditFeed.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{entry.action}</p>
                    <span className="text-xs text-[#6b5f55]">{entry.time}</span>
                  </div>
                  <p className="text-xs text-[#6b5f55]">By {entry.actor}</p>
                </div>
              ))}
            </div>
          </div>
            </section>
          </div>
        </div>
      </div>
    </main>
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
      {noticeModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin notice</p>
                <h2 className="mt-2 text-2xl font-semibold">Create notice</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">Broadcast to internal ops or include in digest.</p>
              </div>
              <button
                type="button"
                onClick={() => setNoticeModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                x
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="space-y-2 text-sm">
                <span className="text-xs font-semibold text-[#6b5f55]">Notice</span>
                <textarea
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  rows={4}
                  value={noticeMessage}
                  onChange={(event) => setNoticeMessage(event.target.value)}
                  placeholder="What should the admin team know?"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
                  onClick={createNotice}
                >
                  Publish notice
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                  onClick={() => setNoticeModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
