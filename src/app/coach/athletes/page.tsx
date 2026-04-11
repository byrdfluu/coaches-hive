'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

type AthleteCard = {
  id?: string
  name: string
  status: string
  label: string
  sessionCount: number
  lastSessionDate: string | null
  product: string
  avatar: string
  needs: string
}

const toDisplayName = (fullName?: string | null, email?: string | null) => {
  const name = String(fullName || '').trim()
  if (name) return name
  const emailValue = String(email || '').trim()
  if (!emailValue) return 'Athlete'
  return emailValue.split('@')[0].trim() || 'Athlete'
}

export default function CoachAthletesPage() {
  const supabase = createClientComponentClient()
  const [athletes, setAthletes] = useState<AthleteCard[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [newAthleteName, setNewAthleteName] = useState('')
  const [newAthleteSport, setNewAthleteSport] = useState('')
  const [newAthleteStatus, setNewAthleteStatus] = useState('Active')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [statusFilter, setStatusFilter] = useState('All')
  const [importNotice, setImportNotice] = useState('')
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const searchContainerRef = useRef<HTMLDivElement | null>(null)
  const [waiverStatus, setWaiverStatus] = useState<Record<string, { signed: number; total: number }>>({})

  useEffect(() => {
    let active = true
    const loadAthletes = async () => {
      setLoading(true)
      const response = await fetch('/api/memberships')
      if (!response.ok) {
        setLoading(false)
        return
      }
      const payload = await response.json()
      const links: Array<{ athlete_id?: string; status?: string | null; profiles?: { id: string; full_name: string | null; email?: string | null; avatar_url: string | null } | null }> = Array.isArray(payload.links)
        ? payload.links
        : []
      const athleteIds = Array.from(
        new Set(
          links
            .map((link) => link.athlete_id)
            .filter((id: string | undefined): id is string => Boolean(id))
        )
      )
      if (athleteIds.length === 0) {
        setLoading(false)
        return
      }
      if (!active) return
      const cards: AthleteCard[] = athleteIds.map((id: string) => {
        const link = links.find((l) => l.athlete_id === id)
        const profile = link?.profiles
        const name = toDisplayName(profile?.full_name, profile?.email)
        const status = link?.status || 'Active'
        const initials = name
          .split(' ')
          .map((part) => part[0])
          .filter(Boolean)
          .slice(0, 2)
          .join('')
          .toUpperCase()
        return {
          id,
          name,
          status,
          label: status,
          sessionCount: 0,
          lastSessionDate: null,
          product: 'Training plan',
          avatar: initials || 'AT',
          needs: 'Open profile to see details',
        }
      })

      if (athleteIds.length > 0) {
        const { data: sessionRows } = await supabase
          .from('sessions')
          .select('athlete_id, start_time')
          .in('athlete_id', athleteIds)
          .order('start_time', { ascending: false })
        if (active && sessionRows) {
          const sessions = sessionRows as Array<{ athlete_id?: string | null; start_time?: string | null }>
          const countMap: Record<string, number> = {}
          const lastMap: Record<string, string> = {}
          for (const row of sessions) {
            if (!row.athlete_id) continue
            countMap[row.athlete_id] = (countMap[row.athlete_id] || 0) + 1
            if (!lastMap[row.athlete_id] && row.start_time) lastMap[row.athlete_id] = row.start_time
          }
          cards.forEach((card) => {
            if (!card.id) return
            card.sessionCount = countMap[card.id] || 0
            card.lastSessionDate = lastMap[card.id] || null
          })
        }
      }

      setAthletes(cards)
      setLoading(false)
    }
    loadAthletes()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    if (athletes.length === 0) return
    fetch('/api/waivers/athlete-status')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.status) setWaiverStatus(data.status) })
      .catch(() => null)
  }, [athletes])

  const filteredAthletes = useMemo(() => {
    return athletes.filter((athlete) => {
      const matchSearch =
        athlete.name.toLowerCase().includes(search.toLowerCase()) ||
        athlete.product.toLowerCase().includes(search.toLowerCase()) ||
        athlete.label.toLowerCase().includes(search.toLowerCase())
      const matchStatus = statusFilter === 'All' || athlete.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [athletes, search, statusFilter])

  const searchSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return athletes
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [athletes, search])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athletes</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">
              Manage every athlete in one place.
            </h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Profiles, notes, payments, and quick scheduling shortcuts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/coach/settings#export-center"
              className="self-start rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Go to export center
            </Link>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0]
                if (!file) return
                event.currentTarget.value = ''
                const text = await file.text()
                const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
                if (lines.length < 2) {
                  setImportNotice('CSV must have a header row and at least one data row.')
                  return
                }
                const headers = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''))
                const emailIdx = headers.indexOf('email')
                const nameIdx = headers.indexOf('name')
                const sportIdx = headers.indexOf('sport')
                if (emailIdx === -1) {
                  setImportNotice('CSV must have an "email" column.')
                  return
                }
                const athletes = lines.slice(1).map((line) => {
                  const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''))
                  const entry: { email: string; name?: string; sport?: string } = { email: cols[emailIdx] || '' }
                  if (nameIdx !== -1 && cols[nameIdx]) entry.name = cols[nameIdx]
                  if (sportIdx !== -1 && cols[sportIdx]) entry.sport = cols[sportIdx]
                  return entry
                }).filter((a) => a.email && a.email.includes('@'))
                if (athletes.length === 0) {
                  setImportNotice('No valid email addresses found in CSV.')
                  return
                }
                setImportNotice('Importing…')
                const res = await fetch('/api/invites/athlete/bulk', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ athletes }),
                })
                const result = await res.json()
                if (!res.ok) {
                  setImportNotice(result.error || 'Import failed.')
                  return
                }
                setImportNotice(`Import complete: ${result.linked} linked, ${result.queued} invited, ${result.skipped} skipped, ${result.failed} failed.`)
              }}
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Import CSV
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Add athlete
            </button>
            <Link
              href="/coach/athletes/book"
              className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Book session
            </Link>
          </div>
        </div>

        {importNotice && (
          <p className="mt-4 rounded-xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm text-[#191919]">
            {importNotice}
          </p>
        )}
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div>
            <section className="glass-card border border-[#191919] bg-white p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div ref={searchContainerRef} className="relative w-full md:w-72">
                  <input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setShowDropdown(true) }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShowDropdown(false); setSearch('') } }}
                    placeholder="Search by name, product, or label"
                    className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                  />
                  {showDropdown && searchSuggestions.length > 0 && (
                    <ul className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-2xl border border-[#dcdcdc] bg-white shadow-lg">
                      {searchSuggestions.map((athlete) => (
                        <li key={athlete.id || athlete.name}>
                          <button
                            type="button"
                            onMouseDown={() => {
                              setSearch(athlete.name)
                              setShowDropdown(false)
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-[#f5f5f5]"
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#191919] text-[10px] font-bold text-white">
                              {athlete.avatar}
                            </span>
                            <span className="font-semibold text-[#191919]">{athlete.name}</span>
                            <span className="ml-auto text-xs text-[#4a4a4a]">{athlete.status}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                >
                  {['All', 'Active', 'Onboarding', 'Inactive', 'Team', 'VIP'].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </div>
            </section>

            <section className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {loading && athletes.length === 0 ? (
                <LoadingState label="Loading athlete connections..." className="md:col-span-2 lg:col-span-3" />
              ) : filteredAthletes.length === 0 ? (
                <EmptyState title="No athletes match." description="Try adjusting your search or status filter." className="md:col-span-2 lg:col-span-3" />
              ) : (
                filteredAthletes.map((athlete) => (
                  <div
                    key={athlete.id || athlete.name}
                    className="glass-card space-y-3 border border-[#191919] bg-white p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#191919] text-sm font-semibold text-white">
                          {athlete.avatar}
                        </div>
                        <div>
                          <Link href={`/coach/athletes/${athlete.id ?? slugify(athlete.name)}`} className="text-sm font-semibold text-[#191919] underline decoration-[#191919]/40 decoration-2 underline-offset-4 hover:decoration-[#191919]">{athlete.name}</Link>
                          <p className="text-xs text-[#4a4a4a]">{athlete.product}</p>
                        </div>
                      </div>
                      <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                        {athlete.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#4a4a4a]">
                      <span>Status: {athlete.status}</span>
                      <span>{athlete.sessionCount} session{athlete.sessionCount !== 1 ? 's' : ''}</span>
                    </div>
                    {(() => {
                      if (!athlete.lastSessionDate) return null
                      const daysSince = Math.floor((Date.now() - new Date(athlete.lastSessionDate).getTime()) / 86400000)
                      const label = daysSince === 0 ? 'Today' : daysSince === 1 ? 'Yesterday' : `${daysSince}d ago`
                      const atRisk = daysSince >= 30
                      return (
                        <div className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs font-semibold ${atRisk ? 'border-[#b80f0a] bg-red-50 text-[#b80f0a]' : 'border-[#dcdcdc] bg-[#f5f5f5] text-[#4a4a4a]'}`}>
                          <span>Last session</span>
                          <span>{label}{atRisk ? ' · Re-engage' : ''}</span>
                        </div>
                      )
                    })()}
                    {athlete.id && waiverStatus[athlete.id] && waiverStatus[athlete.id].total > 0 && (
                      <div className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                        waiverStatus[athlete.id].signed === waiverStatus[athlete.id].total
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : 'border-[#b80f0a] bg-red-50 text-[#b80f0a]'
                      }`}>
                        <span>Waivers</span>
                        <span>{waiverStatus[athlete.id].signed}/{waiverStatus[athlete.id].total} signed</span>
                      </div>
                    )}
                    <div className="rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2 text-xs text-[#4a4a4a]">
                      Next step: <span className="font-semibold text-[#191919]">{athlete.needs}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Link href={`/coach/athletes/${athlete.id ?? slugify(athlete.name)}`} className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                        Open profile
                      </Link>
                      <Link href={`/coach/notes?athlete=${slugify(athlete.name)}`} className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                        Notes
                      </Link>
                      <Link href={`/coach/athletes/book?athlete=${encodeURIComponent(athlete.name)}${athlete.id ? `&athlete_id=${encodeURIComponent(athlete.id)}` : ''}`} className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                        Book next
                      </Link>
                      <Link href={`/coach/messages?new=${slugify(athlete.name)}&type=athlete${athlete.id ? `&id=${encodeURIComponent(athlete.id)}` : ''}`} className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                        Message athlete
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
