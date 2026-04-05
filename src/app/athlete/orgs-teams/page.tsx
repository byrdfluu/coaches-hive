'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import AthleteSidebar from '@/components/AthleteSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Toast from '@/components/Toast'
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
  coach_id?: string | null
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

type TeamAnnouncement = {
  id: string
  title: string
  date: string
  detail: string
}

type TeamFee = {
  id: string
  title: string
  amount_cents: number
  due_date: string
  status: 'due' | 'paid' | 'overdue'
}

type TeamDocument = {
  id: string
  title: string
  type: string
  updated_at: string
}

type OrgNotificationRow = {
  id: string
  title: string
  body?: string | null
  created_at: string
  data?: { org_id?: string; announcement_id?: string } | null
}

type OrgFeeRow = {
  id: string
  org_id: string
  team_id?: string | null
  title: string
  amount_cents: number
  due_date?: string | null
}

type OrgFeeAssignmentRow = {
  id: string
  fee_id: string
  status: string
  paid_at?: string | null
}

type UpcomingSessionRow = {
  id: string
  start_time: string
  session_type?: string | null
}

const formatRoleLabel = (role?: string | null) => {
  const value = String(role || '').replace(/_/g, ' ')
  if (!value) return 'Athlete'
  return value.replace(/\\b\\w/g, (char) => char.toUpperCase())
}

const formatDate = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString()
}

