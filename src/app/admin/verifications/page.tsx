'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AdminSidebar from '@/components/AdminSidebar'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
import { isCoachAthleteLaunch } from '@/lib/launchSurface'

type VerificationDocument = {
  name: string
  path: string
  category: 'gov_id' | 'certifications' | 'org_compliance'
  created_at: string | null
  signed_url: string | null
}

type VerificationItem = {
  id: string
  entity_type?: 'profile' | 'organization'
  name: string
  email: string
  status: string
  submitted_at?: string | null
  reviewed_at?: string | null
  reviewed_by?: string | null
  has_id_document?: boolean
  has_certifications?: boolean
  bio?: string
  certification_name?: string | null
  certification_file_url?: string | null
  requested_docs?: string[]
  request_reason?: string | null
  rejection_reason?: string | null
  internal_note?: string | null
  notes_updated_at?: string | null
  docs_count?: number
  documents?: VerificationDocument[]
}

type VerificationSummary = {
  total: number
  pending: number
  flagged: number
  approved: number
}

type VerificationChecklist = {
  government_id_matched: { done: number; total: number }
  profile_completeness: { done: number; total: number }
  certifications_uploaded: { done: number; total: number }
}

type Pagination = {
  page: number
  page_size: number
  total: number
  has_next: boolean
}

type StatusFilter = 'open' | 'all' | 'pending' | 'needs_review' | 'rejected' | 'denied' | 'approved'

type ReviewModalState = {
  action: 'approve' | 'reject' | 'request_docs'
  item: VerificationItem
  reason: string
  requestedDocs: string
  internalNote: string
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const statusLabel = (status: string) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'needs_review') return 'Needs review'
  if (normalized === 'denied') return 'Denied'
  if (normalized === 'rejected') return 'Rejected'
  if (normalized === 'approved') return 'Approved'
  if (normalized === 'pending') return 'Pending'
  return normalized ? normalized.replace(/_/g, ' ') : 'Pending'
}

const statusTone = (status: string) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'approved') return 'border-[#191919] bg-[#191919] text-white'
  if (normalized === 'rejected' || normalized === 'denied') return 'border-[#b80f0a] bg-[#f2d2d2] text-[#191919]'
  if (normalized === 'needs_review') return 'border-[#191919] bg-[#f5f5f5] text-[#191919]'
  return 'border-[#191919] bg-white text-[#191919]'
}

const entityLabel = (item: VerificationItem) =>
  isCoachAthleteLaunch
    ? 'Coach profile (KYC)'
    : item.entity_type === 'organization'
      ? 'Organization (KYB)'
      : 'Coach profile (KYC)'

