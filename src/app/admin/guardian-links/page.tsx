'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'

type GuardianLinkRow = {
  id: string
  guardian_user_id: string | null
  athlete_id: string
  relationship: string | null
  status: 'active' | 'pending' | 'revoked'
  created_at: string
  updated_at: string
  source?: 'link' | 'invite'
  invite_expires_at?: string | null
  athlete_name: string
  athlete_email?: string | null
  athlete_role?: string | null
  guardian_name?: string | null
  guardian_email?: string | null
  guardian_role?: string | null
}

type GuardianLinksSummary = {
  total: number
  active: number
  pending: number
  revoked: number
  duplicate_guardian_emails: number
}

type GuardianCandidate = {
  id: string
  full_name?: string | null
  email?: string | null
  role?: string | null
  account_owner_type?: string | null
}

type DuplicateGuardianEmailCluster = {
  email: string
  members: GuardianCandidate[]
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function AdminGuardianLinksPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [rows, setRows] = useState<GuardianLinkRow[]>([])
  const [summary, setSummary] = useState<GuardianLinksSummary | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'revoked'>('all')
  const [guardianCandidates, setGuardianCandidates] = useState<GuardianCandidate[]>([])
  const [duplicateGuardianEmails, setDuplicateGuardianEmails] = useState<DuplicateGuardianEmailCluster[]>([])
  const [relinkAthleteId, setRelinkAthleteId] = useState('')
  const [relinkGuardianUserId, setRelinkGuardianUserId] = useState('')
  const [mergeSourceGuardianUserId, setMergeSourceGuardianUserId] = useState('')
  const [mergeTargetGuardianUserId, setMergeTargetGuardianUserId] = useState('')

  const fetchLinks = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (query.trim()) params.set('query', query.trim())
    params.set('limit', '500')

    const response = await fetch(`/api/admin/guardian-links?${params.toString()}`)
    if (!response.ok) {
      setRows([])
      setSummary(null)
      setGuardianCandidates([])
      setDuplicateGuardianEmails([])
      setLoading(false)
      return
    }

    const payload = await response.json().catch(() => null)
    setRows((payload?.links || []) as GuardianLinkRow[])
    setSummary((payload?.summary || null) as GuardianLinksSummary | null)
    setGuardianCandidates((payload?.guardianCandidates || []) as GuardianCandidate[])
    setDuplicateGuardianEmails((payload?.duplicateGuardianEmails || []) as DuplicateGuardianEmailCluster[])
    setLoading(false)
  }, [query, statusFilter])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  const runAction = async (payload: Record<string, string | null>, successMessage: string) => {
    const reason = window.prompt('Optional reason for audit log:') || ''
    setSaving(true)
    const response = await fetch('/api/admin/guardian-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, reason }),
    })
    setSaving(false)
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      setToast(data?.error || 'Unable to run guardian links action.')
      return
    }
    setToast(successMessage)
    await fetchLinks()
  }

  const sortedRows = useMemo(
    () => rows.slice().sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [rows],
  )

  const canRunRelink = relinkAthleteId.trim().length > 0 && relinkGuardianUserId.trim().length > 0
  const canRunMerge =
    mergeSourceGuardianUserId.trim().length > 0
    && mergeTargetGuardianUserId.trim().length > 0
    && mergeSourceGuardianUserId.trim() !== mergeTargetGuardianUserId.trim()

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Guardian links</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">
              Manage athlete-to-guardian links, relink records, and resolve duplicate guardian accounts.
            </p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Total links</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.total || 0}</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Active</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.active || 0}</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Pending</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.pending || 0}</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Revoked</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.revoked || 0}</p>
              </article>
              <article className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Duplicate emails</p>
                <p className="mt-3 text-2xl font-semibold text-[#191919]">{summary?.duplicate_guardian_emails || 0}</p>
              </article>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search athlete, guardian, relationship, status"
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                  className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="revoked">Revoked</option>
                </select>
                <button
                  type="button"
                  onClick={fetchLinks}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    if (!canRunMerge) {
                      setToast('Enter source + target guardian ids first.')
                      return
                    }
                    await runAction(
                      {
                        action: 'merge_duplicate_guardians',
                        source_guardian_user_id: mergeSourceGuardianUserId.trim(),
                        target_guardian_user_id: mergeTargetGuardianUserId.trim(),
                      },
                      'Duplicate guardian records merged.',
                    )
                    setMergeSourceGuardianUserId('')
                  }}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] disabled:opacity-60"
                >
                  Merge guardians
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Relink athlete guardian</p>
                  <div className="mt-3 grid gap-2">
                    <input
                      value={relinkAthleteId}
                      onChange={(event) => setRelinkAthleteId(event.target.value)}
                      placeholder="Athlete user id"
                      className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    />
                    <select
                      value={relinkGuardianUserId}
                      onChange={(event) => setRelinkGuardianUserId(event.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    >
                      <option value="">Select guardian user id</option>
                      {guardianCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.full_name || candidate.email || candidate.id} · {candidate.email || 'no-email'}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={saving || !canRunRelink}
                      onClick={async () => {
                        await runAction(
                          {
                            action: 'relink_guardian',
                            athlete_id: relinkAthleteId.trim(),
                            guardian_user_id: relinkGuardianUserId.trim(),
                          },
                          'Guardian relinked.',
                        )
                      }}
                      className="rounded-full bg-[#191919] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Relink now
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Merge duplicate guardians</p>
                  <div className="mt-3 grid gap-2">
                    <input
                      value={mergeSourceGuardianUserId}
                      onChange={(event) => setMergeSourceGuardianUserId(event.target.value)}
                      placeholder="Source guardian user id"
                      className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    />
                    <input
                      value={mergeTargetGuardianUserId}
                      onChange={(event) => setMergeTargetGuardianUserId(event.target.value)}
                      placeholder="Target guardian user id"
                      className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    />
                    <p className="text-xs text-[#6b5f55]">
                      Source links move to target. Duplicate links are revoked automatically.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Duplicate guardian email clusters</p>
                {duplicateGuardianEmails.length === 0 ? (
                  <p className="text-xs text-[#6b5f55]">No duplicate guardian emails detected.</p>
                ) : (
                  duplicateGuardianEmails.map((cluster) => (
                    <article key={cluster.email} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs">
                      <p className="font-semibold text-[#191919]">{cluster.email}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[#6b5f55]">
                        {cluster.members.map((member) => (
                          <span key={member.id} className="rounded-full border border-[#191919] px-2 py-1 text-[11px] text-[#191919]">
                            {(member.full_name || member.email || member.id).slice(0, 42)} · {member.id.slice(0, 8)}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Guardian athlete links</h2>
              <div className="mt-4 space-y-3 text-sm">
                {loading ? (
                  <LoadingState label="Loading guardian links..." />
                ) : sortedRows.length === 0 ? (
                  <EmptyState title="No guardian links found." description="Adjust filters to see link records." />
                ) : (
                  sortedRows.map((row) => (
                    <article key={row.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#191919]">{row.athlete_name}</p>
                          <p className="text-xs text-[#6b5f55]">{row.athlete_email || 'No athlete email'}</p>
                          <p className="mt-1 text-xs text-[#6b5f55]">
                            Guardian {row.guardian_name || 'Unknown'} · {row.guardian_email || 'No guardian email'}
                          </p>
                          <p className="text-xs text-[#6b5f55]">
                            Relationship {row.relationship || 'parent'} · Updated {formatDateTime(row.updated_at)}
                          </p>
                          {row.source === 'invite' ? (
                            <p className="text-xs text-[#6b5f55]">
                              Invite pending{row.invite_expires_at ? ` · Expires ${formatDateTime(row.invite_expires_at)}` : ''}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[#191919] px-3 py-1 text-[11px] font-semibold text-[#191919]">
                            {row.source === 'invite' ? 'invite pending' : row.status}
                          </span>
                          {row.source === 'link' ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={async () => {
                                const guardianUserId = window.prompt('New guardian user id for this athlete?', '')
                                if (!guardianUserId?.trim()) return
                                await runAction(
                                  {
                                    action: 'relink_guardian',
                                    athlete_id: row.athlete_id,
                                    guardian_user_id: guardianUserId.trim(),
                                  },
                                  'Guardian relinked for athlete.',
                                )
                              }}
                              className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                            >
                              Relink
                            </button>
                          ) : null}
                          {row.source === 'link' && row.status !== 'revoked' ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={async () => {
                                await runAction(
                                  {
                                    action: 'revoke_link',
                                    link_id: row.id,
                                  },
                                  'Guardian link revoked.',
                                )
                              }}
                              className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                            >
                              Revoke
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}
