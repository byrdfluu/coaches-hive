'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'

type ProfileRow = Record<string, any>

type ContactCard = {
  id: string
  name: string
  email?: string
  phone?: string
  role: string
  roleLabel: string
  status: 'active' | 'inactive'
  teams: string[]
  tags: string[]
  lastActive: string
  comms: {
    email: boolean
  }
  linkLabel?: string
  linkedNames?: string[]
  notes?: string
  unsignedWaivers?: boolean
}

export default function OrgContactsPage() {
  const supabase = createClientComponentClient()
  const [contacts, setContacts] = useState<ContactCard[]>([])
  const [selectedContact, setSelectedContact] = useState<ContactCard | null>(null)
  const [orgName, setOrgName] = useState('Organization')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([])
  const [bulkNotice, setBulkNotice] = useState('')
  const [assignTeamModalOpen, setAssignTeamModalOpen] = useState(false)
  const [assignTeamId, setAssignTeamId] = useState('')
  const [assignContactIds, setAssignContactIds] = useState<string[]>([])
  const [tagModalOpen, setTagModalOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [messageModalOpen, setMessageModalOpen] = useState(false)
  const [messageBody, setMessageBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('coach')
  const [inviteNotice, setInviteNotice] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [toastMessage, setToastMessage] = useState('')

  const loadContacts = useCallback(async () => {
    setLoading(true)
    setNotice('')
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (!userId) {
      setContacts([])
      setLoading(false)
      return
    }

    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (membershipError) {
      setNotice('Failed to load contacts — try refreshing the page.')
      setLoading(false)
      return
    }

    const membershipRow = (membership || null) as { org_id?: string | null } | null

    if (!membershipRow?.org_id) {
      setNotice('No organization found. Join or create an organization to manage contacts.')
      setLoading(false)
      return
    }

    setOrgId(membershipRow.org_id)

    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', membershipRow.org_id)
      .maybeSingle()
    const orgRow = (org || null) as { name?: string | null } | null
    if (orgRow?.name) setOrgName(orgRow.name)

    const { data: teamRows } = await supabase
      .from('org_teams')
      .select('id, name')
      .eq('org_id', membershipRow.org_id)
    const orgTeams = (teamRows || []) as Array<{ id: string; name: string }>

    setTeams(orgTeams)

    const { data: memberships } = await supabase
      .from('organization_memberships')
      .select('user_id, role')
      .eq('org_id', membershipRow.org_id)
    const memberRows = (memberships || []) as Array<{ user_id?: string | null; role?: string | null }>

    const contactIds = memberRows
      .map((row) => row.user_id)
      .filter(Boolean) as string[]

    if (contactIds.length === 0) {
      setContacts([])
      setLoading(false)
      return
    }

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, phone, notification_prefs, tags')
      .in('id', contactIds)

    if (profileError) {
      setNotice('Unable to load contacts.')
      setLoading(false)
      return
    }

    const teamNameMap = new Map(orgTeams.map((team) => [team.id, team.name] as const))

    const teamCoachRows = orgTeams.length > 0
      ? await supabase.from('org_team_coaches').select('coach_id, team_id').in('team_id', orgTeams.map((row) => row.id))
      : { data: [] }

    const teamMemberRows = orgTeams.length > 0
      ? await supabase.from('org_team_members').select('athlete_id, team_id').in('team_id', orgTeams.map((row) => row.id))
      : { data: [] }
    const teamCoachLinks = (teamCoachRows.data || []) as Array<{ coach_id?: string | null; team_id?: string | null }>
    const teamMemberLinks = (teamMemberRows.data || []) as Array<{ athlete_id?: string | null; team_id?: string | null }>

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

    const teamsByAthlete = new Map<string, string[]>()
    teamMemberLinks.forEach((row) => {
      if (!row.athlete_id || !row.team_id) return
      const teamName = teamNameMap.get(row.team_id)
      if (!teamName) return
      const existing = teamsByAthlete.get(row.athlete_id) || []
      if (!existing.includes(teamName)) {
        existing.push(teamName)
        teamsByAthlete.set(row.athlete_id, existing)
      }
    })

    const roleMap = new Map<string, string>()
    memberRows.forEach((row) => {
      if (row.user_id && row.role) {
        roleMap.set(row.user_id, row.role)
      }
    })

    const roleLabelFor = (role: string) => {
      if (role === 'assistant_coach') return 'Assistant Coach'
      if (role === 'coach') return 'Head Coach'
      if (role === 'athlete') return 'Athlete'
      if (role === 'guardian') return 'Parent/Guardian'
      if (role.includes('admin')) return 'Org Admin'
      return 'Contact'
    }

    const cards: ContactCard[] = (profiles || []).map((profile: ProfileRow): ContactCard => {
      const role = roleMap.get(profile.id) || profile.role || 'contact'
      const teamsList =
        role === 'coach' || role === 'assistant_coach'
          ? teamsByCoach.get(profile.id) || []
          : role === 'athlete'
            ? teamsByAthlete.get(profile.id) || []
            : []
      return {
        id: profile.id,
        name: profile.full_name || profile.name || 'Contact',
        email: profile.email || '',
        phone: profile.phone || '',
        role,
        roleLabel: roleLabelFor(role),
        status: 'active',
        teams: teamsList,
        tags: Array.isArray(profile.tags) ? profile.tags : [],
        lastActive: '—',
        comms: { email: Boolean(profile.email) },
      }
    })

    // Check waiver signatures for athlete contacts
    const athleteIds = cards.filter((card) => card.role === 'athlete').map((card) => card.id)
    if (athleteIds.length > 0) {
      const { data: requiredWaivers } = await supabase
        .from('waivers')
        .select('id')
        .eq('org_id', membershipRow.org_id)
        .eq('is_active', true)
        .contains('required_roles', ['athlete'])

      if (requiredWaivers && requiredWaivers.length > 0) {
        const waiverRows = requiredWaivers as Array<{ id: string }>
        const waiverIds = waiverRows.map((w) => w.id)
        const { data: signatures } = await supabase
          .from('waiver_signatures')
          .select('user_id, waiver_id')
          .in('waiver_id', waiverIds)
          .in('user_id', athleteIds)

        const signatureRows = (signatures || []) as Array<{ user_id: string; waiver_id: string }>
        const signedPairs = new Set(signatureRows.map((s) => `${s.user_id}:${s.waiver_id}`))

        cards.forEach((card) => {
          if (card.role !== 'athlete') return
          const hasAllSigned = waiverIds.every((wid: string) => signedPairs.has(`${card.id}:${wid}`))
          card.unsignedWaivers = !hasAllSigned
        })
      }
    }

    setContacts(cards)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadContacts()
  }, [loadContacts])

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

  const displayContacts = contacts
  const hasContacts = displayContacts.length > 0

  const gridVisible = !loading && hasContacts
  const coachGridStyle = {
    opacity: gridVisible ? 1 : 0,
    transform: gridVisible ? 'translateY(0)' : 'translateY(10px)',
    transition: 'opacity 220ms ease-out, transform 220ms ease-out',
  }

  const selectedDetail = useMemo(() => selectedContact, [selectedContact])

  const teamOptions = useMemo(() => {
    const names = new Set<string>()
    teams.forEach((team) => names.add(team.name))
    displayContacts.forEach((contact) => contact.teams.forEach((team) => names.add(team)))
    return Array.from(names).sort()
  }, [displayContacts, teams])

  const tagOptions = useMemo(() => {
    const tags = new Set<string>()
    displayContacts.forEach((contact) => contact.tags.forEach((tag) => tags.add(tag)))
    return Array.from(tags).sort()
  }, [displayContacts])

  const filteredContacts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return displayContacts.filter((contact) => {
      if (query) {
        const haystack = [
          contact.name,
          contact.email,
          contact.roleLabel,
          ...(contact.teams || []),
          ...(contact.tags || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (roleFilter !== 'all' && contact.role !== roleFilter) return false
      if (teamFilter !== 'all') {
        if (teamFilter === 'unassigned' && contact.teams.length > 0) return false
        if (teamFilter !== 'unassigned' && !contact.teams.includes(teamFilter)) return false
      }
      if (statusFilter !== 'all' && contact.status !== statusFilter) return false
      if (tagFilter !== 'all' && !contact.tags.includes(tagFilter)) return false
      return true
    })
  }, [displayContacts, roleFilter, searchQuery, statusFilter, tagFilter, teamFilter])

  const contactSummary = useMemo(() => {
    const total = displayContacts.length
    const coachesCount = displayContacts.filter((contact) => ['coach', 'assistant_coach'].includes(contact.role)).length
    const athleteCount = displayContacts.filter((contact) => contact.role === 'athlete').length
    const guardianCount = displayContacts.filter((contact) => contact.role === 'guardian').length
    const needsAttention = displayContacts.filter((contact) => !contact.email || !contact.phone).length
    return { total, coachesCount, athleteCount, guardianCount, needsAttention }
  }, [displayContacts])

  const alerts = useMemo(() => {
    return displayContacts
      .filter((contact) => !contact.email || !contact.phone)
      .map((contact) => ({
        id: contact.id,
        label: `${contact.name}: ${!contact.email ? 'Missing email' : ''}${!contact.email && !contact.phone ? ' · ' : ''}${!contact.phone ? 'Missing phone' : ''}`,
      }))
  }, [displayContacts])

  const toggleSelect = (id: string) => {
    setSelectedContactIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]))
  }

  const handleSelectAll = () => {
    if (selectedContactIds.length === filteredContacts.length) {
      setSelectedContactIds([])
    } else {
      setSelectedContactIds(filteredContacts.map((contact) => contact.id))
    }
  }

  const openAssignTeam = (ids: string[]) => {
    setAssignContactIds(ids)
    setAssignTeamId('')
    setAssignTeamModalOpen(true)
  }

  const openTagModal = (ids: string[]) => {
    setAssignContactIds(ids)
    setTagInput('')
    setTagModalOpen(true)
  }

  const openMessageModal = (ids: string[]) => {
    setAssignContactIds(ids)
    setMessageBody('')
    setMessageModalOpen(true)
  }

  const handleAssignTeamSave = async () => {
    if (!assignTeamId || assignContactIds.length === 0) {
      setBulkNotice('Select a team to assign.')
      return
    }
    const teamName = teams.find((team) => team.id === assignTeamId)?.name || ''
    const response = await fetch('/api/org/contacts/assign-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_ids: assignContactIds, team_id: assignTeamId }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setBulkNotice(payload?.error || 'Unable to assign team.')
      return
    }
    setContacts((prev) =>
      prev.map((contact) =>
        assignContactIds.includes(contact.id)
          ? { ...contact, teams: teamName ? Array.from(new Set([...contact.teams, teamName])) : contact.teams }
          : contact
      )
    )
    setBulkNotice('Team assigned.')
    setAssignTeamModalOpen(false)
  }

  const handleAddTags = async () => {
    if (!tagInput.trim() || assignContactIds.length === 0) {
      setBulkNotice('Enter a tag to add.')
      return
    }
    const newTags = tagInput.split(',').map((tag) => tag.trim()).filter(Boolean)
    const response = await fetch('/api/org/contacts/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_ids: assignContactIds, tags: newTags }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setBulkNotice(payload?.error || 'Unable to save tags.')
      return
    }
    setContacts((prev) =>
      prev.map((contact) =>
        assignContactIds.includes(contact.id)
          ? { ...contact, tags: Array.from(new Set([...contact.tags, ...newTags])) }
          : contact
      )
    )
    setBulkNotice('Tags added.')
    setTagModalOpen(false)
  }

  return (
    <>
      <main className="page-shell">
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
          <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Contacts</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Organize coaches, athletes, and guardians for {orgName}.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/org/settings#export-center"
              className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Go to export center
            </Link>
            <button
              className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
              onClick={() => importInputRef.current?.click()}
            >
              Import CSV
            </button>
            <button
              className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
              onClick={() => setInviteNotice('')}
            >
              Invite contact
            </button>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: 'Total contacts', value: contactSummary.total },
                { label: 'Coaches', value: contactSummary.coachesCount },
                { label: 'Athletes', value: contactSummary.athleteCount },
                { label: 'Needs attention', value: contactSummary.needsAttention },
              ].map((stat) => (
                <div key={stat.label} className="glass-card border border-[#191919] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{stat.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <section className="glass-card border border-[#191919] bg-white p-4 lg:sticky lg:top-6">
                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Search</p>
                      <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search contacts, teams, tags"
                        className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      />
                    </div>
                    <div className="w-full sm:w-auto">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Role</p>
                      <select
                        value={roleFilter}
                        onChange={(event) => setRoleFilter(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      >
                        <option value="all">All roles</option>
                        <option value="coach">Head coach</option>
                        <option value="assistant_coach">Assistant coach</option>
                        <option value="athlete">Athlete</option>
                        <option value="guardian">Guardian</option>
                        <option value="org_admin">Admin</option>
                      </select>
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
                    <div className="w-full sm:w-auto">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Tag</p>
                      <select
                        value={tagFilter}
                        onChange={(event) => setTagFilter(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      >
                        <option value="all">All tags</option>
                        {tagOptions.map((tag) => (
                          <option key={tag} value={tag}>
                            {tag}
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
                      {selectedContactIds.length === filteredContacts.length && filteredContacts.length > 0 ? 'Clear selection' : 'Select all'}
                    </button>
                    <span className="text-xs text-[#4a4a4a]">{selectedContactIds.length} selected</span>
                    <button
                      type="button"
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={() => openMessageModal(selectedContactIds)}
                      disabled={selectedContactIds.length === 0}
                    >
                      Message
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={() => openAssignTeam(selectedContactIds)}
                      disabled={selectedContactIds.length === 0}
                    >
                      Assign team
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={() => openTagModal(selectedContactIds)}
                      disabled={selectedContactIds.length === 0}
                    >
                      Add tags
                    </button>
                    <Link
                      href="/org/settings#export-center"
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Go to export center
                    </Link>
                  </div>
                  {bulkNotice && <p className="mt-2 text-xs text-[#4a4a4a]">{bulkNotice}</p>}
                </section>

                {loading ? (
                  <LoadingState label="Loading contacts..." />
                ) : !hasContacts ? (
                  <div className="space-y-3">
                    <EmptyState title="No contacts yet." description="Invite people or import a roster to get started." />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                        onClick={() => setInviteNotice('')}
                      >
                        Invite contact
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                        onClick={() => importInputRef.current?.click()}
                      >
                        Import CSV
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {notice && (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#fdfdfd] px-4 py-3 text-xs text-[#4a4a4a]">
                        {notice}
                      </div>
                    )}
                    <div className="max-h-[calc(6*15rem)] space-y-4 overflow-y-auto pr-1" style={coachGridStyle}>
                      {filteredContacts.map((contact) => (
                        <div key={contact.id} className="glass-card border border-[#191919] bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <label className="flex min-w-0 flex-1 items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedContactIds.includes(contact.id)}
                                onChange={() => toggleSelect(contact.id)}
                                className="mt-1 h-4 w-4 accent-[#b80f0a]"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#191919]">{contact.name}</p>
                                <p className="mt-1 break-words text-xs text-[#4a4a4a]">{contact.email || 'Email not listed'}</p>
                              </div>
                            </label>
                            <div className="flex flex-wrap items-center gap-2 text-right">
                              <span className="rounded-full border border-[#191919] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#191919]">
                                {contact.roleLabel}
                              </span>
                              <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#4a4a4a]">
                                {contact.status}
                              </span>
                              {contact.unsignedWaivers && (
                                <span className="rounded-full border border-[#f0b429] bg-[#fffbef] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#b06000]">
                                  ⚠ Waiver unsigned
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                            {contact.teams.length > 0 ? (
                              contact.teams.map((team) => (
                                <span key={team} className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[#4a4a4a]">
                                  {team}
                                </span>
                              ))
                            ) : (
                              <span className="rounded-full border border-[#dcdcdc] px-2 py-1 text-[#4a4a4a]">Unassigned</span>
                            )}
                          </div>

                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-2">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-[#4a4a4a]">Last active</p>
                              <p className="mt-1 text-sm font-semibold text-[#191919]">{contact.lastActive}</p>
                            </div>
                            <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-2">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-[#4a4a4a]">Comms</p>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[#4a4a4a]">
                                  Email {contact.comms.email ? 'On' : 'Off'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {contact.tags.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                              {contact.tags.map((tag) => (
                                <span key={tag} className="rounded-full border border-[#191919] px-2 py-1 text-[#191919]">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {contact.linkLabel && contact.linkedNames && contact.linkedNames.length > 0 && (
                            <div className="mt-3 text-xs text-[#4a4a4a]">
                              <span className="font-semibold text-[#191919]">{contact.linkLabel}:</span>{' '}
                              {contact.linkedNames.join(', ')}
                            </div>
                          )}

                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => openMessageModal([contact.id])}
                              className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            >
                              Message
                            </button>
                            <button
                              type="button"
                              onClick={() => openAssignTeam([contact.id])}
                              className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            >
                              Assign team
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedContact(contact)}
                              className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            >
                              View profile
                            </button>
                            <button
                              type="button"
                              onClick={() => setToastMessage('Note added to contact.')}
                              className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            >
                              Add note
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <aside className="space-y-4">
                <div className="glass-card border border-[#191919] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Import contacts</p>
                  <p className="mt-2 text-sm text-[#4a4a4a]">Upload a CSV to add families, athletes, or staff.</p>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.currentTarget.files?.[0]
                      if (!file || !orgId) return
                      event.currentTarget.value = ''
                      const text = await file.text()
                      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
                      if (lines.length < 2) {
                        setNotice('CSV must have a header row and at least one data row.')
                        return
                      }
                      const headers = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''))
                      const emailIdx = headers.indexOf('email')
                      const roleIdx = headers.indexOf('role')
                      const teamIdx = headers.indexOf('team_id')
                      if (emailIdx === -1) {
                        setNotice('CSV must have an "email" column.')
                        return
                      }
                      const invites = lines.slice(1).map((line) => {
                        const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''))
                        const entry: { email: string; role?: string; team_id?: string } = { email: cols[emailIdx] || '' }
                        if (roleIdx !== -1 && cols[roleIdx]) entry.role = cols[roleIdx]
                        if (teamIdx !== -1 && cols[teamIdx]) entry.team_id = cols[teamIdx]
                        return entry
                      }).filter((i) => i.email && i.email.includes('@'))
                      if (invites.length === 0) {
                        setNotice('No valid email addresses found in CSV.')
                        return
                      }
                      setNotice('Importing…')
                      const res = await fetch('/api/org/invites/bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ org_id: orgId, invites }),
                      })
                      const result = await res.json()
                      if (!res.ok) {
                        setNotice(result.error || 'Import failed.')
                        return
                      }
                      setNotice(`Import complete: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed.`)
                    }}
                  />
                  <button
                    type="button"
                    className="mt-3 w-full rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]"
                    onClick={() => importInputRef.current?.click()}
                  >
                    Upload CSV
                  </button>
                </div>

                <div className="glass-card border border-[#191919] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Invite contact</p>
                  <div className="mt-3 space-y-3 text-sm">
                    <label className="space-y-2 text-sm text-[#191919]">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Email</span>
                      <input
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="person@email.com"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-[#191919]">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Role</span>
                      <select
                        value={inviteRole}
                        onChange={(event) => setInviteRole(event.target.value)}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      >
                        <option value="coach">Head coach</option>
                        <option value="assistant_coach">Assistant coach</option>
                        <option value="athlete">Athlete</option>
                      </select>
                    </label>
                    <button
                      className="w-full rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]"
                      onClick={async () => {
                        if (!orgId || !inviteEmail.trim()) {
                          setInviteNotice('Add an email.')
                          return
                        }
                        setInviteSaving(true)
                        setInviteNotice('')
                        const response = await fetch('/api/org/invites', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            org_id: orgId,
                            role: inviteRole,
                            invited_email: inviteEmail.trim(),
                          }),
                        })
                        const payload = await response.json().catch(() => null)
                        if (!response.ok) {
                          setInviteNotice(payload?.error || 'Unable to send invite.')
                        } else {
                          setInviteNotice(payload?.warning || 'Invite sent.')
                          setInviteEmail('')
                        }
                        setInviteSaving(false)
                      }}
                      disabled={inviteSaving}
                    >
                      {inviteSaving ? 'Sending...' : 'Send invite'}
                    </button>
                    {inviteNotice && <p className="text-xs text-[#4a4a4a]">{inviteNotice}</p>}
                  </div>
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
                      {invites.slice(0, 4).map((invite: any) => (
                        <div key={invite.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3">
                          <p className="text-sm font-semibold text-[#191919]">
                            {invite.invited_name || invite.invited_email || 'Contact invite'}
                          </p>
                          <p className="mt-1">
                            {invite.role === 'assistant_coach' ? 'Assistant coach' : invite.role || 'Contact'}
                            {invite.team_name ? ` · ${invite.team_name}` : ''}
                          </p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.2em]">
                            {invite.status || 'Pending'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="glass-card border border-[#191919] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Pinned alerts</p>
                    <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]">
                      {alerts.length}
                    </span>
                  </div>
                  {alerts.length === 0 ? (
                    <p className="mt-3 text-sm text-[#4a4a4a]">No contact issues to review.</p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-xs text-[#4a4a4a]">
                      {alerts.slice(0, 4).map((alert) => (
                        <li key={alert.id} className="rounded-2xl border border-[#f0d6d6] bg-[#fff5f5] px-3 py-2 text-[#b80f0a]">
                          {alert.label}
                        </li>
                      ))}
                    </ul>
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
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Assign team to contact</h2>
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
              <p className="text-xs text-[#4a4a4a]">Assigning {assignContactIds.length} contact(s).</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                  onClick={handleAssignTeamSave}
                >
                  Save assignment
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

      {tagModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Add tags</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Tag selected contacts</h2>
              </div>
              <button
                type="button"
                onClick={() => setTagModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="space-y-2 text-sm text-[#191919]">
                <span className="text-xs font-semibold text-[#4a4a4a]">Tags (comma separated)</span>
                <input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  placeholder="e.g., Travel, Parent, Sprinter"
                />
              </label>
              <p className="text-xs text-[#4a4a4a]">Applying to {assignContactIds.length} contact(s).</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                  onClick={handleAddTags}
                >
                  Save tags
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  onClick={() => setTagModalOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {messageModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Message</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Send a message</h2>
              </div>
              <button
                type="button"
                onClick={() => setMessageModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <p className="text-xs text-[#4a4a4a]">To {assignContactIds.length} contact(s).</p>
              <textarea
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                className="h-28 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                placeholder="Write your message..."
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white"
                  onClick={() => {
                    setMessageModalOpen(false)
                    setToastMessage('Message queued to send.')
                  }}
                >
                  Send message
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  onClick={() => setMessageModalOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDetail && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Contact detail</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{selectedDetail.name}</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">{selectedDetail.roleLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedContact(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Contact</p>
                <p className="mt-2 text-sm text-[#191919]">{selectedDetail.email || 'Email not listed'}</p>
                <p className="mt-1 text-sm text-[#191919]">{selectedDetail.phone || 'Phone not listed'}</p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Teams</p>
                <p className="mt-2 text-sm text-[#191919]">
                  {selectedDetail.teams.length > 0 ? selectedDetail.teams.join(', ') : 'Unassigned'}
                </p>
              </div>
              <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Communication</p>
                <p className="mt-2 text-sm text-[#191919]">
                  Email {selectedDetail.comms.email ? 'On' : 'Off'}
                </p>
              </div>
              {selectedDetail.tags.length > 0 && (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Tags</p>
                  <p className="mt-2 text-sm text-[#191919]">{selectedDetail.tags.join(', ')}</p>
                </div>
              )}
              {selectedDetail.linkLabel && selectedDetail.linkedNames && selectedDetail.linkedNames.length > 0 && (
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{selectedDetail.linkLabel}</p>
                  <p className="mt-2 text-sm text-[#191919]">{selectedDetail.linkedNames.join(', ')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </main>
      <Toast message={toastMessage} onClose={() => setToastMessage('')} />
    </>
  )
}
