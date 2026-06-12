'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import OrgSidebar from '@/components/OrgSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

type DiscoveredCoach = {
  id: string
  full_name: string | null
  avatar_url: string | null
  sport: string[] | null
  location: string | null
  bio: string | null
  verification_status: string | null
}

type OrgTeam = {
  id: string
  name: string
}

type InviteFormState = {
  role: string
  teamId: string
  saving: boolean
  done: boolean
  error: string
}

export default function CoachDiscoverPage() {
  const supabase = createClientComponentClient()
  const [coaches, setCoaches] = useState<DiscoveredCoach[]>([])
  const [loading, setLoading] = useState(true)
  const [nameFilter, setNameFilter] = useState('')
  const [sportFilter, setSportFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [teams, setTeams] = useState<OrgTeam[]>([])
  const [openInviteId, setOpenInviteId] = useState<string | null>(null)
  const [inviteForms, setInviteForms] = useState<Record<string, InviteFormState>>({})
  const [toast, setToast] = useState<{ message: string } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [inviterName, setInviterName] = useState('')

  // Load orgId, teams, and current user's name
  useEffect(() => {
    let active = true
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return

      const [membershipRes, profileRes] = await Promise.all([
        supabase
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle(),
      ])

      const oid = (membershipRes.data as { org_id?: string | null } | null)?.org_id
      if (!active) return
      if (oid) {
        setOrgId(oid)
        const { data: teamRows } = await supabase
          .from('org_teams')
          .select('id, name')
          .eq('org_id', oid)
        if (active) setTeams((teamRows || []) as OrgTeam[])
      }
      const name = (profileRes.data as { full_name?: string | null } | null)?.full_name
      if (name && active) setInviterName(name)
    }
    init()
    return () => { active = false }
  }, [supabase])

  // Fetch coaches on mount
  useEffect(() => {
    fetchCoaches('', '', '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchCoaches = async (name: string, sport: string, location: string) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (name) params.set('name', name)
    if (sport) params.set('sport', sport)
    if (location) params.set('location', location)
    const response = await fetch(`/api/org/coaches/discover?${params.toString()}`)
    if (!response.ok) {
      setLoading(false)
      return
    }
    const data = await response.json()
    setCoaches(data.coaches || [])
    setLoading(false)
  }

  // Debounce filter changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchCoaches(nameFilter, sportFilter, locationFilter)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameFilter, sportFilter, locationFilter])

  const getInitials = (name: string | null) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }

  const getOrInitForm = (coachId: string): InviteFormState => {
    return inviteForms[coachId] || { role: 'coach', teamId: '', saving: false, done: false, error: '' }
  }

  const updateForm = (coachId: string, patch: Partial<InviteFormState>) => {
    setInviteForms((prev) => ({
      ...prev,
      [coachId]: { ...getOrInitForm(coachId), ...patch },
    }))
  }

  const handleSendInvite = async (coach: DiscoveredCoach) => {
    const form = getOrInitForm(coach.id)
    if (form.saving || form.done) return

    // We need the coach email — fetch it from profiles
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', coach.id)
      .maybeSingle()
    const coachEmail = (profileRow as { email?: string | null } | null)?.email

    if (!coachEmail) {
      updateForm(coach.id, { error: 'Unable to find coach email.' })
      return
    }

    updateForm(coach.id, { saving: true, error: '' })

    const response = await fetch('/api/org/coaches/discover/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coach_email: coachEmail,
        coach_id: coach.id,
        role: form.role,
        team_id: form.teamId || undefined,
        inviter_name: inviterName,
      }),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      updateForm(coach.id, {
        saving: false,
        error: payload?.error || 'Unable to send invite.',
      })
      return
    }

    updateForm(coach.id, { saving: false, done: true })
    setOpenInviteId(null)
    setToast({ message: `Invite sent to ${coach.full_name || 'coach'}.` })
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />

        <div className="mb-4">
          <Link
            href="/org/coaches"
            className="text-sm font-semibold text-[#4a4a4a] hover:text-[#191919] transition-colors"
          >
            &larr; Back to coaches
          </Link>
        </div>

        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
          <h1 className="display text-3xl font-semibold text-[#191919]">Find coaches</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">Browse verified coaches available for org programs.</p>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-1">
          <OrgSidebar />

          <div className="space-y-6">
            {/* Filters */}
            <div className="glass-card border border-[#191919] bg-white p-4">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Name</p>
                  <input
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                    placeholder="Search by name"
                    className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  />
                </div>
                <div className="min-w-[140px]">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Sport</p>
                  <input
                    value={sportFilter}
                    onChange={(e) => setSportFilter(e.target.value)}
                    placeholder="e.g. Basketball"
                    className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  />
                </div>
                <div className="min-w-[140px]">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Location</p>
                  <input
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    placeholder="e.g. Chicago"
                    className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  />
                </div>
              </div>
            </div>

            {/* Results */}
            {loading ? (
              <div className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#4a4a4a]">
                Loading coaches...
              </div>
            ) : coaches.length === 0 ? (
              <div className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#4a4a4a]">
                No verified coaches found. Try different filters or invite a coach directly by email on the{' '}
                <Link href="/org/coaches" className="font-semibold text-[#191919] underline">
                  Coaches page
                </Link>
                .
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {coaches.map((coach) => {
                  const form = getOrInitForm(coach.id)
                  const isOpen = openInviteId === coach.id
                  const sportLabel = (coach.sport || []).join(' · ')

                  return (
                    <div key={coach.id} className="glass-card border border-[#191919] bg-white p-4 flex flex-col gap-3">
                      {/* Avatar + name */}
                      <div className="flex items-center gap-3">
                        {coach.avatar_url ? (
                          <img
                            src={coach.avatar_url}
                            alt={coach.full_name || 'Coach'}
                            className="h-12 w-12 rounded-full object-cover border border-[#dcdcdc]"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#191919] text-sm font-semibold text-white flex-shrink-0">
                            {getInitials(coach.full_name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#191919] truncate">
                            {coach.full_name || 'Coach'}
                          </p>
                          {sportLabel ? (
                            <p className="text-xs text-[#4a4a4a] truncate">{sportLabel}</p>
                          ) : null}
                        </div>
                        {/* Verified badge */}
                        <span className="ml-auto flex-shrink-0 rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#191919]">
                          Verified
                        </span>
                      </div>

                      {coach.location ? (
                        <p className="text-xs text-[#4a4a4a]">{coach.location}</p>
                      ) : null}

                      {coach.bio ? (
                        <p className="text-xs text-[#4a4a4a] line-clamp-3">
                          {coach.bio.length > 100 ? `${coach.bio.slice(0, 100)}...` : coach.bio}
                        </p>
                      ) : null}

                      {/* Invite section */}
                      {form.done ? (
                        <p className="text-xs font-semibold text-[#191919]">Invite sent</p>
                      ) : isOpen ? (
                        <div className="space-y-2 border-t border-[#dcdcdc] pt-3">
                          <div>
                            <p className="text-xs font-semibold text-[#4a4a4a] uppercase tracking-[0.2em]">Role</p>
                            <select
                              value={form.role}
                              onChange={(e) => updateForm(coach.id, { role: e.target.value })}
                              className="mt-1 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                            >
                              <option value="coach">Coach</option>
                              <option value="assistant_coach">Assistant coach</option>
                              <option value="team_manager">Team manager</option>
                            </select>
                          </div>
                          {teams.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-[#4a4a4a] uppercase tracking-[0.2em]">Team (optional)</p>
                              <select
                                value={form.teamId}
                                onChange={(e) => updateForm(coach.id, { teamId: e.target.value })}
                                className="mt-1 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                              >
                                <option value="">No team</option>
                                {teams.map((team) => (
                                  <option key={team.id} value={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {form.error && (
                            <p className="text-xs text-[#b80f0a]">{form.error}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleSendInvite(coach)}
                              disabled={form.saving}
                              className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              {form.saving ? 'Sending...' : 'Send invite'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenInviteId(null)}
                              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenInviteId(coach.id)}
                          className="mt-auto rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#f5f5f5] transition-colors"
                        >
                          Invite to org
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </main>
  )
}
