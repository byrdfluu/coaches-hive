'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import CoachSidebar from '@/components/CoachSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import { isCoachAthleteLaunch } from '@/lib/launchSurface'

type OrgMembership = {
  org_id: string
  role?: string | null
}

type OrgRow = {
  id: string
  name?: string | null
  org_type?: string | null
}

type TeamRow = {
  id: string
  name?: string | null
  org_id?: string | null
  created_at?: string | null
}

type OrgMemberRow = {
  org_id: string
  user_id: string
  role?: string | null
}

type ProfileRow = {
  id: string
  full_name?: string | null
  email?: string | null
}

type TeamMemberRow = {
  team_id: string
  athlete_id: string
}

const formatRoleLabel = (role?: string | null) => {
  const value = String(role || '').replace(/_/g, ' ')
  if (!value) return 'Coach'
  return value.replace(/\b\w/g, (char) => char.toUpperCase())
}

const formatDate = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString()
}

export default function CoachOrgsTeamsPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [memberships, setMemberships] = useState<OrgMembership[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [orgMembers, setOrgMembers] = useState<OrgMemberRow[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, ProfileRow>>({})
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
  const [teamCalendar, setTeamCalendar] = useState<Array<{ date: string; time: string; title: string }>>([])
  const [calendarLoading, setCalendarLoading] = useState(false)

  useEffect(() => {
    if (!isCoachAthleteLaunch) return
    router.replace('/coach/dashboard')
  }, [router])

  useEffect(() => {
    let active = true
    const load = async () => {
      if (isCoachAthleteLaunch) {
        if (active) setLoading(false)
        return
      }
      setLoading(true)
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) {
        if (active) setLoading(false)
        return
      }
      const { data: membershipRows } = await supabase
        .from('organization_memberships')
        .select('org_id, role')
        .eq('user_id', userId)
      const memberships = (membershipRows || []) as OrgMembership[]
      const orgIds = memberships.map((row) => row.org_id).filter(Boolean)
      if (active) setMemberships(memberships)
      if (!orgIds.length) {
        if (active) {
          setOrgs([])
          setTeams([])
          setOrgMembers([])
          setTeamMembers([])
          setProfileMap({})
          setLoading(false)
        }
        return
      }
      const { data: orgRows } = await supabase
        .from('organizations')
        .select('id, name, org_type')
        .in('id', orgIds)
        .order('name', { ascending: true })
      const { data: teamRows } = await supabase
        .from('org_teams')
        .select('id, name, org_id, created_at, coach_id')
        .in('org_id', orgIds)
        .eq('coach_id', userId)
        .order('created_at', { ascending: false })
      if (!active) return
      setOrgs((orgRows || []) as OrgRow[])
      setMemberships((membershipRows || []) as OrgMembership[])
      setTeams((teamRows || []) as TeamRow[])

      const { data: memberRows } = await supabase
        .from('organization_memberships')
        .select('org_id, user_id, role')
        .in('org_id', orgIds)
      const nextMembers = (memberRows || []) as OrgMemberRow[]
      setOrgMembers(nextMembers)

      const teamIds = (teamRows || []).map((team) => team.id).filter(Boolean)
      let nextTeamMembers: TeamMemberRow[] = []
      if (teamIds.length > 0) {
        const { data: teamMemberRows } = await supabase
          .from('org_team_members')
          .select('team_id, athlete_id')
          .in('team_id', teamIds)
        nextTeamMembers = (teamMemberRows || []) as TeamMemberRow[]
      }
      setTeamMembers(nextTeamMembers)

      const profileIds = Array.from(
        new Set([
          ...nextMembers.map((member) => member.user_id),
          ...nextTeamMembers.map((member) => member.athlete_id),
        ])
      )
      if (profileIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', profileIds)
        const profileRows = (profiles || []) as ProfileRow[]
        const nextMap: Record<string, ProfileRow> = {}
        profileRows.forEach((profile) => {
          nextMap[profile.id] = profile
        })
        setProfileMap(nextMap)
      } else {
        setProfileMap({})
      }
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [supabase])

  const orgRoleMap = useMemo(() => {
    const map = new Map<string, string>()
    memberships.forEach((row) => {
      map.set(row.org_id, formatRoleLabel(row.role))
    })
    return map
  }, [memberships])

  const orgNameMap = useMemo(() => {
    const map = new Map<string, string>()
    orgs.forEach((org) => {
      map.set(org.id, org.name || 'Organization')
    })
    return map
  }, [orgs])

  const activeOrg = useMemo(() => orgs.find((org) => org.id === activeOrgId) || null, [orgs, activeOrgId])
  const activeTeam = useMemo(() => teams.find((team) => team.id === activeTeamId) || null, [teams, activeTeamId])

  const activeOrgMembers = useMemo(
    () => orgMembers.filter((member) => member.org_id === activeOrgId),
    [orgMembers, activeOrgId]
  )

  const activeOrgCoaches = useMemo(() => {
    return activeOrgMembers
      .filter((member) => ['coach', 'assistant_coach'].includes(String(member.role)))
      .map((member) => profileMap[member.user_id])
      .filter(Boolean)
  }, [activeOrgMembers, profileMap])

  const activeOrgAthletes = useMemo(() => {
    return activeOrgMembers
      .filter((member) => String(member.role) === 'athlete')
      .map((member) => profileMap[member.user_id])
      .filter(Boolean)
  }, [activeOrgMembers, profileMap])

  const activeTeamAthletes = useMemo(() => {
    return teamMembers
      .filter((member) => member.team_id === activeTeamId)
      .map((member) => profileMap[member.athlete_id])
      .filter(Boolean)
  }, [teamMembers, activeTeamId, profileMap])

  const activeTeamCoaches = useMemo(() => {
    if (!activeTeam?.org_id) return []
    return orgMembers
      .filter((member) => member.org_id === activeTeam.org_id)
      .filter((member) => ['coach', 'assistant_coach'].includes(String(member.role)))
      .map((member) => profileMap[member.user_id])
      .filter(Boolean)
  }, [activeTeam, orgMembers, profileMap])

  useEffect(() => {
    if (!activeTeamId) { setTeamCalendar([]); return }
    const athleteIds = teamMembers
      .filter((m) => m.team_id === activeTeamId)
      .map((m) => m.athlete_id)
      .filter(Boolean)
    if (athleteIds.length === 0) { setTeamCalendar([]); return }
    let active = true
    const loadCalendar = async () => {
      setCalendarLoading(true)
      const now = new Date().toISOString()
      const { data: sessionRows } = await supabase
        .from('sessions')
        .select('id, title, start_time, session_type')
        .in('athlete_id', athleteIds)
        .gte('start_time', now)
        .order('start_time', { ascending: true })
        .limit(5)
      if (!active) return
      setTeamCalendar(
        (sessionRows || []).map((s: any) => {
          const d = new Date(s.start_time)
          return {
            date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            title: s.title || s.session_type || 'Session',
          }
        }),
      )
      setCalendarLoading(false)
    }
    void loadCalendar()
    return () => { active = false }
  }, [activeTeamId, teamMembers, supabase])

  if (isCoachAthleteLaunch) {
    return null
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Coach Portal</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Orgs & Teams</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Manage the organizations and teams you coach with.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Organizations</p>
                  <h2 className="mt-2 text-xl font-semibold text-[#191919]">Your org memberships</h2>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {loading ? (
                  <LoadingState label="Loading organizations..." />
                ) : orgs.length === 0 ? (
                  <EmptyState
                    title="No organizations yet."
                    description="Accept an invite to join an organization or ask an org admin to add you."
                  />
                ) : (
                  orgs.map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => setActiveOrgId(org.id)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4 text-left text-sm transition hover:border-[#191919]"
                    >
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{org.org_type || 'Organization'}</p>
                      <p className="mt-2 text-lg font-semibold text-[#191919]">{org.name || 'Organization'}</p>
                      <p className="mt-1 text-xs text-[#6b5f55]">Role: {orgRoleMap.get(org.id) || 'Coach'}</p>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Teams</p>
                <h2 className="mt-2 text-xl font-semibold text-[#191919]">Teams you coach</h2>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {loading ? (
                  <LoadingState label="Loading teams..." />
                ) : teams.length === 0 ? (
                  <EmptyState
                    title="No teams assigned yet."
                    description="Once an org assigns you to a team, it will appear here."
                  />
                ) : (
                  teams.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => setActiveTeamId(team.id)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4 text-left text-sm transition hover:border-[#191919]"
                    >
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">
                        {orgNameMap.get(team.org_id || '') || 'Organization'}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-[#191919]">{team.name || 'Team'}</p>
                      {team.created_at ? (
                        <p className="mt-1 text-xs text-[#6b5f55]">Added {formatDate(team.created_at)}</p>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
      {activeOrg && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Organization</p>
                <h2 className="mt-2 text-2xl font-semibold">{activeOrg.name || 'Organization'}</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">{activeOrg.org_type || 'Organization'} · Role: {orgRoleMap.get(activeOrg.id) || 'Coach'}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveOrgId(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] text-lg font-semibold"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Teams</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">
                  {teams.filter((team) => team.org_id === activeOrg.id).length}
                </p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Coaches</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{activeOrgCoaches.length}</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Athletes</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{activeOrgAthletes.length}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Coaches</p>
                <div className="mt-3 space-y-2 text-sm text-[#191919]">
                  {activeOrgCoaches.length === 0 ? (
                    <p className="text-xs text-[#6b5f55]">No coaches listed yet.</p>
                  ) : (
                    activeOrgCoaches.slice(0, 6).map((coach) => (
                      <p key={coach?.id} className="font-semibold">{coach?.full_name || coach?.email || 'Coach'}</p>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Athletes</p>
                <div className="mt-3 space-y-2 text-sm text-[#191919]">
                  {activeOrgAthletes.length === 0 ? (
                    <p className="text-xs text-[#6b5f55]">No athletes listed yet.</p>
                  ) : (
                    activeOrgAthletes.slice(0, 6).map((athlete) => (
                      <p key={athlete?.id} className="font-semibold">{athlete?.full_name || athlete?.email || 'Athlete'}</p>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={`/coach/messages?new=${encodeURIComponent(activeOrg.name || 'Organization')}&type=org&id=${activeOrg.id}`}
                className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
              >
                Message org
              </a>
              <button
                type="button"
                onClick={() => setActiveOrgId(null)}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {activeTeam && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Team</p>
                <h2 className="mt-2 text-2xl font-semibold">{activeTeam.name || 'Team'}</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">{orgNameMap.get(activeTeam.org_id || '') || 'Organization'}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTeamId(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] text-lg font-semibold"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Roster</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{activeTeamAthletes.length}</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Coaches</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{activeTeamCoaches.length}</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Added</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{formatDate(activeTeam.created_at) || '—'}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Coaches</p>
                <div className="mt-3 space-y-2 text-sm text-[#191919]">
                  {activeTeamCoaches.length === 0 ? (
                    <p className="text-xs text-[#6b5f55]">No coaches listed yet.</p>
                  ) : (
                    activeTeamCoaches.slice(0, 6).map((coach) => (
                      <p key={coach?.id} className="font-semibold">{coach?.full_name || coach?.email || 'Coach'}</p>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Athletes</p>
                <div className="mt-3 space-y-2 text-sm text-[#191919]">
                  {activeTeamAthletes.length === 0 ? (
                    <p className="text-xs text-[#6b5f55]">No athletes listed yet.</p>
                  ) : (
                    activeTeamAthletes.slice(0, 8).map((athlete) => (
                      <p key={athlete?.id} className="font-semibold">{athlete?.full_name || athlete?.email || 'Athlete'}</p>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border border-[#dcdcdc] bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Team calendar</p>
                <a
                  href={`/coach/calendar?team=${encodeURIComponent(activeTeam.name || 'Team')}`}
                  className="text-xs font-semibold text-[#b80f0a]"
                >
                  View full calendar
                </a>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                {calendarLoading ? (
                  <p className="text-xs text-[#6b5f55]">Loading sessions…</p>
                ) : teamCalendar.length === 0 ? (
                  <p className="text-xs text-[#6b5f55]">No upcoming sessions listed. Use the coach calendar to schedule.</p>
                ) : (
                  teamCalendar.map((session) => (
                    <div key={`${session.date}-${session.title}`} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3">
                      <p className="text-xs text-[#6b5f55]">{session.date} · {session.time}</p>
                      <p className="font-semibold text-[#191919]">{session.title}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={`/coach/messages?new=${encodeURIComponent(activeTeam.name || 'Team')}&type=team&id=${activeTeam.id}`}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
              >
                Message team
              </a>
              <button
                type="button"
                onClick={() => setActiveTeamId(null)}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
