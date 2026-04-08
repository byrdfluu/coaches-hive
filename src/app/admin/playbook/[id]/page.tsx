'use client'

import Link from 'next/link'
import { use, useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'

type SopItem = { id: string; title: string; owner: string; lastUpdated: string }
type SopDetail = { summary: string; checklist: string[]; successSignals: string[]; notes: string[] }

const SOP_DETAILS: Record<string, SopDetail> = {
  'sop-1': {
    summary: 'Handle marketplace disputes from intake through resolution.',
    checklist: [
      'Verify dispute details and deadline',
      'Collect evidence from org/coach',
      'Submit response via processor',
      'Update requester with resolution timeline',
    ],
    successSignals: ['Evidence submitted on time', 'User updated', 'Outcome documented'],
    notes: ['Escalate if deadline < 72 hours.'],
  },
  'sop-2': {
    summary: 'Standard onboarding flow for new org admins with first-week follow-ups.',
    checklist: [
      'Confirm org profile + branding',
      'Add teams and coaches',
      'Configure payments + fee policies',
      'Invite staff + verify roles',
      'Send welcome announcement',
    ],
    successSignals: ['2+ teams created', 'Payments connected', 'First announcement sent'],
    notes: ['Escalate if payments are not connected within 48 hours.'],
  },
  'sop-3': {
    summary: 'Review coach applications and verification steps.',
    checklist: [
      'Confirm identity documents',
      'Validate certifications',
      'Review profile completeness',
      'Approve or request updates',
    ],
    successSignals: ['Verification decision logged', 'Coach notified'],
    notes: ['Route high-risk flags to compliance.'],
  },
  'sop-4': {
    summary: 'Billing questions, chargebacks, and refund workflow.',
    checklist: [
      'Verify payment details',
      'Confirm refund eligibility',
      'Coordinate with payouts if needed',
      'Send final confirmation',
    ],
    successSignals: ['Refund action logged', 'Receipt shared'],
    notes: ['Escalate refunds over $500 to finance.'],
  },
}

export default function AdminSopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [sop, setSop] = useState<SopItem | null>(null)
  const [sopDetails, setSopDetails] = useState<Record<string, SopDetail>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const response = await fetch('/api/admin/playbook')
      if (!response.ok) {
        if (active) {
          setError('Unable to load SOP.')
          setLoading(false)
        }
        return
      }
      const payload = await response.json()
      if (!active) return
      const library = (payload.config?.sopLibrary || []) as SopItem[]
      setSopDetails((payload.config?.sopDetails || {}) as Record<string, SopDetail>)
      const matched = library.find((item) => item.id === id) || null
      setSop(matched)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [id])

  const details = useMemo(() => {
    if (sopDetails?.[id]) return sopDetails[id]
    if (id in SOP_DETAILS) return SOP_DETAILS[id]
    return {
      summary: 'Standard operating procedure for internal admin workflows.',
      checklist: ['Review inputs', 'Complete required actions', 'Document outcomes'],
      successSignals: ['Task completed', 'Audit notes saved'],
      notes: ['Escalate blockers to ops lead.'],
    }
  }, [id, sopDetails])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Admin playbook</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">{sop?.title || 'SOP detail'}</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">{sop ? `Owner: ${sop.owner} · Updated ${sop.lastUpdated}` : 'Loading SOP details'}</p>
          </div>
          <Link
            href="/admin/playbook"
            className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
          >
            Back to playbook
          </Link>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            {loading ? <LoadingState label="Loading SOP..." /> : null}
            {error ? (
              <div className="rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-sm text-[#4a4a4a]">
                {error}
              </div>
            ) : null}
            {!loading && !error ? (
              <>
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Overview</p>
                  <h2 className="mt-2 text-lg font-semibold text-[#191919]">Summary</h2>
                  <p className="mt-2 text-sm text-[#4a4a4a]">{details.summary}</p>
                </section>

                <section className="glass-card border border-[#191919] bg-white p-6">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Checklist</p>
                  <div className="mt-4 space-y-2 text-sm">
                    {details.checklist.map((item) => (
                      <div key={item} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        {item}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid gap-6 md:grid-cols-2">
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Success signals</p>
                    <ul className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
                      {details.successSignals.map((item) => (
                        <li key={item} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          <span className="font-semibold text-[#191919]">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Notes</p>
                    <ul className="mt-4 space-y-2 text-sm text-[#4a4a4a]">
                      {details.notes.map((item) => (
                        <li key={item} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
