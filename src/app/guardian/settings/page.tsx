'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import GuardianSidebar from '@/components/GuardianSidebar'

type LinkedAthlete = {
  id: string
  athlete_id: string
  status: string
  related_profile?: {
    full_name?: string | null
    email?: string | null
    role?: string | null
  } | null
}

export default function GuardianSettingsPage() {
  const [athletes, setAthletes] = useState<LinkedAthlete[]>([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState('')
  const [linkEmail, setLinkEmail] = useState('')
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [linkSuccess, setLinkSuccess] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const res = await fetch('/api/guardian-links')
      if (res.ok) {
        const data = await res.json()
        setAthletes(data.links || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleRemove = async (linkId: string) => {
    if (removingId) return
    setRemovingId(linkId)
    setRemoveError('')
    const res = await fetch('/api/guardian-links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_id: linkId }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setRemoveError(data?.error || 'Unable to remove link. Please try again.')
    } else {
      setAthletes((prev) => prev.filter((a) => a.id !== linkId))
    }
    setRemovingId(null)
  }

  const handleLink = async () => {
    if (linking || !linkEmail.trim()) return
    setLinking(true)
    setLinkError('')
    setLinkSuccess('')
    const res = await fetch('/api/guardian-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ athlete_email: linkEmail.trim().toLowerCase() }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setLinkError(data?.error || 'Unable to link athlete.')
    } else {
      setLinkSuccess('Athlete linked successfully.')
      setLinkEmail('')
      const linksRes = await fetch('/api/guardian-links')
      if (linksRes.ok) {
        const linksData = await linksRes.json()
        setAthletes(linksData.links || [])
      }
    }
    setLinking(false)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="guardian" />
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Guardian</p>
          <h1 className="display text-3xl font-semibold text-[#191919]">Settings</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">Manage your linked athletes and account preferences.</p>
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <GuardianSidebar />
          <div className="space-y-6">
            {loading ? (
              <div className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#4a4a4a]">Loading…</div>
            ) : (
              <section className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#191919]">Linked athletes</h2>
                <p className="mt-1 text-xs text-[#4a4a4a]">
                  Removing a link will revoke your ability to approve requests for that athlete.
                </p>
                {removeError && <p className="mt-2 text-xs text-[#b80f0a]">{removeError}</p>}
                {athletes.length === 0 ? (
                  <p className="mt-4 text-sm text-[#4a4a4a]">No linked athletes.</p>
                ) : (
                  <div className="mt-4 space-y-3 text-sm">
                    {athletes.map((link) => {
                      const name = link.related_profile?.full_name || link.related_profile?.email || 'Athlete'
                      return (
                        <div
                          key={link.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                        >
                          <div>
                            <p className="font-semibold text-[#191919]">{name}</p>
                            <p className="text-xs text-[#4a4a4a]">
                              {link.related_profile?.email || ''}
                              {link.status !== 'active' ? ` · ${link.status}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemove(link.id)}
                            disabled={removingId === link.id}
                            className="rounded-full border border-[#b80f0a] px-3 py-1.5 text-xs font-semibold text-[#b80f0a] hover:bg-[#b80f0a] hover:text-white disabled:opacity-50 transition-colors"
                          >
                            {removingId === link.id ? 'Removing…' : 'Remove'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="mt-6 border-t border-[#dcdcdc] pt-5">
                  <h3 className="text-sm font-semibold text-[#191919] mb-3">Link an athlete</h3>
                  <p className="text-xs text-[#4a4a4a] mb-3">
                    Enter the athlete&apos;s account email to link them to your guardian account.
                  </p>
                  {linkError && <p className="mb-2 text-xs text-[#b80f0a]">{linkError}</p>}
                  {linkSuccess && <p className="mb-2 text-xs text-green-700">{linkSuccess}</p>}
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={linkEmail}
                      onChange={(e) => setLinkEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleLink() }}
                      placeholder="athlete@example.com"
                      className="flex-1 rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] px-4 py-2 text-sm text-[#191919] placeholder-[#9a9a9a] focus:border-[#191919] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleLink}
                      disabled={linking || !linkEmail.trim()}
                      className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white hover:opacity-80 disabled:opacity-40 transition-opacity"
                    >
                      {linking ? 'Linking…' : 'Link'}
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
