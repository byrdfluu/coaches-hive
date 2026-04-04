'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'

type ApprovalItem = {
  id: string
  athlete_id?: string
  athlete_name?: string
  target_type: string
  scope?: 'messages' | 'transactions' | null
  target_id?: string
  target_label?: string | null
  status: string
  created_at: string
  guardian_needs_account?: boolean
}

export default function GuardianApprovalsPublicPage() {
  const searchParams = useSearchParams()
  const token = searchParams?.get('token') || ''
  const [loading, setLoading] = useState(true)
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [toast, setToast] = useState('')
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const fetchApprovals = useCallback(async () => {
    if (!token) {
      setApprovals([])
      setLoading(false)
      return
    }

    setLoading(true)
    const response = await fetch(`/api/guardian-approvals?token=${encodeURIComponent(token)}`)
    if (!response.ok) {
      setApprovals([])
      setLoading(false)
      return
    }

    const payload = await response.json().catch(() => ({}))
    if (payload?.approval) {
      setApprovals([payload.approval])
    } else {
      setApprovals(payload?.approvals || [])
    }
    setLoading(false)
  }, [token])

  useEffect(() => {
    fetchApprovals()
  }, [fetchApprovals])

  const pendingApprovals = useMemo(
    () => approvals.filter((approval) => approval.status === 'pending'),
    [approvals]
  )

  const handleAction = async (approval: ApprovalItem, action: 'approve' | 'deny') => {
    setSubmittingId(approval.id)
    const response = await fetch('/api/guardian-approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setToast(payload?.error || 'Unable to update approval request.')
      setSubmittingId(null)
      return
    }
    setToast(action === 'approve' ? 'Approved request.' : 'Denied request.')
    setSubmittingId(null)
    fetchApprovals()
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-10">
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Guardian approvals</p>
          <h1 className="display text-3xl font-semibold text-[#191919]">Review athlete requests.</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">
            Approve or deny messaging and booking/payment requests from your athlete.
          </p>
        </header>

        {!token ? (
          <div className="mt-6 glass-card border border-[#191919] bg-white p-6">
            <EmptyState
              title="Invalid approval link."
              description="Use the full link from your email, or ask for a new approval email."
            />
            <div className="mt-4">
              <Link
                href="/login"
                className="inline-flex rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-sm font-semibold text-[#191919] shadow-[0_6px_18px_rgba(25,25,25,0.06)]"
              >
                Go to sign in
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 glass-card border border-[#191919] bg-white p-6">
            {loading ? (
              <LoadingState label="Loading approval..." />
            ) : approvals.length > 0 && approvals[0].guardian_needs_account ? (
              <div className="space-y-3 text-sm text-[#191919]">
                <p className="font-semibold">Set up your guardian account first.</p>
                <p className="text-[#4a4a4a]">
                  You need to accept your guardian invite and create an account before you can review this request.
                  Check your email for a separate invite link from Coaches Hive.
                </p>
                <Link
                  href="/login"
                  className="inline-flex rounded-full border border-[#191919] bg-white px-4 py-2 text-xs font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Already have an account? Sign in →
                </Link>
              </div>
            ) : pendingApprovals.length === 0 ? (
              <EmptyState title="No pending approvals." description="This request has already been handled." />
            ) : (
              <div className="space-y-4 text-sm">
                {pendingApprovals.map((approval) => (
                  <div
                    key={approval.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Request</p>
                      <p className="mt-2 font-semibold text-[#191919]">
                        {approval.athlete_name || 'Athlete'} requested{' '}
                        {approval.scope === 'transactions' ? 'booking and payments' : 'messaging'} with{' '}
                        {approval.target_label || 'this contact'}.
                      </p>
                      <p className="text-xs text-[#4a4a4a]">
                        Type: {approval.target_type.toUpperCase()} · Scope:{' '}
                        {approval.scope === 'transactions' ? 'TRANSACTIONS' : 'MESSAGES'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => handleAction(approval, 'deny')}
                        className="rounded-full border border-[#191919] px-4 py-2 text-[#191919] hover:text-[#b80f0a] transition-colors"
                        disabled={submittingId === approval.id}
                      >
                        Deny
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction(approval, 'approve')}
                        className="rounded-full bg-[#b80f0a] px-4 py-2 text-white hover:opacity-90 transition-opacity"
                        disabled={submittingId === approval.id}
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}