export default function AdminVerificationsPage() {
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [queue, setQueue] = useState<VerificationItem[]>([])
  const [summary, setSummary] = useState<VerificationSummary>({ total: 0, pending: 0, flagged: 0, approved: 0 })
  const [checklist, setChecklist] = useState<VerificationChecklist>({
    government_id_matched: { done: 0, total: 0 },
    profile_completeness: { done: 0, total: 0 },
    certifications_uploaded: { done: 0, total: 0 },
  })
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 25, total: 0, has_next: false })
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<VerificationItem | null>(null)
  const [reviewModal, setReviewModal] = useState<ReviewModalState | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [canManageVerifications, setCanManageVerifications] = useState(false)
  const queueSectionRef = useRef<HTMLElement | null>(null)

  const loadQueue = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      page_size: '25',
      status: statusFilter,
      include_docs: '1',
    })
    if (query.trim()) params.set('query', query.trim())

    const response = await fetch(`/api/admin/verifications?${params.toString()}`)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setToast(payload?.error || 'Unable to load verification queue.')
      setLoading(false)
      return
    }

    setQueue(payload.queue || [])
    setCanManageVerifications(Boolean(payload.can_manage))
    setSummary({
      total: Number(payload.summary?.total || 0),
      pending: Number(payload.summary?.pending || 0),
      flagged: Number(payload.summary?.flagged || 0),
      approved: Number(payload.summary?.approved || 0),
    })
    setChecklist({
      government_id_matched: {
        done: Number(payload.checklist?.government_id_matched?.done || 0),
        total: Number(payload.checklist?.government_id_matched?.total || 0),
      },
      profile_completeness: {
        done: Number(payload.checklist?.profile_completeness?.done || 0),
        total: Number(payload.checklist?.profile_completeness?.total || 0),
      },
      certifications_uploaded: {
        done: Number(payload.checklist?.certifications_uploaded?.done || 0),
        total: Number(payload.checklist?.certifications_uploaded?.total || 0),
      },
    })
    setPagination({
      page: Number(payload.pagination?.page || page),
      page_size: Number(payload.pagination?.page_size || 25),
      total: Number(payload.pagination?.total || 0),
      has_next: Boolean(payload.pagination?.has_next),
    })
    setLoading(false)
  }, [page, query, statusFilter])

  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((pagination.total || 0) / (pagination.page_size || 25))),
    [pagination],
  )

  const summaryCards = useMemo(
    () => [
      {
        label: 'In queue',
        value: summary.total.toString(),
        filter: 'open' as StatusFilter,
        detail: 'Open verification submissions waiting for review.',
      },
      {
        label: 'Pending',
        value: summary.pending.toString(),
        filter: 'pending' as StatusFilter,
        detail: 'Submitted coaches currently in review.',
      },
      {
        label: 'Flagged',
        value: summary.flagged.toString(),
        filter: 'needs_review' as StatusFilter,
        detail: 'Profiles that need more docs or manual attention.',
      },
      {
        label: 'Approved total',
        value: summary.approved.toString(),
        filter: 'approved' as StatusFilter,
        detail: 'Approved coaches with completed verification.',
      },
    ],
    [summary],
  )

  const handleSelectSummaryCard = useCallback((filter: StatusFilter) => {
    setStatusFilter(filter)
    setSelectedItem(null)
    setPage(1)
    queueSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const openReviewModal = (item: VerificationItem, action: 'approve' | 'reject' | 'request_docs') => {
    if (!canManageVerifications) {
      setToast('Read-only access. Ops or superadmin is required to change verification status.')
      return
    }
    setReviewModal({
      action,
      item,
      reason: '',
      requestedDocs: (item.requested_docs || []).join(', '),
      internalNote: item.internal_note || '',
    })
  }

  const runReviewAction = async () => {
    if (!canManageVerifications) {
      setToast('Read-only access. Ops or superadmin is required to change verification status.')
      return
    }
    if (!reviewModal) return

    if ((reviewModal.action === 'reject' || reviewModal.action === 'request_docs') && !reviewModal.reason.trim()) {
      setToast('Reason is required for this action.')
      return
    }

    setActionLoading(true)

    const response = await fetch('/api/admin/verifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: reviewModal.action,
        user_id: reviewModal.item.id,
        entity_type: reviewModal.item.entity_type || 'profile',
        reason: reviewModal.reason,
        requested_docs: reviewModal.requestedDocs,
        internal_note: reviewModal.internalNote,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setToast(payload?.error || 'Unable to update verification status.')
      setActionLoading(false)
      return
    }

    setToast(
      reviewModal.action === 'approve'
        ? 'Verification approved.'
        : reviewModal.action === 'reject'
        ? 'Verification rejected.'
        : 'Requested additional documents.',
    )

    setReviewModal(null)
    setSelectedItem((prev) => (prev && prev.id === reviewModal.item.id ? { ...prev, ...(payload?.item || {}) } : prev))
    setActionLoading(false)
    await loadQueue()
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Verifications</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Verification queue</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">
              {isCoachAthleteLaunch
                ? 'Review coach verification submissions, request docs, and resolve decisions.'
                : 'Review KYC/KYB submissions, request docs, and resolve decisions.'}
            </p>
          </div>
          <Link href="/admin" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
            Back to admin
          </Link>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          {summaryCards.map((card) => {
            const active = statusFilter === card.filter
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => handleSelectSummaryCard(card.filter)}
                className={`glass-card rounded-3xl border p-4 text-left transition-colors ${
                  active
                    ? 'border-[#b80f0a] bg-white text-[#191919] ring-2 ring-[#b80f0a]/35'
                    : 'border-[#191919] bg-white text-[#191919] hover:bg-[#f5f5f5]'
                }`}
              >
                <p className={`text-xs uppercase tracking-[0.24em] ${active ? 'text-[#6b5f55]' : 'text-[#6b5f55]'}`}>
                  {card.label}
                </p>
                <p className="mt-2 text-xl font-semibold">{card.value}</p>
                <p className={`mt-2 text-xs ${active ? 'text-[#6b5f55]' : 'text-[#6b5f55]'}`}>
                  {card.detail}
                </p>
              </button>
            )
          })}
        </section>

        <section ref={queueSectionRef} className="mt-4 glass-card border border-[#191919] bg-white p-5 text-sm">
          <h2 className="text-lg font-semibold text-[#191919]">Verification checklist</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.22em] text-[#6b5f55]">Government ID matched</p>
              <p className="mt-2 text-lg font-semibold text-[#191919]">{checklist.government_id_matched.done}/{checklist.government_id_matched.total}</p>
            </div>
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.22em] text-[#6b5f55]">Profile completeness</p>
              <p className="mt-2 text-lg font-semibold text-[#191919]">{checklist.profile_completeness.done}/{checklist.profile_completeness.total}</p>
            </div>
            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.22em] text-[#6b5f55]">Certifications uploaded</p>
              <p className="mt-2 text-lg font-semibold text-[#191919]">{checklist.certifications_uploaded.done}/{checklist.certifications_uploaded.total}</p>
            </div>
          </div>
        </section>

        <section className="mt-4 glass-card border border-[#191919] bg-white p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[#191919]">Queue</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search name, email, status, notes"
                className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919]"
              />
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as StatusFilter)
                  setPage(1)
                }}
                className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919]"
              >
                <option value="open">Open only</option>
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="needs_review">Needs review</option>
                <option value="rejected">Rejected</option>
                <option value="denied">Denied</option>
                <option value="approved">Approved</option>
              </select>
              <button
                type="button"
                className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                onClick={() => {
                  setPage(1)
                  setQuery(queryInput)
                }}
              >
                Apply
              </button>
            </div>
          </div>
          {!canManageVerifications ? (
            <p className="mt-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2 text-xs text-[#6b5f55]">
              Read-only mode: you can review submissions, but only ops/superadmin can approve, reject, or request docs.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 text-xs">
            <button
              type="button"
              className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
              disabled={loading || page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Prev
            </button>
            <span className="font-semibold text-[#6b5f55]">Page {page} / {totalPages}</span>
            <button
              type="button"
              className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] disabled:opacity-50"
              disabled={loading || !pagination.has_next}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Next
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <LoadingState label="Loading verification queue..." />
            ) : queue.length === 0 ? (
              <EmptyState title="No verification requests." description="New verification submissions will show up here." />
            ) : (
              queue.map((item) => (
                <div key={item.id} className="glass-card rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#191919]">{item.name}</p>
                      <p className="text-xs text-[#6b5f55]">{entityLabel(item)}</p>
                      <p className="text-xs text-[#6b5f55]">{item.email || 'No contact email'} · {item.id}</p>
                      <p className="text-xs text-[#6b5f55]">Submitted: {formatDate(item.submitted_at || null)}</p>
                      <p className="text-xs text-[#6b5f55]">Documents: {item.docs_count || 0}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                      <button
                        type="button"
                        className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                        onClick={() => setSelectedItem(item)}
                      >
                        View
                      </button>
                      {canManageVerifications ? (
                        <>
                          <button
                            type="button"
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            onClick={() => openReviewModal(item, 'approve')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            onClick={() => openReviewModal(item, 'request_docs')}
                          >
                            Request docs
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            onClick={() => openReviewModal(item, 'reject')}
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
          </div>
        </div>
      </div>

      {selectedItem ? (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Submission details</p>
                <h2 className="mt-2 text-xl font-semibold text-[#191919]">{selectedItem.name}</h2>
                <p className="mt-1 text-xs text-[#6b5f55]">{entityLabel(selectedItem)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-xs text-[#4a4a4a]">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">Status</p>
                <p className="mt-2 text-sm font-semibold text-[#191919]">{statusLabel(selectedItem.status)}</p>
                <p className="mt-1">Submitted: {formatDate(selectedItem.submitted_at)}</p>
                <p>Reviewed: {formatDate(selectedItem.reviewed_at)}</p>
                {selectedItem.request_reason ? <p className="mt-2">Request reason: {selectedItem.request_reason}</p> : null}
                {selectedItem.rejection_reason ? <p className="mt-1">Rejection reason: {selectedItem.rejection_reason}</p> : null}
                {selectedItem.internal_note ? <p className="mt-1">Internal note: {selectedItem.internal_note}</p> : null}
              </div>

              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-xs text-[#4a4a4a]">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">Profile checks</p>
                {selectedItem.entity_type === 'organization' ? (
                  <>
                    <p className="mt-2">Mission/overview: {selectedItem.bio ? 'Present' : 'Missing'}</p>
                    <p>Compliance docs: {(selectedItem.docs_count || 0) > 0 ? 'Uploaded' : 'Missing'}</p>
                    <p>Contact email: {selectedItem.email || 'Missing'}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-2">Bio: {selectedItem.bio ? 'Present' : 'Missing'}</p>
                    <p>ID flag: {selectedItem.has_id_document ? 'Submitted' : 'Missing'}</p>
                    <p>Cert flag: {selectedItem.has_certifications ? 'Submitted' : 'Missing'}</p>
                    <p>Cert name: {selectedItem.certification_name || 'Not listed'}</p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-xs text-[#4a4a4a]">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b5f55]">Documents</p>
              {!selectedItem.documents || selectedItem.documents.length === 0 ? (
                <p className="mt-2">No uploaded verification documents found.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {selectedItem.documents.map((doc) => (
                    <div key={doc.path} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dcdcdc] bg-white px-3 py-2">
                      <p>
                        <span className="font-semibold text-[#191919]">{doc.name}</span>
                        <span className="ml-2 text-[#6b5f55]">{doc.category}</span>
                      </p>
                      {doc.signed_url ? (
                        <a
                          href={doc.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                        >
                          Open document
                        </a>
                      ) : (
                        <span className="text-[#6b5f55]">No preview link</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {selectedItem.certification_file_url ? (
                <div className="mt-2">
                  <a
                    href={selectedItem.certification_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                  >
                    Open certification link
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {reviewModal ? (
        <div className="fixed inset-0 z-[710] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <h2 className="text-xl font-semibold text-[#191919]">
              {reviewModal.action === 'approve'
                ? 'Approve verification'
                : reviewModal.action === 'reject'
                ? 'Reject verification'
                : 'Request additional docs'}
            </h2>
            <p className="mt-1 text-xs text-[#6b5f55]">{entityLabel(reviewModal.item)}</p>
            <p className="mt-2 text-sm text-[#6b5f55]">{reviewModal.item.name} · {reviewModal.item.email || reviewModal.item.id}</p>

            {reviewModal.action !== 'approve' ? (
              <>
                <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">Reason</label>
                <textarea
                  value={reviewModal.reason}
                  onChange={(event) => setReviewModal((prev) => (prev ? { ...prev, reason: event.target.value } : prev))}
                  className="mt-1 h-20 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  placeholder={reviewModal.action === 'reject' ? 'Why is this rejected?' : 'What documents are missing?'}
                />
              </>
            ) : null}

            {reviewModal.action === 'request_docs' ? (
              <>
                <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">Requested docs (comma separated)</label>
                <input
                  value={reviewModal.requestedDocs}
                  onChange={(event) => setReviewModal((prev) => (prev ? { ...prev, requestedDocs: event.target.value } : prev))}
                  className="mt-1 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  placeholder="government_id, certification_license"
                />
              </>
            ) : null}

            <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.2em] text-[#6b5f55]">Internal note</label>
            <textarea
              value={reviewModal.internalNote}
              onChange={(event) => setReviewModal((prev) => (prev ? { ...prev, internalNote: event.target.value } : prev))}
              className="mt-1 h-16 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
              placeholder="Optional note for ops"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                onClick={() => setReviewModal(null)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full border border-[#b80f0a] bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-[#191919] hover:bg-[#191919] disabled:cursor-not-allowed disabled:border-[#b80f0a] disabled:bg-[#b80f0a] disabled:text-white disabled:opacity-60"
                onClick={runReviewAction}
                disabled={actionLoading}
              >
                {actionLoading ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}
