'use client'

import { useEffect, useMemo, useState } from 'react'
import CoachSidebar from '@/components/CoachSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Toast from '@/components/Toast'

type Review = {
  id: string
  athlete_id: string | null
  reviewer_name: string | null
  rating: number
  body: string | null
  status: 'pending' | 'approved' | 'rejected'
  coach_response: string | null
  coach_response_at: string | null
  created_at: string
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= rating ? 'text-[#b80f0a]' : 'text-[#dcdcdc]'}>
          ★
        </span>
      ))}
    </span>
  )
}

export default function CoachReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const res = await fetch('/api/coach/reviews')
      if (!res.ok || !active) { setLoading(false); return }
      const payload = await res.json().catch(() => null)
      if (active) setReviews(payload?.reviews || [])
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return reviews
    return reviews.filter((r) => r.status === filter)
  }, [reviews, filter])

  const stats = useMemo(() => {
    const approved = reviews.filter((r) => r.status === 'approved')
    const avg = approved.length
      ? (approved.reduce((sum, r) => sum + r.rating, 0) / approved.length).toFixed(1)
      : '—'
    return { total: reviews.length, approved: approved.length, avg }
  }, [reviews])

  const handleRespond = async (reviewId: string) => {
    if (!responseText.trim()) return
    setSubmitting(true)
    const res = await fetch('/api/coach/reviews/response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_id: reviewId, coach_response: responseText.trim() }),
    })
    const payload = await res.json().catch(() => null)
    setSubmitting(false)
    if (!res.ok) {
      setToast(payload?.error || 'Failed to submit response.')
      return
    }
    setReviews((prev) => prev.map((r) => r.id === reviewId ? { ...r, ...payload.review } : r))
    setResponding(null)
    setResponseText('')
    setToast('Response submitted.')
  }

  const statusBadge = (status: Review['status']) => {
    const classes: Record<Review['status'], string> = {
      approved: 'bg-[#e6f9f0] text-[#1a7a4a]',
      pending: 'bg-[#fef9e6] text-[#a06a00]',
      rejected: 'bg-[#fce8e8] text-[#b80f0a]',
    }
    return (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${classes[status]}`}>
        {status}
      </span>
    )
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Reputation</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Reviews</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Athlete reviews of your coaching, with response capability.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                { label: 'Total reviews', value: stats.total.toString() },
                { label: 'Approved reviews', value: stats.approved.toString() },
                { label: 'Average rating', value: stats.avg },
              ].map((item) => (
                <div key={item.label} className="glass-card border border-[#191919] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{item.value}</p>
                </div>
              ))}
            </section>

            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#191919]">All reviews</h2>
                <div className="flex flex-wrap gap-2 text-xs">
                  {(['all', 'approved', 'pending', 'rejected'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFilter(tab)}
                      className={`rounded-full border px-3 py-1 font-semibold transition ${
                        filter === tab ? 'border-[#191919] text-[#191919]' : 'border-[#dcdcdc] text-[#6b5f55]'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {loading ? (
                  <p className="text-sm text-[#6b5f55]">Loading reviews…</p>
                ) : filtered.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] p-6 text-center text-sm text-[#6b5f55]">
                    No reviews yet. Reviews submitted by athletes will appear here.
                  </div>
                ) : (
                  filtered.map((review) => (
                    <div key={review.id} className="rounded-2xl border border-[#dcdcdc] bg-white p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <StarRating rating={review.rating} />
                            <span className="text-sm font-semibold text-[#191919]">
                              {review.reviewer_name || 'Anonymous'}
                            </span>
                            {statusBadge(review.status)}
                          </div>
                          <p className="mt-0.5 text-xs text-[#6b5f55]">
                            {new Date(review.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {review.body && (
                        <p className="mt-3 text-sm text-[#4a4a4a]">{review.body}</p>
                      )}

                      {review.coach_response ? (
                        <div className="mt-3 rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-widest text-[#6b5f55]">Your response</p>
                          <p className="mt-1 text-sm text-[#4a4a4a]">{review.coach_response}</p>
                          <p className="mt-1 text-xs text-[#6b5f55]">
                            {review.coach_response_at ? new Date(review.coach_response_at).toLocaleDateString() : ''}
                          </p>
                        </div>
                      ) : responding === review.id ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={responseText}
                            onChange={(e) => setResponseText(e.target.value)}
                            rows={3}
                            placeholder="Write a professional response..."
                            className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-4 py-2 text-sm text-[#191919]"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleRespond(review.id)}
                              disabled={submitting || !responseText.trim()}
                              className="rounded-full bg-[#b80f0a] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {submitting ? 'Submitting…' : 'Submit response'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setResponding(null); setResponseText('') }}
                              className="rounded-full border border-[#dcdcdc] px-4 py-1.5 text-xs font-semibold text-[#6b5f55]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setResponding(review.id); setResponseText('') }}
                          className="mt-3 text-xs font-semibold text-[#b80f0a]"
                        >
                          Respond →
                        </button>
                      )}
                    </div>
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
