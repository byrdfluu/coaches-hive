'use client'

import { useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type ReviewRow = {
  id: string
  coach_id?: string | null
  athlete_id?: string | null
  reviewer_name?: string | null
  rating?: number | null
  body?: string | null
  status?: string | null
  created_at?: string | null
}

const statusLabel = (value: string) => {
  const normalized = value.toLowerCase()
  if (normalized === 'approved') return 'Approved'
  if (normalized === 'rejected') return 'Rejected'
  return 'Pending'
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [coaches, setCoaches] = useState<Record<string, { name: string; email: string }>>({})
  const [athletes, setAthletes] = useState<Record<string, { name: string; email: string }>>({})
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const loadReviews = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch('/api/admin/reviews')
      if (!response.ok) {
        if (active) {
          setNotice('Unable to load reviews.')
          setLoading(false)
        }
        return
      }
      const payload = await response.json()
      if (!active) return
      setReviews((payload.reviews || []) as ReviewRow[])
      setCoaches(payload.coaches || {})
      setAthletes(payload.athletes || {})
      setLoading(false)
    }
    loadReviews()
    return () => {
      active = false
    }
  }, [])

  const summary = useMemo(() => {
    const pending = reviews.filter((review) => String(review.status || '').toLowerCase() === 'pending').length
    const approved = reviews.filter((review) => String(review.status || '').toLowerCase() === 'approved').length
    const rejected = reviews.filter((review) => String(review.status || '').toLowerCase() === 'rejected').length
    return { pending, approved, rejected }
  }, [reviews])

  const filteredReviews = useMemo(
    () => reviews.filter((review) => !statusFilter || String(review.status || 'pending').toLowerCase() === statusFilter),
    [reviews, statusFilter],
  )

  const handleStatusUpdate = async (reviewId: string, status: string) => {
    const response = await fetch('/api/admin/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_id: reviewId, status }),
    })
    if (!response.ok) {
      setNotice('Unable to update review.')
      return
    }
    const payload = await response.json()
    setReviews((prev) => prev.map((review) => (review.id === reviewId ? payload.review : review)))
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Coach reviews</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Moderate athlete feedback before it goes live.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              {[
                { label: 'Pending', value: summary.pending.toString(), key: 'pending' },
                { label: 'Approved', value: summary.approved.toString(), key: 'approved' },
                { label: 'Rejected', value: summary.rejected.toString(), key: 'rejected' },
              ].map((stat) => {
                const isActive = statusFilter === stat.key
                return (
                  <button
                    key={stat.label}
                    type="button"
                    onClick={() => setStatusFilter(isActive ? null : stat.key)}
                    className={`glass-card border p-5 text-left transition-colors ${isActive ? 'border-[#b80f0a] bg-[#fff5f5]' : 'border-[#191919] bg-white hover:bg-[#f5f5f5]'}`}
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                  </button>
                )
              })}
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Review + trust engine</h2>
                  <p className="mt-1 text-sm text-[#6b5f55]">How reviews build trust across the marketplace.</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
                <p>Verified reviews: only allow reviews after a completed, paid session so ratings are tied to real outcomes.</p>
                <p>Coach response prompts: nudge coaches to reply to reviews to add context and show accountability.</p>
                <p>Trust score in discovery: a composite signal (completion rate, response time, cancellations, review quality) that helps rank/label coaches in search.</p>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Review queue</h2>
                  <p className="text-sm text-[#6b5f55]">Approve or reject pending reviews.</p>
                </div>
              </div>
              {notice ? <p className="mt-3 text-xs text-[#6b5f55]">{notice}</p> : null}
              <div className="mt-4 space-y-3 text-sm">
                {loading ? (
                  <LoadingState label="Loading reviews..." />
                ) : filteredReviews.length === 0 ? (
                  <EmptyState title="No reviews yet." description={statusFilter ? `No ${statusFilter} reviews.` : 'Pending reviews will appear here for approval.'} />
                ) : (
                  filteredReviews.map((review) => {
                    const coachName = review.coach_id ? coaches[review.coach_id]?.name || 'Coach' : 'Coach'
                    const athleteName =
                      review.reviewer_name || (review.athlete_id ? athletes[review.athlete_id]?.name : '') || 'Athlete'
                    const status = statusLabel(String(review.status || 'pending'))
                    const createdAt = review.created_at
                      ? new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : ''
                    const isPending = status.toLowerCase() === 'pending'
                    return (
                      <div key={review.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[#191919]">{coachName}</p>
                            <p className="text-xs text-[#6b5f55]">
                              {athleteName} · {review.rating || 0}★ · {createdAt}
                            </p>
                          </div>
                          <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                            {status}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-[#191919]">{review.body}</p>
                        {isPending ? (
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <button
                              type="button"
                              className="rounded-full bg-[#b80f0a] px-3 py-1 font-semibold text-white"
                              onClick={() => handleStatusUpdate(review.id, 'approved')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]"
                              onClick={() => handleStatusUpdate(review.id, 'rejected')}
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