export default function AthleteOrgsTeamsPage() {
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
  const [searchQuery, setSearchQuery] = useState('')
  const [rosterSearch, setRosterSearch] = useState('')
  const [toast, setToast] = useState('')
  const [orgAnnouncements, setOrgAnnouncements] = useState<OrgNotificationRow[]>([])
  const [feeAssignments, setFeeAssignments] = useState<OrgFeeAssignmentRow[]>([])
  const [feeMap, setFeeMap] = useState<Record<string, OrgFeeRow>>({})
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSessionRow[]>([])

  useEffect(() => {
    if (isCoachAthleteLaunch) {
      router.replace('/athlete/dashboard')
    }
  }, [router])

  useEffect(() => {
    let active = true
    const load = async () => {
      if (isCoachAthleteLaunch) {
        setLoading(false)
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
      const { data: teamMemberships } = await supabase
        .from('org_team_members')
        .select('team_id, athlete_id')
        .eq('athlete_id', userId)
      const memberships = (membershipRows || []) as OrgMembership[]
      const teamMemberRows = (teamMemberships || []) as TeamMemberRow[]

      const teamIds = teamMemberRows.map((row) => row.team_id).filter(Boolean)
      const { data: teamRows } = teamIds.length
        ? await supabase
            .from('org_teams')
            .select('id, name, org_id, created_at, coach_id')
            .in('id', teamIds)
            .order('created_at', { ascending: false })
        : { data: [] }
      const teams = (teamRows || []) as TeamRow[]

      const orgIds = Array.from(
        new Set([
          ...memberships.map((row) => row.org_id),
          ...teams.map((team) => team.org_id).filter(Boolean) as string[],
        ])
      )

      if (!orgIds.length) {
        if (active) {
          setOrgs([])
          setMemberships([])
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

      const { data: memberRows } = await supabase
        .from('organization_memberships')
        .select('org_id, user_id, role')
        .in('org_id', orgIds)
      const organizations = (orgRows || []) as OrgRow[]
      const nextMembers = (memberRows || []) as OrgMemberRow[]

      if (!active) return
      setOrgs(organizations)
      setMemberships(memberships)
      setTeams(teams)
      setOrgMembers(nextMembers)

      setTeamMembers(teamMemberRows)

      const profileIds = Array.from(
        new Set([
          ...nextMembers.map((member) => member.user_id),
          ...teamMemberRows.map((member) => member.athlete_id),
          ...teams.map((team) => team.coach_id).filter(Boolean) as string[],
        ])
      )
      if (profileIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', profileIds)
        const nextMap: Record<string, ProfileRow> = {}
        const memberProfiles = (profiles || []) as ProfileRow[]
        memberProfiles.forEach((profile) => {
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

  // Load org announcements (delivered as notifications with type 'org_announcement')
  useEffect(() => {
    let active = true
    const loadAnnouncements = async () => {
      if (isCoachAthleteLaunch) return
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return
      const { data: rows } = await supabase
        .from('notifications')
        .select('id, title, body, created_at, data')
        .eq('user_id', userId)
        .eq('type', 'org_announcement')
        .order('created_at', { ascending: false })
        .limit(30)
      if (!active) return
      setOrgAnnouncements((rows || []) as OrgNotificationRow[])
    }
    loadAnnouncements()
    return () => { active = false }
  }, [supabase])

  // Load org fee assignments for this athlete
  useEffect(() => {
    let active = true
    const loadFees = async () => {
      if (isCoachAthleteLaunch) return
      const response = await fetch('/api/athlete/charges')
      if (!response.ok || !active) return
      const payload = await response.json()
      if (!active) return
      const assignments: OrgFeeAssignmentRow[] = Array.isArray(payload.assignments) ? payload.assignments : []
      const fees: OrgFeeRow[] = Array.isArray(payload.fees) ? payload.fees : []
      setFeeAssignments(assignments)
      const nextMap: Record<string, OrgFeeRow> = {}
      fees.forEach((fee) => { nextMap[fee.id] = fee })
      setFeeMap(nextMap)
    }
    loadFees()
    return () => { active = false }
  }, [])

  // Load upcoming sessions for the athlete
  useEffect(() => {
    let active = true
    const loadSessions = async () => {
      if (isCoachAthleteLaunch) return
      const now = new Date().toISOString()
      const response = await fetch(`/api/sessions?start=${encodeURIComponent(now)}`)
      if (!response.ok || !active) return
      const payload = await response.json()
      if (!active) return
      setUpcomingSessions((payload.sessions || []) as UpcomingSessionRow[])
    }
    loadSessions()
    return () => { active = false }
  }, [])

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

  const activeOrgTeams = useMemo(() => {
    if (!activeOrgId) return []
    return teams.filter((team) => team.org_id === activeOrgId)
  }, [activeOrgId, teams])

  const activeTeamAthletes = useMemo(() => {
    return teamMembers
      .filter((member) => member.team_id === activeTeamId)
      .map((member) => profileMap[member.athlete_id])
      .filter(Boolean)
  }, [teamMembers, activeTeamId, profileMap])

  const activeTeamCoaches = useMemo(() => {
    if (!activeTeam?.org_id) return []
    if (activeTeam.coach_id && profileMap[activeTeam.coach_id]) {
      return [profileMap[activeTeam.coach_id]]
    }
    return orgMembers
      .filter((member) => member.org_id === activeTeam.org_id)
      .filter((member) => ['coach', 'assistant_coach'].includes(String(member.role)))
      .map((member) => profileMap[member.user_id])
      .filter(Boolean)
  }, [activeTeam, orgMembers, profileMap])

  const activeTeamCalendar = useMemo<Array<{ date: string; time: string; title: string }>>(() => {
    return upcomingSessions.slice(0, 5).map((s) => {
      const d = new Date(s.start_time)
      return {
        date: d.toLocaleDateString(),
        time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: s.session_type || 'Session',
      }
    })
  }, [upcomingSessions])

  const activeOrgAnnouncements = useMemo<TeamAnnouncement[]>(() => {
    if (!activeOrgId) return []
    return orgAnnouncements
      .filter((n) => (n.data as { org_id?: string } | null)?.org_id === activeOrgId)
      .slice(0, 3)
      .map((n) => ({
        id: n.id,
        title: n.title,
        date: new Date(n.created_at).toLocaleDateString(),
        detail: n.body || '',
      }))
  }, [orgAnnouncements, activeOrgId])

  const activeOrgDocs: TeamDocument[] = []

  const activeOrgFees = useMemo<TeamFee[]>(() => {
    if (!activeOrgId) return []
    return feeAssignments
      .filter((a) => feeMap[a.fee_id]?.org_id === activeOrgId)
      .map((a) => {
        const fee = feeMap[a.fee_id]
        const status = a.status === 'paid' ? 'paid' : a.status === 'overdue' ? 'overdue' : 'due'
        return {
          id: a.id,
          title: fee?.title || 'Fee',
          amount_cents: fee?.amount_cents || 0,
          due_date: fee?.due_date ? new Date(fee.due_date).toLocaleDateString() : '—',
          status: status as TeamFee['status'],
        }
      })
  }, [feeAssignments, feeMap, activeOrgId])

  const orgNextUp = useMemo(() => {
    const first = activeTeamCalendar[0]
    if (!first || !activeOrg) return null
    return { teamName: activeOrg.name || 'Org', ...first }
  }, [activeTeamCalendar, activeOrg])

  const activeTeamAnnouncements = useMemo<TeamAnnouncement[]>(() => {
    if (!activeTeamId || !activeTeam?.org_id) return []
    return orgAnnouncements
      .filter((n) => (n.data as { org_id?: string } | null)?.org_id === activeTeam.org_id)
      .slice(0, 3)
      .map((n) => ({
        id: n.id,
        title: n.title,
        date: new Date(n.created_at).toLocaleDateString(),
        detail: n.body || '',
      }))
  }, [orgAnnouncements, activeTeamId, activeTeam])

  const activeTeamFees = useMemo<TeamFee[]>(() => {
    if (!activeTeamId) return []
    return feeAssignments
      .filter((a) => feeMap[a.fee_id]?.team_id === activeTeamId)
      .map((a) => {
        const fee = feeMap[a.fee_id]
        const status = a.status === 'paid' ? 'paid' : a.status === 'overdue' ? 'overdue' : 'due'
        return {
          id: a.id,
          title: fee?.title || 'Fee',
          amount_cents: fee?.amount_cents || 0,
          due_date: fee?.due_date ? new Date(fee.due_date).toLocaleDateString() : '—',
          status: status as TeamFee['status'],
        }
      })
  }, [feeAssignments, feeMap, activeTeamId])

  const activeTeamDocs: TeamDocument[] = []

  const filteredOrgs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return orgs
    return orgs.filter((org) => {
      const name = (org.name || '').toLowerCase()
      const type = (org.org_type || '').toLowerCase()
      return name.includes(query) || type.includes(query)
    })
  }, [orgs, searchQuery])

  const filteredTeams = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return teams
    return teams.filter((team) => {
      const name = (team.name || '').toLowerCase()
      const orgName = (orgNameMap.get(team.org_id || '') || '').toLowerCase()
      return name.includes(query) || orgName.includes(query)
    })
  }, [orgNameMap, searchQuery, teams])

  const filteredRoster = useMemo(() => {
    const query = rosterSearch.trim().toLowerCase()
    if (!query) return { coaches: activeTeamCoaches, athletes: activeTeamAthletes }
    return {
      coaches: activeTeamCoaches.filter((coach) => (coach?.full_name || coach?.email || '').toLowerCase().includes(query)),
      athletes: activeTeamAthletes.filter((athlete) => (athlete?.full_name || athlete?.email || '').toLowerCase().includes(query)),
    }
  }, [activeTeamAthletes, activeTeamCoaches, rosterSearch])

  const nextTeamSession = useMemo(() => {
    if (activeTeamCalendar.length === 0) return null
    return activeTeamCalendar[0]
  }, [activeTeamCalendar])

  const dueFeesCount = useMemo(() => {
    return activeTeamFees.filter((fee) => fee.status !== 'paid').length
  }, [activeTeamFees])

  const attendanceLabel = '—'

  const totalFeesDue = useMemo(() => {
    return feeAssignments.filter((a) => a.status !== 'paid').length
  }, [feeAssignments])

  const summaryStats = useMemo(() => {
    const totalTeams = teams.length
    const totalOrgs = orgs.length
    return [
      { label: 'Organizations', value: totalOrgs },
      { label: 'Teams', value: totalTeams },
      { label: 'Fees due', value: totalFeesDue },
    ]
  }, [orgs.length, teams.length, totalFeesDue])

  const nextUpAcrossTeams = useMemo(() => {
    const first = upcomingSessions[0]
    if (!first || teams.length === 0) return null
    const d = new Date(first.start_time)
    return {
      teamId: teams[0].id,
      teamName: teams[0].name || 'Team',
      date: d.toLocaleDateString(),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      title: first.session_type || 'Session',
    }
  }, [upcomingSessions, teams])

  if (isCoachAthleteLaunch) {
    return null
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Athlete Portal</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Orgs & Teams</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">See the organizations and teams you belong to.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {summaryStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
              ))}
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Next up</p>
                {nextUpAcrossTeams ? (
                  <>
                    <p className="mt-3 text-sm font-semibold text-[#191919]">{nextUpAcrossTeams.title}</p>
                    <p className="mt-1 text-xs text-[#6b5f55]">
                      {nextUpAcrossTeams.teamName} · {nextUpAcrossTeams.date} · {nextUpAcrossTeams.time}
                    </p>
                    <a
                      href={`/athlete/calendar?team=${encodeURIComponent(nextUpAcrossTeams.teamName)}`}
                      className="mt-3 inline-flex text-xs font-semibold text-[#b80f0a] underline"
                    >
                      View calendar
                    </a>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-[#6b5f55]">No sessions scheduled yet.</p>
                )}
              </div>
            </section>
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Organizations</p>
                  <h2 className="mt-2 text-xl font-semibold text-[#191919]">Your org memberships</h2>
                </div>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search orgs or teams"
                  className="w-full max-w-xs rounded-full border border-[#dcdcdc] px-4 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {loading ? (
                  <LoadingState label="Loading organizations..." />
                ) : filteredOrgs.length === 0 ? (
                  <EmptyState
                    title="No organizations yet."
                    description="Ask your coach or org admin to add you to a team."
                  />
                ) : (
                  filteredOrgs.map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => setActiveOrgId(org.id)}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4 text-left text-sm transition hover:border-[#191919]"
                    >
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{org.org_type || 'Organization'}</p>
                      <p className="mt-2 text-lg font-semibold text-[#191919]">{org.name || 'Organization'}</p>
                      <p className="mt-1 text-xs text-[#6b5f55]">Role: {orgRoleMap.get(org.id) || 'Athlete'}</p>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Teams</p>
                <h2 className="mt-2 text-xl font-semibold text-[#191919]">Teams you are on</h2>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {loading ? (
                  <LoadingState label="Loading teams..." />
                ) : filteredTeams.length === 0 ? (
                  <EmptyState
                    title="No teams assigned yet."
                    description="Once an org assigns you to a team, it will appear here."
                  />
                ) : (
                  filteredTeams.map((team) => (
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
        <div className="fixed inset-x-0 top-[120px] bottom-0 z-[70] flex items-start justify-center bg-black/40 px-4 pb-10 overflow-y-auto">
          <div className="w-full max-w-5xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Organization hub</p>
                <h2 className="mt-2 text-2xl font-semibold">{activeOrg.name || 'Organization'}</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">
                  {activeOrg.org_type || 'Organization'} · Role: {orgRoleMap.get(activeOrg.id) || 'Athlete'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/athlete/calendar?org=${encodeURIComponent(activeOrg.name || 'Organization')}`}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  View calendar
                </a>
                <a
                  href={`/athlete/messages?new=${encodeURIComponent(activeOrg.name || 'Organization')}&type=org&id=${activeOrg.id}`}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  Message org
                </a>
                <a
                  href="/athlete/payments"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                >
                  Pay dues
                </a>
                <button
                  type="button"
                  onClick={() => setActiveOrgId(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] text-lg font-semibold"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Teams</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{activeOrgTeams.length}</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Coaches</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{activeOrgCoaches.length}</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Athletes</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{activeOrgAthletes.length}</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Next session</p>
                <p className="mt-2 text-sm font-semibold text-[#191919]">
                  {orgNextUp ? `${orgNextUp.date} · ${orgNextUp.time}` : 'No sessions yet'}
                </p>
                <p className="mt-1 text-xs text-[#6b5f55]">{orgNextUp?.title || 'Add to calendar to start'}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Announcements</p>
                      <p className="mt-2 text-sm font-semibold text-[#191919]">Org updates</p>
                    </div>
                    <a href="/athlete/notifications" className="text-xs font-semibold text-[#b80f0a] underline">
                      View all
                    </a>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {activeOrgAnnouncements.length === 0 ? (
                      <p className="text-xs text-[#6b5f55]">No announcements yet.</p>
                    ) : (
                      activeOrgAnnouncements.slice(0, 3).map((announcement) => (
                        <div key={announcement.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3">
                          <p className="text-xs text-[#6b5f55]">{announcement.date}</p>
                          <p className="font-semibold text-[#191919]">{announcement.title}</p>
                          <p className="mt-1 text-xs text-[#6b5f55]">{announcement.detail}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Teams</p>
                    <span className="text-xs text-[#6b5f55]">{activeOrgTeams.length} total</span>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {activeOrgTeams.length === 0 ? (
                      <p className="text-xs text-[#6b5f55]">No teams listed yet.</p>
                    ) : (
                      activeOrgTeams.map((team) => (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => setActiveTeamId(team.id)}
                          className="flex w-full items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-left text-sm"
                        >
                          <div>
                            <p className="font-semibold text-[#191919]">{team.name || 'Team'}</p>
                            <p className="text-xs text-[#6b5f55]">Added {formatDate(team.created_at) || '—'}</p>
                          </div>
                          <span className="text-xs font-semibold text-[#b80f0a]">View</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Fees & payments</p>
                    <a href="/athlete/payments" className="text-xs font-semibold text-[#b80f0a] underline">
                      Go to payments
                    </a>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {activeOrgFees.length === 0 ? (
                      <p className="text-xs text-[#6b5f55]">No org fees posted yet.</p>
                    ) : (
                      activeOrgFees.slice(0, 3).map((fee) => (
                        <div key={fee.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3">
                          <p className="text-xs text-[#6b5f55]">Due {fee.due_date}</p>
                          <p className="font-semibold text-[#191919]">{fee.title}</p>
                          <div className="mt-2 flex items-center justify-between text-xs font-semibold text-[#191919]">
                            <span>${(fee.amount_cents / 100).toFixed(0)}</span>
                            <span className={`rounded-full border px-3 py-1 ${
                              fee.status === 'paid'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : fee.status === 'overdue'
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}>
                              {fee.status}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Documents</p>
                    <button
                      type="button"
                      onClick={() => setToast('Org documents will appear here.')}
                      className="text-xs font-semibold text-[#b80f0a] underline"
                    >
                      View all
                    </button>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {activeOrgDocs.length === 0 ? (
                      <p className="text-xs text-[#6b5f55]">No documents uploaded yet.</p>
                    ) : (
                      activeOrgDocs.map((doc) => (
                        <div key={doc.id} className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                          <p className="font-semibold text-[#191919]">{doc.title}</p>
                          <p className="text-xs text-[#6b5f55]">{doc.type} · Updated {doc.updated_at}</p>
                          <button
                            type="button"
                            onClick={() => setToast('Document download starting...')}
                            className="mt-2 text-xs font-semibold text-[#b80f0a] underline"
                          >
                            Download
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Org contacts</p>
                  <div className="mt-3 space-y-2 text-sm text-[#191919]">
                    {(activeOrgCoaches.length === 0 ? [null] : activeOrgCoaches.slice(0, 2)).map((coach, index) => (
                      <div key={coach?.id || `org-coach-${index}`} className="rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
                        <p className="font-semibold">{coach?.full_name || coach?.email || 'Coach'}</p>
                        <p className="text-xs text-[#6b5f55]">Coach</p>
                      </div>
                    ))}
                    {activeOrgCoaches.length === 0 && (
                      <p className="text-xs text-[#6b5f55]">No coach contacts available yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTeam && (
        <div className="fixed inset-x-0 top-[120px] bottom-0 z-[70] flex items-start justify-center bg-black/40 px-4 pb-10 overflow-y-auto">
          <div className="w-full max-w-5xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Team hub</p>
                <h2 className="mt-2 text-2xl font-semibold">{activeTeam.name || 'Team'}</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">{orgNameMap.get(activeTeam.org_id || '') || 'Organization'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/athlete/calendar?team=${encodeURIComponent(activeTeam.name || 'Team')}`}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  View calendar
                </a>
                <a
                  href={`/athlete/messages?new=${encodeURIComponent(activeTeam.name || 'Team')}&type=team&id=${activeTeam.id}`}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  Message team
                </a>
                <a
                  href="/athlete/payments"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                >
                  Pay dues
                </a>
                <button
                  type="button"
                  onClick={() => setActiveTeamId(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] text-lg font-semibold"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Next session</p>
                <p className="mt-2 text-sm font-semibold text-[#191919]">
                  {nextTeamSession ? `${nextTeamSession.date} · ${nextTeamSession.time}` : 'No sessions yet'}
                </p>
                <p className="mt-1 text-xs text-[#6b5f55]">{nextTeamSession?.title || 'Add to calendar to start'}</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Attendance</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{attendanceLabel}</p>
                <p className="mt-1 text-xs text-[#6b5f55]">Last 30 days</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Fees due</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{dueFeesCount}</p>
                <p className="mt-1 text-xs text-[#6b5f55]">Outstanding fees</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs">
                <p className="uppercase tracking-[0.2em] text-[#6b5f55]">Roster</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{activeTeamAthletes.length}</p>
                <p className="mt-1 text-xs text-[#6b5f55]">Active athletes</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Announcements</p>
                      <p className="mt-2 text-sm font-semibold text-[#191919]">Latest updates</p>
                    </div>
                    <a href="/athlete/notifications" className="text-xs font-semibold text-[#b80f0a] underline">
                      View all
                    </a>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {activeTeamAnnouncements.length === 0 ? (
                      <p className="text-xs text-[#6b5f55]">No announcements yet.</p>
                    ) : (
                      activeTeamAnnouncements.slice(0, 3).map((announcement) => (
                        <div key={announcement.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3">
                          <p className="text-xs text-[#6b5f55]">{announcement.date}</p>
                          <p className="font-semibold text-[#191919]">{announcement.title}</p>
                          <p className="mt-1 text-xs text-[#6b5f55]">{announcement.detail}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Schedule snapshot</p>
                    <a
                      href={`/athlete/calendar?team=${encodeURIComponent(activeTeam.name || 'Team')}`}
                      className="text-xs font-semibold text-[#b80f0a]"
                    >
                      View full calendar
                    </a>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {activeTeamCalendar.length === 0 ? (
                      <p className="text-xs text-[#6b5f55]">No upcoming sessions listed. Check your calendar for updates.</p>
                    ) : (
                      activeTeamCalendar.slice(0, 5).map((session) => (
                        <div key={`${session.date}-${session.title}`} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3">
                          <p className="text-xs text-[#6b5f55]">{session.date} · {session.time}</p>
                          <p className="font-semibold text-[#191919]">{session.title}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Roster</p>
                      <p className="mt-2 text-sm font-semibold text-[#191919]">Coaches and athletes</p>
                    </div>
                    <input
                      value={rosterSearch}
                      onChange={(event) => setRosterSearch(event.target.value)}
                      placeholder="Search roster"
                      className="w-full max-w-xs rounded-full border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919]"
                    />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6b5f55]">Coaches</p>
                      <div className="mt-2 space-y-2 text-sm text-[#191919]">
                        {filteredRoster.coaches.length === 0 ? (
                          <p className="text-xs text-[#6b5f55]">No coaches listed yet.</p>
                        ) : (
                          filteredRoster.coaches.slice(0, 6).map((coach) => (
                            <div key={coach?.id} className="rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
                              <p className="font-semibold">{coach?.full_name || coach?.email || 'Coach'}</p>
                              <p className="text-xs text-[#6b5f55]">Coach</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6b5f55]">Athletes</p>
                      <div className="mt-2 space-y-2 text-sm text-[#191919]">
                        {filteredRoster.athletes.length === 0 ? (
                          <p className="text-xs text-[#6b5f55]">No athletes listed yet.</p>
                        ) : (
                          filteredRoster.athletes.slice(0, 8).map((athlete) => (
                            <div key={athlete?.id} className="rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
                              <p className="font-semibold">{athlete?.full_name || athlete?.email || 'Athlete'}</p>
                              <p className="text-xs text-[#6b5f55]">Athlete</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Fees & payments</p>
                    <a href="/athlete/payments" className="text-xs font-semibold text-[#b80f0a] underline">
                      Go to payments
                    </a>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {activeTeamFees.length === 0 ? (
                      <p className="text-xs text-[#6b5f55]">No dues posted yet.</p>
                    ) : (
                      activeTeamFees.map((fee) => (
                        <div key={fee.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3">
                          <p className="text-xs text-[#6b5f55]">Due {fee.due_date}</p>
                          <p className="font-semibold text-[#191919]">{fee.title}</p>
                          <div className="mt-2 flex items-center justify-between text-xs font-semibold text-[#191919]">
                            <span>${(fee.amount_cents / 100).toFixed(0)}</span>
                            <span className={`rounded-full border px-3 py-1 ${
                              fee.status === 'paid'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : fee.status === 'overdue'
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}>
                              {fee.status}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Documents</p>
                    <button
                      type="button"
                      onClick={() => setToast('Document downloads will appear here.')}
                      className="text-xs font-semibold text-[#b80f0a] underline"
                    >
                      View all
                    </button>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {activeTeamDocs.length === 0 ? (
                      <p className="text-xs text-[#6b5f55]">No documents uploaded yet.</p>
                    ) : (
                      activeTeamDocs.map((doc) => (
                        <div key={doc.id} className="rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                          <p className="font-semibold text-[#191919]">{doc.title}</p>
                          <p className="text-xs text-[#6b5f55]">{doc.type} · Updated {doc.updated_at}</p>
                          <button
                            type="button"
                            onClick={() => setToast('Document download starting...')}
                            className="mt-2 text-xs font-semibold text-[#b80f0a] underline"
                          >
                            Download
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Team contacts</p>
                  <div className="mt-3 space-y-2 text-sm text-[#191919]">
                    {(activeTeamCoaches.length === 0 ? [null] : activeTeamCoaches.slice(0, 2)).map((coach, index) => (
                      <div key={coach?.id || `coach-${index}`} className="rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
                        <p className="font-semibold">{coach?.full_name || coach?.email || 'Coach'}</p>
                        <p className="text-xs text-[#6b5f55]">Coach</p>
                      </div>
                    ))}
                    {activeTeamCoaches.length === 0 && (
                      <p className="text-xs text-[#6b5f55]">No coach contacts available yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
