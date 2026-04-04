'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'

type CoachRow = {
  id: string
  full_name: string | null
  email?: string | null
}

type LinkRow = {
  coach_id?: string | null
  athlete_id?: string | null
}

type CoachCard = {
  id: string
  name: string
  athletes: number
  email?: string
  specialty?: string
  availability?: string
  certifications?: string[]
  role?: 'head' | 'assistant'
  roleLabel?: string
  teams?: string[]
  status?: 'active' | 'inactive'
  nextSession?: string
  availabilityStatus?: string
  complianceStatus?: 'clear' | 'needs_attention'
  complianceIssues?: string[]
  attendanceRate?: number
  responseRate?: number
  sessionsHosted?: number
}

type TeamRow = {
  id: string
  name: string
}

type InviteRow = {
  id: string
  invited_email?: string | null
  invited_name?: string | null
  role?: string | null
  status?: string | null
  created_at?: string | null
  team_name?: string | null
}

export default function OrgCoachesPage() {
  const supabase = createClientComponentClient()
  const [coaches, setCoaches] = useState<CoachCard[]>([])
  const [loading, setLoading] = useState(true)
  const [profileCoach, setProfileCoach] = useState<CoachCard | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('Organization')
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [teamFilter, setTeamFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [certFilter, setCertFilter] = useState('all')
  const [availabilityFilter, setAvailabilityFilter] = useState('all')
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>([])
  const [bulkNotice, setBulkNotice] = useState('')
  const [assignTeamModalOpen, setAssignTeamModalOpen] = useState(false)
  const [assignTeamId, setAssignTeamId] = useState('')
  const [assignCoachIds, setAssignCoachIds] = useState<string[]>([])
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [roleCoachIds, setRoleCoachIds] = useState<string[]>([])
  const [selectedRole, setSelectedRole] = useState<'coach' | 'assistant_coach'>('coach')
  const [inviteCoachModalOpen, setInviteCoachModalOpen] = useState(false)
  const [addCoachModalOpen, setAddCoachModalOpen] = useState(false)
  const [inviteCoachEmail, setInviteCoachEmail] = useState('')
  const [addCoachEmail, setAddCoachEmail] = useState('')
  const [inviteCoachNotice, setInviteCoachNotice] = useState('')
  const [addCoachNotice, setAddCoachNotice] = useState('')
  const [inviteCoachSaving, setInviteCoachSaving] = useState(false)
  const [addCoachSaving, setAddCoachSaving] = useState(false)
  const [coachesReloadKey, setCoachesReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    const loadCoaches = async () => {
      setLoading(true)
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) {
        setLoading(false)
        return
      }

      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .maybeSingle()
      const membershipRow = (membership || null) as { org_id?: string | null } | null

      if (!membershipRow?.org_id) {
        setLoading(false)
        return
      }

      if (!active) return
      setOrgId(membershipRow.org_id)

      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', membershipRow.org_id)
        .maybeSingle()
      const orgRow = (org || null) as { name?: string | null } | null
      if (orgRow?.name && active) {
        setOrgName(orgRow.name)
      }

      const { data: membershipRows } = await supabase
        .from('organization_memberships')
        .select('user_id, role')
        .eq('org_id', membershipRow.org_id)
        .in('role', ['coach', 'assistant_coach'])
      const coachMembershipRows = (membershipRows || []) as Array<{ user_id?: string | null; role?: string | null }>

      const { data: teamRows } = await supabase
        .from('org_teams')
        .select('id, name')
        .eq('org_id', membershipRow.org_id)
      const orgTeams = (teamRows || []) as TeamRow[]

      if (active) {
        setTeams(orgTeams)
      }

      const coachIds = coachMembershipRows
        .map((row) => row.user_id)
        .filter(Boolean) as string[]

      if (coachIds.length === 0) {
        if (active) {
          setCoaches([])
          setLoading(false)
        }
        return
      }

      const { data: coachRows } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', coachIds)

      const { data: links } = await supabase
        .from('coach_athlete_links')
        .select('coach_id, athlete_id')
        .in('coach_id', coachIds)
      const coachAthleteLinks = (links || []) as LinkRow[]

      const teamIdList = orgTeams.map((team) => team.id)
      const { data: teamCoachRows } = teamIdList.length
        ? await supabase.from('org_team_coaches').select('coach_id, team_id').in('team_id', teamIdList)
        : { data: [] }
      const teamCoachLinks = (teamCoachRows || []) as Array<{ coach_id?: string | null; team_id?: string | null }>

      const teamNameMap = new Map(orgTeams.map((team) => [team.id, team.name] as const))
      const teamsByCoach = new Map<string, string[]>()
      teamCoachLinks.forEach((row) => {
        if (!row.coach_id || !row.team_id) return
        const teamName = teamNameMap.get(row.team_id)
        if (!teamName) return
        const existing = teamsByCoach.get(row.coach_id) || []
        if (!existing.includes(teamName)) {
          existing.push(teamName)
          teamsByCoach.set(row.coach_id, existing)
        }
      })

      const roleMap = new Map<string, string>()
      coachMembershipRows.forEach((row) => {
        if (row.user_id && row.role) {
          roleMap.set(row.user_id, row.role)
        }
      })

      if (!active) return
      const counts = new Map<string, number>()
      coachAthleteLinks.forEach((link) => {
        if (!link.coach_id) return
        counts.set(link.coach_id, (counts.get(link.coach_id) || 0) + 1)
      })

      const rows = (coachRows || []) as CoachRow[]
      if (active) {
        setCoaches(
          rows.map((coach) => ({
            id: coach.id,
            name: coach.full_name || 'Coach',
            athletes: counts.get(coach.id) || 0,
            email: coach.email || undefined,
            role: roleMap.get(coach.id) === 'assistant_coach' ? 'assistant' : 'head',
            roleLabel: roleMap.get(coach.id) === 'assistant_coach' ? 'Assistant Coach' : 'Head Coach',
            teams: teamsByCoach.get(coach.id) || [],
            status: 'active',
          }))
        )
        setLoading(false)
      }
    }
    loadCoaches()
    return () => {
      active = false
    }
  }, [supabase, coachesReloadKey])

  useEffect(() => {
    if (!orgId) return
    let active = true
    const loadInvites = async () => {
      try {
        const response = await fetch(`/api/org/invites?org_id=${orgId}`)
        if (!response.ok) return
        const data = await response.json()
        if (!active) return
        setInvites(data.invites || [])
      } catch {
        if (!active) return
        setInvites([])
      }
    }
    loadInvites()
    return () => {
      active = false
    }
  }, [orgId])

  const handleInviteCoach = useCallback(async () => {
    if (!orgId || !inviteCoachEmail.trim()) {
      setInviteCoachNotice('Enter a coach email.')
      return
    }
    setInviteCoachSaving(true)
    setInviteCoachNotice('')
    const trimmedEmail = inviteCoachEmail.trim()
    const response = await fetch('/api/org/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        role: 'coach',
        invited_email: trimmedEmail,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setInviteCoachNotice(payload?.error || 'Unable to send invite.')
    } else {
      setInviteCoachNotice(payload?.warning || 'Invite sent.')
      setInviteCoachEmail('')
      setCoachesReloadKey((prev) => prev + 1)
    }
    setInviteCoachSaving(false)
  }, [inviteCoachEmail, orgId])

  const handleAddCoach = useCallback(async () => {
    if (!orgId || !addCoachEmail.trim()) {
      setAddCoachNotice('Enter a coach email.')
      return
    }
    setAddCoachSaving(true)
    setAddCoachNotice('')
    const trimmedEmail = addCoachEmail.trim()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', trimmedEmail)
      .maybeSingle()
    if (!profile?.id) {
      setAddCoachNotice('Coach not found. Send them an invite instead.')
      setAddCoachSaving(false)
      return
    }
    const { data: existingMembership } = await supabase
      .from('organization_memberships')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', profile.id)
      .maybeSingle()
    if (existingMembership) {
      setAddCoachNotice('Coach is already part of this organization.')
      setAddCoachSaving(false)
      return
    }
    const { error } = await supabase.from('organization_memberships').insert({
      org_id: orgId,
      user_id: profile.id,
      role: 'coach',
    })
    if (error) {
      setAddCoachNotice('Unable to add coach.')
      setAddCoachSaving(false)
      return
    }
    setAddCoachNotice('Coach added.')
    setAddCoachEmail('')
    setAddCoachSaving(false)
    setAddCoachModalOpen(false)
    setCoachesReloadKey((prev) => prev + 1)
  }, [addCoachEmail, orgId, supabase])

  const teamOptions = useMemo(() => {
    const names = new Set<string>()
    teams.forEach((team) => names.add(team.name))
    coaches.forEach((coach) => coach.teams?.forEach((team) => names.add(team)))
    return Array.from(names).sort()
  }, [coaches, teams])

  const certificationOptions = useMemo(() => {
    const certs = new Set<string>()
    coaches.forEach((coach) => coach.certifications?.forEach((cert) => certs.add(cert)))
    return Array.from(certs).sort()
  }, [coaches])

  const availabilityOptions = useMemo(() => {
    const options = new Set<string>()
    coaches.forEach((coach) => {
      if (coach.availabilityStatus) options.add(coach.availabilityStatus)
      if (!coach.availabilityStatus && coach.availability) options.add(coach.availability)
    })
    return Array.from(options).sort()
  }, [coaches])

  const filteredCoaches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return coaches.filter((coach) => {
      if (query) {
        const haystack = [
          coach.name,
          coach.email,
          coach.specialty,
          ...(coach.teams || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (teamFilter !== 'all') {
        if (teamFilter === 'unassigned') {
          if (coach.teams && coach.teams.length > 0) return false
        } else if (!coach.teams?.includes(teamFilter)) {
          return false
        }
      }
      if (roleFilter !== 'all') {
        if (roleFilter === 'head' && coach.role !== 'head') return false
        if (roleFilter === 'assistant' && coach.role !== 'assistant') return false
      }
      if (statusFilter !== 'all' && coach.status !== statusFilter) return false
      if (certFilter !== 'all' && !coach.certifications?.includes(certFilter)) return false
      if (availabilityFilter !== 'all') {
        const availabilityValue = coach.availabilityStatus || coach.availability || ''
        if (availabilityValue !== availabilityFilter) return false
      }
      return true
    })
  }, [availabilityFilter, certFilter, coaches, roleFilter, searchQuery, statusFilter, teamFilter])

  const coachSummary = useMemo(() => {
    const headCount = coaches.filter((coach) => coach.role !== 'assistant').length
    const assistantCount = coaches.filter((coach) => coach.role === 'assistant').length
    const teamSet = new Set<string>()
    coaches.forEach((coach) => coach.teams?.forEach((team) => teamSet.add(team)))
    return {
      total: coaches.length,
      headCount,
      assistantCount,
      teamsCovered: teamSet.size,
      openRoles: invites.length,
    }
  }, [coaches, invites.length])

  const warnings = useMemo(() => {
    const issues: { id: string; label: string }[] = []
    coaches.forEach((coach) => {
      if (coach.complianceIssues && coach.complianceIssues.length > 0) {
        coach.complianceIssues.forEach((issue) => {
          issues.push({ id: `${coach.id}-${issue}`, label: `${coach.name}: ${issue}` })
        })
      }
    })
    return issues
  }, [coaches])

  const formatInviteDate = (value?: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const toggleCoachSelection = (coachId: string) => {
    setSelectedCoachIds((prev) =>
      prev.includes(coachId) ? prev.filter((id) => id !== coachId) : [...prev, coachId]
    )
  }

  const handleSelectAll = () => {
    if (selectedCoachIds.length === filteredCoaches.length) {
      setSelectedCoachIds([])
    } else {
      setSelectedCoachIds(filteredCoaches.map((coach) => coach.id))
    }
  }

  const handleBulkStatus = (status: 'active' | 'inactive') => {
    setCoaches((prev) =>
      prev.map((coach) =>
        selectedCoachIds.includes(coach.id)
          ? {
              ...coach,
              status,
            }
          : coach
      )
    )
    setBulkNotice(`Marked ${selectedCoachIds.length} coach${selectedCoachIds.length === 1 ? '' : 'es'} as ${status}.`)
  }

  const handleExportRoster = () => {
    const rows = coaches.filter((coach) => selectedCoachIds.includes(coach.id))
    if (rows.length === 0) return
    const csv = [
      ['Name', 'Email', 'Role', 'Teams', 'Athletes'],
      ...rows.map((coach) => [
        coach.name,
        coach.email || '',
        coach.roleLabel || '',
        (coach.teams || []).join(' | '),
        String(coach.athletes || 0),
      ]),
    ]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${orgName.replace(/\s+/g, '_').toLowerCase()}_coaches.csv`
    link.click()
    URL.revokeObjectURL(url)
    setBulkNotice('Export ready. Check your downloads.')
  }

  const openAssignTeam = (coachIds: string[]) => {
    setAssignCoachIds(coachIds)
    setAssignTeamId('')
    setAssignTeamModalOpen(true)
  }

  const openRoleModal = (coachIds: string[]) => {
    setRoleCoachIds(coachIds)
    setSelectedRole('coach')
    setRoleModalOpen(true)
  }

  const handleAssignTeamSave = useCallback(async () => {
    if (!assignTeamId || assignCoachIds.length === 0) {
      setBulkNotice('Select a team to assign.')
      return
    }
    const teamName = teams.find((team) => team.id === assignTeamId)?.name || ''
    const payload = assignCoachIds.map((coachId) => ({
      team_id: assignTeamId,
      coach_id: coachId,
      role: 'coach',
    }))
    const { error } = await supabase.from('org_team_coaches').upsert(payload)
    if (error) {
      setBulkNotice('Unable to assign team.')
      return
    }
    if (teamName) {
      setCoaches((prev) =>
        prev.map((coach) =>
          assignCoachIds.includes(coach.id)
            ? {
                ...coach,
                teams: Array.from(new Set([...(coach.teams || []), teamName])),
              }
            : coach
        )
      )
    }
    setAssignTeamModalOpen(false)
    setBulkNotice('Team assigned.')
  }, [assignCoachIds, assignTeamId, supabase, teams])

  const handleRoleSave = useCallback(async () => {
    if (!orgId || roleCoachIds.length === 0) {
      setBulkNotice('Select a coach to update.')
      return
    }
    const roleLabel = selectedRole === 'assistant_coach' ? 'Assistant Coach' : 'Head Coach'
    const { error } = await supabase
      .from('organization_memberships')
      .update({ role: selectedRole })
      .eq('org_id', orgId)
      .in('user_id', roleCoachIds)
    if (error) {
      setBulkNotice('Unable to update role.')
      return
    }
    setCoaches((prev) =>
      prev.map((coach) =>
        roleCoachIds.includes(coach.id)
          ? {
              ...coach,
              role: selectedRole === 'assistant_coach' ? 'assistant' : 'head',
              roleLabel,
            }
          : coach
      )
    )
    setRoleModalOpen(false)
    setBulkNotice('Role updated.')
  }, [orgId, roleCoachIds, selectedRole, supabase])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Coaches</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Invite, approve, and manage coaching staff.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setInviteCoachModalOpen(true)}
            >
              Invite coach
            </button>
            <button
              type="button"
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
              onClick={() => setAddCoachModalOpen(true)}
            >
              Add coach
            </button>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: 'Total coaches', value: coachSummary.total },
                { label: 'Head / Assistant', value: `${coachSummary.headCount} / ${coachSummary.assistantCount}` },
                { label: 'Teams covered', value: coachSummary.teamsCovered },
                { label: 'Open roles', value: coachSummary.openRoles },
              ].map((stat) => (
                <div key={stat.label} className="glass-card border border-[#191919] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{stat.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div className="glass-card border border-[#191919] bg-white p-4">
                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Search</p>
                      <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search coaches, teams, specialty"
                        className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      />
                    </div>
                    <div className="w-full sm:w-auto">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Team</p>
                      <select
                        value={teamFilter}
                        onChange={(event) => setTeamFilter(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      >
                        <option value="all">All teams</option>
                        <option value="unassigned">Unassigned</option>
                        {teamOptions.map((team) => (
                          <option key={team} value={team}>
                            {team}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-full sm:w-auto">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Role</p>
                      <select
                        value={roleFilter}
                        onChange={(event) => setRoleFilter(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      >
                        <option value="all">All roles</option>
                        <option value="head">Head coach</option>
                        <option value="assistant">Assistant coach</option>
                      </select>
                    </div>
                    <div className="w-full sm:w-auto">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Status</p>
                      <select
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      >
                        <option value="all">All statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div className="min-w-[170px]">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Certification</p>
                      <select
                        value={certFilter}
                        onChange={(event) => setCertFilter(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      >
                        <option value="all">All certs</option>
                        {certificationOptions.map((cert) => (
                          <option key={cert} value={cert}>
                            {cert}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-[170px]">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Availability</p>
                      <select
                        value={availabilityFilter}
                        onChange={(event) => setAvailabilityFilter(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      >
                        <option value="all">All availability</option>
                        {availabilityOptions.map((availability) => (
                          <option key={availability} value={availability}>
                            {availability}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={handleSelectAll}
                    >
                      {selectedCoachIds.length === filteredCoaches.length && filteredCoaches.length > 0 ? 'Clear selection' : 'Select all'}
                    </button>
                    <span className="text-xs text-[#4a4a4a]">
                      {selectedCoachIds.length} selected
                    </span>
                    <button
                      type="button"
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={() => openAssignTeam(selectedCoachIds)}
                      disabled={selectedCoachIds.length === 0}
                    >
                      Assign team
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={() => openRoleModal(selectedCoachIds)}
                      disabled={selectedCoachIds.length === 0}
                    >
                      Set role
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={() => handleBulkStatus('inactive')}
                      disabled={selectedCoachIds.length === 0}
                    >
                      Deactivate
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={() => handleBulkStatus('active')}
                      disabled={selectedCoachIds.length === 0}
                    >
                      Reactivate
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={handleExportRoster}
                      disabled={selectedCoachIds.length === 0}
                    >
                      Export roster
                    </button>
                  </div>
                  {bulkNotice && (
                    <p className="mt-3 text-xs text-[#4a4a4a]">{bulkNotice}</p>
                  )}
                </div>

                {loading ? (
                  <LoadingState label="Loading coaches..." />
                ) : filteredCoaches.length === 0 ? (
                  <div className="space-y-3">
                    <EmptyState title="No coaches found." description="Invite a coach to get started." />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                        onClick={() => setInviteCoachModalOpen(true)}
                      >
                        Invite coach
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                        onClick={() => setAddCoachModalOpen(true)}
                      >
                        Add coach
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[calc(4*26rem)] space-y-4 overflow-y-auto pr-1">
                    {filteredCoaches.map((coach) => {
                      const hasComplianceIssues = (coach.complianceIssues || []).length > 0
                      return (
                        <div key={coach.id} className="glass-card border border-[#191919] bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <label className="flex min-w-0 flex-1 items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedCoachIds.includes(coach.id)}
                                onChange={() => toggleCoachSelection(coach.id)}
                                className="mt-1 h-4 w-4 accent-[#b80f0a]"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#191919]">{coach.name}</p>
                                <p className="mt-1 break-words text-xs text-[#4a4a4a]">{coach.email || 'Email not listed'}</p>
                              </div>
                            </label>
                            <div className="flex flex-wrap items-center justify-end gap-2 text-right">
                              <span className="rounded-full border border-[#191919] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#191919]">
                                {coach.roleLabel || 'Coach'}
                              </span>
                              <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#4a4a4a]">
                                {coach.status || 'active'}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                            {(coach.teams && coach.teams.length > 0) ? (
                              coach.teams.map((team) => (
                                <span key={team} className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[#4a4a4a]">
                                  {team}
                                </span>
                              ))
                            ) : (
                              <span className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[#4a4a4a]">Unassigned</span>
                            )}
                          </div>

                          <div className="mt-3 space-y-1 text-xs text-[#4a4a4a]">
                            <p>
                              <span className="font-semibold text-[#191919]">Specialty:</span>{' '}
                              {coach.specialty || 'Program coverage'}
                            </p>
                            <p>
                              <span className="font-semibold text-[#191919]">Next session:</span>{' '}
                              {coach.nextSession || 'No sessions scheduled'}
                            </p>
                            <p>
                              <span className="font-semibold text-[#191919]">Availability:</span>{' '}
                              {coach.availabilityStatus || coach.availability || 'Schedule on file'}
                            </p>
                            <p>
                              <span className="font-semibold text-[#191919]">Compliance:</span>{' '}
                              <span className={hasComplianceIssues ? 'text-[#b80f0a]' : 'text-[#191919]'}>
                                {hasComplianceIssues ? 'Needs attention' : 'Clear'}
                              </span>
                              {hasComplianceIssues && coach.complianceIssues ? ` · ${coach.complianceIssues[0]}` : ''}
                            </p>
                            {coach.certifications && coach.certifications.length > 0 ? (
                              <p>
                                <span className="font-semibold text-[#191919]">Certifications:</span>{' '}
                                {coach.certifications.join(', ')}
                              </p>
                            ) : null}
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            {[
                              { label: 'Attendance', value: coach.attendanceRate ? `${coach.attendanceRate}%` : '—' },
                              { label: 'Response', value: coach.responseRate ? `${coach.responseRate}%` : '—' },
                              { label: 'Sessions', value: coach.sessionsHosted ? `${coach.sessionsHosted}` : '—' },
                            ].map((metric) => (
                              <div key={metric.label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-2 text-center">
                                <p className="text-[9px] uppercase tracking-[0.14em] text-[#4a4a4a]">{metric.label}</p>
                                <p className="mt-1 text-sm font-semibold text-[#191919]">{metric.value}</p>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <Link
                              href={`/org/messages?coach=${coach.id}`}
                              className="w-full rounded-full border border-[#191919] px-3 py-1 text-center text-xs font-semibold text-[#191919]"
                            >
                              Message
                            </Link>
                            <button
                              type="button"
                              onClick={() => openAssignTeam([coach.id])}
                              className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            >
                              Assign team
                            </button>
                            <button
                              type="button"
                              onClick={() => openRoleModal([coach.id])}
                              className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            >
                              Set role
                            </button>
                            <Link
                              href={`/org/calendar?coach=${coach.id}`}
                              className="w-full rounded-full border border-[#191919] px-3 py-1 text-center text-xs font-semibold text-[#191919]"
                            >
                              View schedule
                            </Link>
                            <Link
                              href={`/org/notes?coach=${coach.id}`}
                              className="w-full rounded-full border border-[#191919] px-3 py-1 text-center text-xs font-semibold text-[#191919]"
                            >
                              View notes
                            </Link>
                            <button
                              type="button"
                              onClick={() => setProfileCoach(coach)}
                              className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            >
                              View profile
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <aside className="space-y-4">
                <div className="glass-card border border-[#191919] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Pinned warnings</p>
                    <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]">
                      {warnings.length}
                    </span>
                  </div>
                  {warnings.length === 0 ? (
                    <p className="mt-3 text-sm text-[#4a4a4a]">No compliance issues to review.</p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-xs text-[#4a4a4a]">
                      {warnings.slice(0, 5).map((warning) => (
                        <li key={warning.id} className="rounded-2xl border border-[#f0d6d6] bg-[#fff5f5] px-3 py-2 text-[#b80f0a]">
                          {warning.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="glass-card border border-[#191919] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Invite status</p>
                    <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]">
                      {invites.length}
                    </span>
                  </div>
                  {invites.length === 0 ? (
                    <p className="mt-3 text-sm text-[#4a4a4a]">No pending invites.</p>
                  ) : (
                    <div className="mt-3 space-y-3 text-xs text-[#4a4a4a]">
                      {invites.slice(0, 4).map((invite) => (
                        <div key={invite.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3">
                          <p className="text-sm font-semibold text-[#191919]">
                            {invite.invited_name || invite.invited_email || 'Coach invite'}
                          </p>
                          <p className="mt-1">
                            {invite.role === 'assistant_coach' ? 'Assistant coach' : 'Coach'}
                            {invite.team_name ? ` · ${invite.team_name}` : ''}
                          </p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.2em]">
                            {invite.status || 'Pending'} · {formatInviteDate(invite.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>

      {assignTeamModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Assign team</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Assign team to coach</h2>
              </div>
              <button
                type="button"
                onClick={() => setAssignTeamModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="space-y-2 text-sm text-[#191919]">
                <span className="text-xs font-semibold text-[#4a4a4a]">Team</span>
                <select
                  value={assignTeamId}
                  onChange={(event) => setAssignTeamId(event.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                >
                  <option value="">Select a team</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-[#4a4a4a]">Assigning {assignCoachIds.length} coach(es).</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                  onClick={handleAssignTeamSave}
                >
                  Save team assignment
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  onClick={() => setAssignTeamModalOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {roleModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Set role</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Update coach role</h2>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="space-y-2 text-sm text-[#191919]">
                <span className="text-xs font-semibold text-[#4a4a4a]">Role</span>
                <select
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value as 'coach' | 'assistant_coach')}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                >
                  <option value="coach">Head coach</option>
                  <option value="assistant_coach">Assistant coach</option>
                </select>
              </label>
              <p className="text-xs text-[#4a4a4a]">Updating {roleCoachIds.length} coach(es).</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                  onClick={handleRoleSave}
                >
                  Save role
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  onClick={() => setRoleModalOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {profileCoach && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coach profile</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{profileCoach.name}</h2>
                <p className="mt-1 text-xs text-[#4a4a4a]">{profileCoach.email || 'Email not listed'}</p>
              </div>
              <button
                type="button"
                onClick={() => setProfileCoach(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs text-[#4a4a4a]">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Overview</p>
                <p className="mt-2">
                  <span className="font-semibold text-[#191919]">Specialty:</span>{' '}
                  {profileCoach.specialty || 'Program coverage'}
                </p>
                <p>
                  <span className="font-semibold text-[#191919]">Athletes:</span> {profileCoach.athletes}
                </p>
                <p>
                  <span className="font-semibold text-[#191919]">Availability:</span>{' '}
                  {profileCoach.availability || 'Schedule on file'}
                </p>
              </div>
              {profileCoach.certifications && profileCoach.certifications.length > 0 ? (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Certifications</p>
                  <p className="mt-2">{profileCoach.certifications.join(', ')}</p>
                </div>
              ) : null}
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#4a4a4a]">Staff notes</p>
                <p className="mt-2">Primary lead for sprint groups and weeknight sessions.</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {inviteCoachModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Invite coach</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Send a coach invite</h2>
              </div>
              <button
                type="button"
                onClick={() => setInviteCoachModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="space-y-2 text-sm text-[#191919]">
                <span className="text-xs font-semibold text-[#4a4a4a]">Coach email</span>
                <input
                  type="email"
                  value={inviteCoachEmail}
                  onChange={(event) => setInviteCoachEmail(event.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  placeholder="coach@email.com"
                />
              </label>
              {inviteCoachNotice && <p className="text-xs text-[#4a4a4a]">{inviteCoachNotice}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                  onClick={handleInviteCoach}
                  disabled={inviteCoachSaving}
                >
                  {inviteCoachSaving ? 'Sending...' : 'Send invite'}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  onClick={() => {
                    setInviteCoachModalOpen(false)
                    setInviteCoachEmail('')
                    setInviteCoachNotice('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {addCoachModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Add coach</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Add a coach by email</h2>
              </div>
              <button
                type="button"
                onClick={() => setAddCoachModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="space-y-2 text-sm text-[#191919]">
                <span className="text-xs font-semibold text-[#4a4a4a]">Coach email</span>
                <input
                  type="email"
                  value={addCoachEmail}
                  onChange={(event) => setAddCoachEmail(event.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  placeholder="coach@email.com"
                />
              </label>
              {addCoachNotice && <p className="text-xs text-[#4a4a4a]">{addCoachNotice}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                  onClick={handleAddCoach}
                  disabled={addCoachSaving}
                >
                  {addCoachSaving ? 'Adding...' : 'Add coach'}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  onClick={() => {
                    setAddCoachModalOpen(false)
                    setAddCoachEmail('')
                    setAddCoachNotice('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
