'use client'

import { useEffect, useState } from 'react'
import posthog from 'posthog-js'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'

type WaiverItem = {
  id: string
  title: string
  body: string
  org_name: string
  required_roles: string[]
  created_at: string
  signed_at?: string
  full_name?: string
}

export default function AthleteWaiversPage() {
  const [pending, setPending] = useState<WaiverItem[]>([])
  const [signed, setSigned] = useState<WaiverItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [signingId, setSigningId] = useState<string | null>(null)
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({})
  const [agreedToTerms, setAgreedToTerms] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState<Record<string, string>>({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const res = await fetch('/api/waivers/pending')
      if (res.ok) {
        const data = await res.json()
        setPending(data.pending || [])
        setSigned(data.signed || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleSign = async (waiverId: string) => {
    const fullName = (nameInputs[waiverId] || '').trim()
    if (!fullName) {
      setNotice((prev) => ({ ...prev, [waiverId]: 'Please enter your full name to sign.' }))
      return
    }
    setSigningId(waiverId)
    setNotice((prev) => ({ ...prev, [waiverId]: '' }))
    const res = await fetch('/api/waivers/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waiver_id: waiverId, full_name: fullName }),
    })
    const data = await res.json()
    if (!res.ok) {
      setNotice((prev) => ({ ...prev, [waiverId]: data.error || 'Failed to sign waiver.' }))
      setSigningId(null)
      return
    }
    // Move from pending to signed
    const waiver = pending.find((w) => w.id === waiverId)
    if (waiver) {
      posthog.capture('waiver_signed', {
        waiver_id: waiverId,
        waiver_title: waiver.title,
        org_name: waiver.org_name,
      })
      setPending((prev) => prev.filter((w) => w.id !== waiverId))
      setSigned((prev) => [
        { ...waiver, signed_at: new Date().toISOString(), full_name: fullName },
        ...prev,
      ])
    }
    setExpanded(null)
    setSigningId(null)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athlete</p>
          <h1 className="display text-3xl font-semibold text-[#191919]">Waivers &amp; Consent</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">
            Review and sign participation waivers required by your organizations.
          </p>
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">

            {loading ? (
              <div className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#4a4a4a]">
                Loading waivers…
              </div>
            ) : (
              <>
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <h2 className="text-lg font-semibold text-[#191919]">Requires your signature</h2>
                  {pending.length === 0 ? (
                    <p className="mt-3 text-sm text-[#4a4a4a]">
                      No pending waivers. You&apos;re all caught up.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {pending.map((waiver) => (
                        <div key={waiver.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-[#191919]">{waiver.title}</p>
                              <p className="mt-0.5 text-xs text-[#4a4a4a]">{waiver.org_name}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setExpanded((prev) => prev === waiver.id ? null : waiver.id)}
                              className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            >
                              {expanded === waiver.id ? 'Collapse' : 'Review & sign'}
                            </button>
                          </div>

                          {expanded === waiver.id && (
                            <div className="mt-4 space-y-4">
                              <div className="max-h-64 overflow-y-auto rounded-xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#4a4a4a] whitespace-pre-wrap">
                                {waiver.body}
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-[#4a4a4a]">
                                  Type your full name to sign
                                </label>
                                <input
                                  value={nameInputs[waiver.id] || ''}
                                  onChange={(e) =>
                                    setNameInputs((prev) => ({ ...prev, [waiver.id]: e.target.value }))
                                  }
                                  placeholder="Your full name"
                                  className="mt-1 w-full rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                                />
                              </div>
                              {notice[waiver.id] && (
                                <p className="text-xs text-[#b80f0a]">{notice[waiver.id]}</p>
                              )}
                              <label className="flex items-start gap-2 text-xs text-[#4a4a4a] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={agreedToTerms[waiver.id] || false}
                                  onChange={(e) =>
                                    setAgreedToTerms((prev) => ({ ...prev, [waiver.id]: e.target.checked }))
                                  }
                                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#b80f0a]"
                                />
                                <span>I agree this constitutes my legal electronic signature</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => handleSign(waiver.id)}
                                disabled={signingId === waiver.id || !agreedToTerms[waiver.id] || !(nameInputs[waiver.id] || '').trim()}
                                className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {signingId === waiver.id ? 'Signing…' : 'Sign waiver'}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {signed.length > 0 && (
                  <section className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Signed</h2>
                    <div className="mt-4 space-y-3 text-sm">
                      {signed.map((waiver) => (
                        <div
                          key={waiver.id}
                          className="flex items-start justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                        >
                          <div>
                            <p className="font-semibold text-[#191919]">{waiver.title}</p>
                            <p className="mt-0.5 text-xs text-[#4a4a4a]">
                              {waiver.org_name} &middot; Signed as &quot;{waiver.full_name}&quot; &middot;{' '}
                              {waiver.signed_at
                                ? new Date(waiver.signed_at).toLocaleDateString()
                                : 'Recently'}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                              Signed
                            </span>
                            <a
                              href={`/api/waivers/${waiver.id}/signed-record`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-[#4a4a4a] underline hover:text-[#191919]"
                            >
                              Download record
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
