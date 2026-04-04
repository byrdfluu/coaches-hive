'use client'

import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import Link from 'next/link'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import { ORG_FEATURES, formatTierName, isOrgPlanActive, normalizeOrgTier, normalizeOrgStatus } from '@/lib/planRules'
import { normalizeOrgType } from '@/lib/orgTypeConfig'

type OrgType = 'school' | 'club' | 'travel' | 'academy' | 'organization'
type TeamRow = { id: string; name?: string | null }
type TeamMemberRow = { team_id?: string | null; athlete_id?: string | null }
type TeamCoachRow = { team_id?: string | null; coach_id?: string | null; role?: string | null }
type RolePermissionMap = Record<string, boolean>
type MemberRow = {
  id: string
  user_id: string
  role: string
  full_name?: string | null
  email?: string | null
  created_at?: string | null
  status?: string | null
}

export default function OrgPermissionsPage() {
  const supabase = createClientComponentClient()
  const [orgType, setOrgType] = useState<OrgType>('organization')
  const [orgTier, setOrgTier] = useState<'standard' | 'growth' | 'enterprise'>('standard')
  const [planStatus, setPlanStatus] = useState<'trialing' | 'active' | 'past_due' | 'canceled'>('trialing')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
  const [approvalNotice, setApprovalNotice] = useState('')
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null)
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([])
  const [teamCoaches, setTeamCoaches] = useState<TeamCoachRow[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [roleNotice, setRoleNotice] = useState('')
  const [roleSavingId, setRoleSavingId] = useState<string | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('org_admin')
  const [inviteTeamId, setInviteTeamId] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')
  const [toast, setToast] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)
  const [rolePermissions, setRolePermissions] = useState<Record<string, RolePermissionMap>>({})
  const [permissionModalOpen, setPermissionModalOpen] = useState(false)
  const [activePermissionRole, setActivePermissionRole] = useState('')
  const [permissionDraft, setPermissionDraft] = useState<RolePermissionMap>({})
  const [permissionNotice, setPermissionNotice] = useState('')
  const [permissionSaving, setPermissionSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'suspended'>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [bulkRole, setBulkRole] = useState('')
  const [bulkTeamId, setBulkTeamId] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [assignModal, setAssignModal] = useState<{ memberId: string } | null>(null)
  const [assignTeamId, setAssignTeamId] = useState('')
  const [previewRole, setPreviewRole] = useState('')
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [revokingMemberId, setRevokingMemberId] = useState<string | null>(null)
  const [suspendingMemberId, setSuspendingMemberId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const loadOrgType = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return
      if (active) setCurrentUserId(userId)
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .maybeSingle()
      const membershipRow = (membership || null) as { org_id?: string | null } | null
      if (!membershipRow?.org_id) return
      setOrgId(membershipRow.org_id)
      const { data: orgSettings } = await supabase
        .from('org_settings')
        .select('plan, plan_status')
        .eq('org_id', membershipRow.org_id)
        .maybeSingle()
      const settingsRow = (orgSettings || null) as { plan?: string | null; plan_status?: string | null } | null
      if (active && settingsRow?.plan) {
        setOrgTier(normalizeOrgTier(settingsRow.plan))
      }
      if (active && settingsRow?.plan_status) {
        setPlanStatus(normalizeOrgStatus(settingsRow.plan_status))
      }
      const { data: org } = await supabase
        .from('organizations')
        .select('org_type')
        .eq('id', membershipRow.org_id)
        .maybeSingle()
      const orgRow = (org || null) as { org_type?: string | null } | null
      if (!active) return
      setOrgType(normalizeOrgType(orgRow?.org_type))
    }
    loadOrgType()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    if (!orgId) return
    let active = true
    const loadApprovals = async () => {
      const response = await fetch(`/api/org/invites?org_id=${orgId}`)
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      setPendingApprovals(payload.invites || [])
    }
    loadApprovals()
    return () => {
      active = false
    }
  }, [orgId])

  useEffect(() => {
    setSelectedMembers([])
  }, [activeTab])

  useEffect(() => {
    if (!orgId) return
    let active = true
    const loadPermissions = async () => {
      const response = await fetch(`/api/org/permissions?org_id=${orgId}`)
      if (!response.ok) return
      const payload = await response.json().catch(() => ({}))
      if (!active) return
      const map: Record<string, RolePermissionMap> = {}
      ;(payload.permissions || []).forEach((row: { role?: string; permissions?: RolePermissionMap }) => {
        if (!row.role) return
        map[row.role] = row.permissions || {}
      })
      setRolePermissions(map)
    }
    loadPermissions()
    return () => {
      active = false
    }
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    let active = true
    const loadTeams = async () => {
      const { data: teamRows } = await supabase
        .from('org_teams')
        .select('id, name')
        .eq('org_id', orgId)
      if (!active) return
      const rows = (teamRows || []) as TeamRow[]
      setTeams(rows)
      const teamIds = rows.map((team) => team.id)
      if (teamIds.length) {
        const { data: memberRows } = await supabase
          .from('org_team_members')
          .select('team_id, athlete_id')
          .in('team_id', teamIds)
        const { data: coachRows } = await supabase
          .from('org_team_coaches')
          .select('team_id, coach_id, role')
          .in('team_id', teamIds)
        if (!active) return
        setTeamMembers((memberRows || []) as TeamMemberRow[])
        setTeamCoaches((coachRows || []) as TeamCoachRow[])
      } else {
        setTeamMembers([])
        setTeamCoaches([])
      }
    }
    const loadMembers = async () => {
      const { data: memberRows } = await supabase
        .from('organization_memberships')
        .select('id, user_id, role, created_at, status')
        .eq('org_id', orgId)
      const membershipRows = (memberRows || []) as Array<{
        id: string
        user_id: string
        role: string
        created_at?: string | null
        status?: string | null
      }>

      const userIds = membershipRows.map((row) => row.user_id)
      const { data: profileRows } = userIds.length
        ? await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds)
        : { data: [] }
      const profiles = (profileRows || []) as Array<{ id: string; full_name?: string | null; email?: string | null }>

      const profileMap = new Map(profiles.map((row) => [row.id, row] as const))
      const combined = membershipRows.map((row) => {
        const profile = profileMap.get(row.user_id)
        return {
          ...row,
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? null,
          status: row.status || 'active',
        }
      })

      if (!active) return
      setMembers(combined)
    }
    loadTeams()
    loadMembers()
    return () => {
      active = false
    }
  }, [orgId, supabase])

  const roleOptions = useMemo(() => {
    const base = [
      { value: 'org_admin', label: 'Org admin' },
      { value: 'club_admin', label: 'Club admin' },
      { value: 'travel_admin', label: 'Travel admin' },
      { value: 'school_admin', label: 'School admin' },
      { value: 'athletic_director', label: 'Athletic director' },
      { value: 'program_director', label: 'Program director' },
      { value: 'team_manager', label: 'Team manager' },
      { value: 'coach', label: 'Coach' },
      { value: 'assistant_coach', label: 'Assistant coach' },
      { value: 'athlete', label: 'Athlete' },
    ]
    return base
  }, [])

  const permissionOptions = useMemo(
    () => [
      { key: 'overview', label: 'Overview' },
      { key: 'teams', label: 'Teams' },
      { key: 'coaches', label: 'Coaches' },
      { key: 'contacts', label: 'Contacts' },
      { key: 'notifications', label: 'Notifications' },
      { key: 'messages', label: 'Messages' },
      { key: 'notes', label: 'Notes' },
      { key: 'marketplace', label: 'Marketplace' },
      { key: 'calendar', label: 'Calendar' },
      { key: 'payments', label: 'Payments' },
      { key: 'permissions', label: 'Permissions' },
      { key: 'reports', label: 'Reports' },
      { key: 'settings', label: 'Settings' },
    ],
    []
  )

  const defaultPermissions = useMemo(() => {
    const defaults: RolePermissionMap = {}
    permissionOptions.forEach((option) => {
      defaults[option.key] = true
    })
    return defaults
  }, [permissionOptions])

  const roles = useMemo(() => {
    if (orgType === 'school') {
      return [
        { title: 'School admin', detail: 'District-level access, compliance, and billing.' },
        { title: 'Athletic director', detail: 'Oversee programs, coaches, and schedules.' },
        { title: 'Team manager', detail: 'Manage rosters, schedules, and staff.' },
        { title: 'Coach', detail: 'Access to assigned teams and calendars.' },
        { title: 'Assistant coach', detail: 'Limited access to team calendars and athletes.' },
      ]
    }
    if (orgType === 'club') {
      return [
        { title: 'Club admin', detail: 'Manage billing, memberships, and compliance.' },
        { title: 'Program director', detail: 'Oversee programs, coaches, and schedules.' },
        { title: 'Team manager', detail: 'Manage rosters, schedules, and staff.' },
        { title: 'Coach', detail: 'Access to assigned teams and calendars.' },
        { title: 'Assistant coach', detail: 'Limited access to team calendars and athletes.' },
      ]
    }
    if (orgType === 'travel') {
      return [
        { title: 'Travel admin', detail: 'Manage operations, billing, and compliance.' },
        { title: 'Program director', detail: 'Oversee travel squads and staff.' },
        { title: 'Team manager', detail: 'Manage rosters, schedules, and travel details.' },
        { title: 'Coach', detail: 'Access to assigned teams and calendars.' },
        { title: 'Assistant coach', detail: 'Limited access to team calendars and athletes.' },
      ]
    }
    if (orgType === 'academy') {
      return [
        { title: 'Org admin', detail: 'Manage billing, compliance, and staff roles.' },
        { title: 'Program director', detail: 'Oversee training groups and coaching staff.' },
        { title: 'Team manager', detail: 'Manage rosters, schedules, and athlete onboarding.' },
        { title: 'Coach', detail: 'Access to assigned training groups and calendars.' },
        { title: 'Assistant coach', detail: 'Limited access to training groups and athletes.' },
      ]
    }
    return [
      { title: 'Org admin', detail: 'Manage billing, compliance, and staff roles.' },
      { title: 'Program director', detail: 'Oversee programs, coaches, and schedules.' },
      { title: 'Team manager', detail: 'Manage rosters, schedules, and staff.' },
      { title: 'Coach', detail: 'Access to assigned teams and calendars.' },
      { title: 'Assistant coach', detail: 'Limited access to team calendars and athletes.' },
    ]
  }, [orgType])

  const roleKeyFromTitle = useCallback((title: string) => (
    title.toLowerCase().replace(/\s+/g, '_')
  ), [])

  const planActive = isOrgPlanActive(planStatus)
  const orgFeatures = ORG_FEATURES[orgTier]
  const roleAssignmentsEnabled = planActive && orgFeatures.roleAssignments
  const showTeamSelect = ['coach', 'assistant_coach', 'team_manager', 'athlete'].includes(inviteRole)
  const activeRoleLabel = roleOptions.find((option) => option.value === activePermissionRole)?.label || activePermissionRole
  const assignMember = assignModal ? members.find((member) => member.id === assignModal.memberId) : null
  const teamNameById = useMemo(() => {
    const map = new Map<string, string>()
    teams.forEach((team) => map.set(team.id, team.name || 'Team'))
    return map
  }, [teams])

  const memberTeamsByUserId = useMemo(() => {
    const map = new Map<string, string[]>()
    teamMembers.forEach((row) => {
      if (!row.athlete_id || !row.team_id) return
      const list = map.get(row.athlete_id) || []
      list.push(row.team_id)
      map.set(row.athlete_id, list)
    })
    teamCoaches.forEach((row) => {
      if (!row.coach_id || !row.team_id) return
      const list = map.get(row.coach_id) || []
      list.push(row.team_id)
      map.set(row.coach_id, list)
    })
    return map
  }, [teamMembers, teamCoaches])

  const adminRoles = useMemo(
    () => ['org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director'],
    []
  )
  const coachRoles = useMemo(() => ['coach', 'assistant_coach'], [])
  const staffRoles = useMemo(() => ['team_manager'], [])

  const summary = useMemo(() => {
    const activeMembers = members.filter((member) => member.status !== 'suspended')
    const suspendedCount = members.filter((member) => member.status === 'suspended').length
    const admins = activeMembers.filter((member) => adminRoles.includes(member.role)).length
    const coachesCount = activeMembers.filter((member) => coachRoles.includes(member.role)).length
    const staffCount = activeMembers.filter((member) => staffRoles.includes(member.role)).length
    return {
      total: activeMembers.length,
      admins,
      coaches: coachesCount,
      staff: staffCount,
      pending: pendingApprovals.length,
      suspended: suspendedCount,
    }
  }, [members, pendingApprovals.length, adminRoles, coachRoles, staffRoles])

  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return members.filter((member) => {
      if (activeTab === 'active' && member.status === 'suspended') return false
      if (activeTab === 'suspended' && member.status !== 'suspended') return false
      if (roleFilter !== 'all' && member.role !== roleFilter) return false
      if (teamFilter !== 'all') {
        const teamIds = memberTeamsByUserId.get(member.user_id) || []
        if (!teamIds.includes(teamFilter)) return false
      }
      if (query) {
        const haystack = `${member.full_name || ''} ${member.email || ''}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [members, roleFilter, teamFilter, searchQuery, memberTeamsByUserId, activeTab])

  const openPermissionsModal = (role: string) => {
    const current = rolePermissions[role] || {}
    setActivePermissionRole(role)
    setPermissionDraft({ ...defaultPermissions, ...current })
    setPermissionNotice('')
    setPermissionModalOpen(true)
  }

  const saveRolePermissions = async () => {
    if (!orgId || !activePermissionRole) return
    setPermissionSaving(true)
    setPermissionNotice('')
    const response = await fetch('/api/org/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        role: activePermissionRole,
        permissions: permissionDraft,
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setPermissionNotice(payload?.error || 'Unable to save permissions.')
      setPermissionSaving(false)
      return
    }
    setRolePermissions((prev) => ({ ...prev, [activePermissionRole]: permissionDraft }))
    setPermissionSaving(false)
    setPermissionModalOpen(false)
    setToast('Permissions updated.')
  }

  const handleSendInvite = async () => {
    const email = inviteEmail.trim()
    setInviteNotice('')
    if (!orgId) {
      setInviteNotice('No organization found.')
      return
    }
    if (!email) {
      setInviteNotice('Add an email address.')
      return
    }
    setInviteSaving(true)
    const response = await fetch('/api/org/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        role: inviteRole,
        invited_email: email,
        team_id: showTeamSelect && inviteTeamId ? inviteTeamId : null,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setInviteNotice(payload?.error || 'Unable to send invite.')
      setInviteSaving(false)
      return
    }
    setInviteSaving(false)
    setInviteEmail('')
    setInviteTeamId('')
    setInviteNotice('')
    setShowInviteModal(false)
    setApprovalNotice(payload?.warning || 'Invite sent.')
  }

  const handleResendInvite = async (inviteId: string) => {
    setApprovalNotice('')
    setApprovalBusy(inviteId)
    const response = await fetch('/api/org/invites/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_id: inviteId }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setApprovalNotice(payload?.error || 'Unable to resend invite.')
      setApprovalBusy(null)
      return
    }
    setApprovalNotice(payload?.warning || 'Invite resent.')
    setPendingApprovals((prev) =>
      prev.map((invite) =>
        invite.id === inviteId ? { ...invite, created_at: new Date().toISOString() } : invite
      )
    )
    setApprovalBusy(null)
  }

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    )
  }

  const handleRevokeMember = async (memberId: string, memberName?: string | null) => {
    const confirmed = window.confirm(`Remove access for ${memberName || 'this member'}? This cannot be undone.`)
    if (!confirmed) return
    setRoleNotice('')
    setRevokingMemberId(memberId)
    try {
      const response = await fetch('/api/org/memberships/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membership_id: memberId }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setRoleNotice(payload?.error || 'Unable to revoke access.')
        return
      }
      setMembers((prev) => prev.filter((member) => member.id !== memberId))
      setSelectedMembers((prev) => prev.filter((id) => id !== memberId))
      setToast('Access removed')
    } finally {
      setRevokingMemberId(null)
    }
  }

  const handleAssignTeam = async (memberId: string, teamId: string) => {
    setRoleNotice('')
    const response = await fetch('/api/org/memberships/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membership_id: memberId, team_id: teamId }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setRoleNotice(payload?.error || 'Unable to assign team.')
      return
    }
    const payload = await response.json().catch(() => null)
    if (payload?.team_members) {
      setTeamMembers((prev) => payload.team_members as TeamMemberRow[])
    }
    if (payload?.team_coaches) {
      setTeamCoaches((prev) => payload.team_coaches as TeamCoachRow[])
    }
    setToast('Team access updated')
  }

  const handleBulkRoleChange = async () => {
    if (!bulkRole || selectedMembers.length === 0) return
    setBulkLoading(true)
    for (const memberId of selectedMembers) {
      const response = await fetch('/api/org/memberships/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membership_id: memberId, role: bulkRole }),
      })
      if (response.ok) {
        setMembers((prev) => prev.map((row) => (row.id === memberId ? { ...row, role: bulkRole } : row)))
      }
    }
    setToast('Roles updated')
    setBulkRole('')
    setBulkLoading(false)
  }

  const handleBulkAssignTeam = async () => {
    if (!bulkTeamId || selectedMembers.length === 0) return
    setBulkLoading(true)
    for (const memberId of selectedMembers) {
      await handleAssignTeam(memberId, bulkTeamId)
    }
    setBulkTeamId('')
    setBulkLoading(false)
  }

  const handleBulkRevoke = async () => {
    if (selectedMembers.length === 0) return
    setBulkLoading(true)
    for (const memberId of selectedMembers) {
      await handleRevokeMember(memberId)
    }
    setBulkLoading(false)
  }

  const handleStatusChange = async (memberId: string, status: 'active' | 'suspended', memberName?: string | null) => {
    if (status === 'suspended') {
      const confirmed = window.confirm(`Suspend ${memberName || 'this member'}? They will lose access until restored.`)
      if (!confirmed) return
    }
    setRoleNotice('')
    setSuspendingMemberId(memberId)
    try {
      const response = await fetch('/api/org/memberships/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membership_id: memberId, status }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setRoleNotice(payload?.error || 'Unable to update status.')
        return
      }
      const payload = await response.json().catch(() => null)
      if (payload?.membership) {
        setMembers((prev) => prev.map((row) => (row.id === memberId ? { ...row, status } : row)))
      }
      setToast(status === 'suspended' ? 'Member suspended' : 'Member restored')
    } finally {
      setSuspendingMemberId(null)
    }
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-3 py-6 sm:px-5 sm:py-8 lg:px-6 lg:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-2xl font-semibold text-[#191919] sm:text-3xl">Permissions</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Assign role-based access across the org.</p>
          </div>
          <div className="flex w-full flex-col gap-2 text-sm md:w-auto md:flex-row md:flex-wrap md:items-center">
            <Link
              href="/org/audit"
              className="w-full rounded-full border border-[#191919] px-4 py-2 text-center text-xs font-semibold text-[#191919] sm:w-auto"
            >
              View audit trail
            </Link>
            <button
              type="button"
              className="w-full rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] sm:w-auto"
              onClick={() => setPreviewModalOpen(true)}
            >
              View as role
            </button>
            <button
              className="w-full rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white sm:w-auto"
              onClick={() => {
                setInviteNotice('')
                setShowInviteModal(true)
              }}
            >
              Invite
            </button>
          </div>
        </header>
        {!planActive ? (
          <p className="mt-2 text-xs text-[#4a4a4a]">
            Billing status: {formatTierName(planStatus)}. Activate billing to manage roles.
          </p>
        ) : !orgFeatures.roleAssignments ? (
          <p className="mt-2 text-xs text-[#4a4a4a]">
            Role-based access is available on Growth or Enterprise. Current plan: {formatTierName(orgTier)}.
          </p>
        ) : null}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="min-w-0 space-y-4">
            {previewRole ? (
              <div className="rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                Preview mode: viewing as {roleOptions.find((option) => option.value === previewRole)?.label || previewRole}.
              </div>
            ) : null}

            <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Users</p>
                <p className="mt-2 text-xl font-semibold text-[#191919]">{summary.total}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Admins</p>
                <p className="mt-2 text-xl font-semibold text-[#191919]">{summary.admins}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coaches</p>
                <p className="mt-2 text-xl font-semibold text-[#191919]">{summary.coaches}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Staff</p>
                <p className="mt-2 text-xl font-semibold text-[#191919]">{summary.staff}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Invites</p>
                <p className="mt-2 text-xl font-semibold text-[#191919]">{summary.pending}</p>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-xs font-semibold md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
                  {[
                    { id: 'active', label: 'Active', count: summary.total },
                    { id: 'pending', label: 'Pending invites', count: summary.pending },
                    { id: 'suspended', label: 'Suspended', count: summary.suspended },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as typeof activeTab)}
                      className={`shrink-0 rounded-full border px-3 py-1 ${
                        activeTab === tab.id
                          ? 'border-[#191919] bg-[#191919] text-white'
                          : 'border-[#dcdcdc] text-[#191919]'
                      }`}
                    >
                      {tab.label} <span className="ml-1 text-[11px] text-[#b80f0a]">{tab.count}</span>
                    </button>
                  ))}
                </div>
                <div className="grid w-full gap-2 md:flex md:w-auto md:flex-wrap md:items-center">
                  <input
                    className="w-full rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919] md:w-56"
                    placeholder="Search name or email"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  <select
                    className="w-full rounded-full border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919] md:w-auto"
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value)}
                  >
                    <option value="all">All roles</option>
                    {roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full rounded-full border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#191919] md:w-auto"
                    value={teamFilter}
                    onChange={(event) => setTeamFilter(event.target.value)}
                  >
                    <option value="all">All teams</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name || 'Team'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {selectedMembers.length > 0 ? (
                <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-xs md:flex-row md:flex-wrap md:items-center md:justify-between">
                  <span>{selectedMembers.length} selected</span>
                  <div className="grid gap-2 md:flex md:flex-wrap md:items-center">
                    <select
                      className="w-full rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-xs md:w-auto"
                      value={bulkRole}
                      onChange={(event) => setBulkRole(event.target.value)}
                    >
                      <option value="">Change role</option>
                      {roleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleBulkRoleChange}
                      disabled={!bulkRole || bulkLoading}
                      className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60 md:w-auto"
                    >
                      Apply role
                    </button>
                    <select
                      className="w-full rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-xs md:w-auto"
                      value={bulkTeamId}
                      onChange={(event) => setBulkTeamId(event.target.value)}
                    >
                      <option value="">Assign team</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name || 'Team'}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleBulkAssignTeam}
                      disabled={!bulkTeamId || bulkLoading}
                      className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60 md:w-auto"
                    >
                      Apply team
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkRevoke}
                      disabled={bulkLoading}
                      className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60 md:w-auto"
                    >
                      Remove access
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
            {activeTab === 'pending' && (
              <section className="glass-card card-accent border border-[#191919] bg-white p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Approvals</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Pending invite approvals</h2>
                    <p className="mt-1 text-sm text-[#4a4a4a]">Review accepted invites before they join the org.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {pendingApprovals.length === 0 ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-[#4a4a4a]">
                      No approvals waiting right now.
                    </div>
                  ) : (
                    pendingApprovals.map((invite) => (
                      <div key={invite.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3">
                        <p className="font-semibold text-[#191919]">
                          {invite.invited_name || invite.invited_email}
                        </p>
                        <p className="text-xs text-[#4a4a4a]">
                          {invite.team_name ? `${invite.team_name} · ` : ''}Role: {invite.role}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-full bg-[#b80f0a] px-3 py-1 text-xs font-semibold text-white"
                            disabled={approvalBusy === invite.id}
                            onClick={async () => {
                              setApprovalBusy(invite.id)
                              setApprovalNotice('')
                              const response = await fetch('/api/org/invites/approve', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ invite_id: invite.id, action: 'approve' }),
                              })
                              if (!response.ok) {
                                setApprovalNotice('Unable to approve invite.')
                              } else {
                                setPendingApprovals((prev) => prev.filter((row) => row.id !== invite.id))
                              }
                              setApprovalBusy(null)
                            }}
                          >
                            {approvalBusy === invite.id ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            disabled={approvalBusy === invite.id}
                            onClick={() => handleResendInvite(invite.id)}
                          >
                            {approvalBusy === invite.id ? 'Sending...' : 'Resend invite'}
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            disabled={approvalBusy === invite.id}
                            onClick={async () => {
                              setApprovalBusy(invite.id)
                              setApprovalNotice('')
                              const response = await fetch('/api/org/invites/approve', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ invite_id: invite.id, action: 'decline' }),
                              })
                              if (!response.ok) {
                                setApprovalNotice('Unable to decline invite.')
                              } else {
                                setPendingApprovals((prev) => prev.filter((row) => row.id !== invite.id))
                              }
                              setApprovalBusy(null)
                            }}
                          >
                            {approvalBusy === invite.id ? 'Working...' : 'Decline'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {approvalNotice && <p className="mt-2 text-xs text-[#4a4a4a]">{approvalNotice}</p>}
              </section>
            )}

            {activeTab === 'active' && (
              <section className="glass-card border border-[#191919] bg-white p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Access control</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Role assignments</h2>
                    <p className="mt-1 text-sm text-[#4a4a4a]">Update member roles to control access across billing, compliance, and teams.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {filteredMembers.length === 0 ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-[#4a4a4a]">
                      No members found. Invite a coach or staff member to get started.
                    </div>
                  ) : (
                    filteredMembers.map((member) => {
                      const teamIds = memberTeamsByUserId.get(member.user_id) || []
                      const isOwner = member.user_id === currentUserId
                      return (
                        <div key={member.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <label className="flex min-w-0 items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4"
                                disabled={isOwner}
                                checked={selectedMembers.includes(member.id)}
                                onChange={() => toggleMemberSelection(member.id)}
                              />
                              <div>
                                <p className="font-semibold text-[#191919]">{member.full_name || 'Member'}</p>
                                <p className="text-xs text-[#4a4a4a]">{member.email || member.user_id}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#4a4a4a]">
                                  <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 uppercase tracking-[0.2em]">
                                    {isOwner ? 'Org owner' : member.role.replace('_', ' ')}
                                  </span>
                                  <span>Last active: {member.created_at ? new Date(member.created_at).toLocaleDateString() : '—'}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {teamIds.length === 0 ? (
                                    <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[11px] text-[#4a4a4a]">
                                      Org-wide access
                                    </span>
                                  ) : (
                                    teamIds.map((teamId) => (
                                      <span
                                        key={teamId}
                                        className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[11px] text-[#4a4a4a]"
                                      >
                                        {teamNameById.get(teamId) || 'Team'}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </div>
                            </label>
                            <div className="grid gap-2 text-xs font-semibold sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center">
                              <select
                                className="w-full rounded-full border border-[#191919] bg-white px-3 py-2 text-xs font-semibold text-[#191919] xl:w-auto"
                                value={member.role}
                                disabled={roleSavingId === member.id || !roleAssignmentsEnabled || isOwner}
                                onChange={async (event) => {
                                  if (!planActive) {
                                    setRoleNotice('Activate billing to change roles.')
                                    return
                                  }
                                  if (!orgFeatures.roleAssignments) {
                                    setRoleNotice('Upgrade to Growth or Enterprise to change roles.')
                                    return
                                  }
                                  const nextRole = event.target.value
                                  setRoleSavingId(member.id)
                                  setRoleNotice('')
                                  const response = await fetch('/api/org/memberships/role', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ membership_id: member.id, role: nextRole }),
                                  })
                                  if (!response.ok) {
                                    const payload = await response.json().catch(() => null)
                                    setRoleNotice(payload?.error || 'Unable to update role.')
                                    setRoleSavingId(null)
                                    return
                                  }
                                  setMembers((prev) => prev.map((row) => (row.id === member.id ? { ...row, role: nextRole } : row)))
                                  setRoleSavingId(null)
                                }}
                              >
                                {roleOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] xl:w-auto"
                                onClick={() => {
                                  setAssignTeamId(teamIds[0] || '')
                                  setAssignModal({ memberId: member.id })
                                }}
                              >
                                Assign team
                              </button>
                              <button
                                type="button"
                                disabled={isOwner || suspendingMemberId === member.id}
                                className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60 xl:w-auto"
                                onClick={() => handleStatusChange(member.id, 'suspended', member.full_name)}
                              >
                                {suspendingMemberId === member.id ? 'Suspending…' : 'Suspend'}
                              </button>
                              <button
                                type="button"
                                disabled={isOwner || revokingMemberId === member.id}
                                className="w-full rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60 xl:w-auto"
                                onClick={() => handleRevokeMember(member.id, member.full_name)}
                              >
                                {revokingMemberId === member.id ? 'Removing…' : 'Revoke access'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
                {roleNotice && <p className="mt-2 text-xs text-[#4a4a4a]">{roleNotice}</p>}
              </section>
            )}

            {activeTab === 'suspended' && (
              <section className="glass-card border border-[#191919] bg-white p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Suspended</p>
                    <h2 className="mt-2 text-xl font-semibold text-[#191919]">Suspended members</h2>
                    <p className="mt-1 text-sm text-[#4a4a4a]">Restore access when ready.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {filteredMembers.length === 0 ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-[#4a4a4a]">
                      No suspended members right now.
                    </div>
                  ) : (
                    filteredMembers.map((member) => (
                      <div key={member.id} className="flex flex-col gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-[#191919]">{member.full_name || 'Member'}</p>
                          <p className="text-xs text-[#4a4a4a]">{member.email || member.user_id}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                          <button
                            type="button"
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            onClick={() => handleStatusChange(member.id, 'active')}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            disabled={revokingMemberId === member.id}
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                            onClick={() => handleRevokeMember(member.id, member.full_name)}
                          >
                            {revokingMemberId === member.id ? 'Removing…' : 'Revoke access'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

              <section className="glass-card border border-[#191919] bg-white p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Permission matrix</p>
                  <h2 className="mt-2 text-xl font-semibold text-[#191919]">Core access overview</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Snapshot of key areas by role.</p>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto text-sm">
                <div className="min-w-[480px] rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] p-4">
                  <div className="grid grid-cols-[1.2fr_repeat(5,1fr)] gap-2 text-xs font-semibold text-[#4a4a4a]">
                    <span>Role</span>
                    <span>Teams</span>
                    <span>Calendar</span>
                    <span>Payments</span>
                    <span>Reports</span>
                    <span>Settings</span>
                  </div>
                  {roles.map((role) => {
                    const key = roleKeyFromTitle(role.title)
                    const perms = { ...defaultPermissions, ...(rolePermissions[key] || {}) }
                    return (
                      <div key={role.title} className="mt-3 grid grid-cols-[1.2fr_repeat(5,1fr)] gap-2 text-xs text-[#191919]">
                        <span className="font-semibold">{role.title}</span>
                        {['teams', 'calendar', 'payments', 'reports', 'settings'].map((permKey) => (
                          <span key={permKey} className="text-center">
                            {perms[permKey] ? '✓' : '—'}
                          </span>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>

            {roles.map((role) => (
              <div key={role.title} className="glass-card border border-[#191919] bg-white p-4 sm:p-6">
                <p className="text-sm font-semibold text-[#191919]">{role.title}</p>
                <p className="mt-1 text-sm text-[#4a4a4a]">{role.detail}</p>
                {rolePermissions[roleKeyFromTitle(role.title)] ? (
                  <p className="mt-2 text-xs text-[#4a4a4a]">Custom permissions set.</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => openPermissionsModal(roleKeyFromTitle(role.title))}
                  className="mt-3 rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919]"
                >
                  Edit permissions
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {permissionModalOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Role permissions</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
                  {activeRoleLabel || 'Role'}
                </h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">Choose which areas this role can access.</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                onClick={() => setPermissionModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              {permissionOptions.map((option) => {
                const enabled = Boolean(permissionDraft[option.key])
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setPermissionDraft((prev) => ({ ...prev, [option.key]: !enabled }))}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      enabled ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
                    }`}
                  >
                    <span className="font-semibold text-[#191919]">{option.label}</span>
                    <span className={`text-xs font-semibold ${enabled ? 'text-[#b80f0a]' : 'text-[#4a4a4a]'}`}>
                      {enabled ? 'Allowed' : 'Hidden'}
                    </span>
                  </button>
                )
              })}
            </div>
            {permissionNotice && <p className="mt-3 text-xs text-[#4a4a4a]">{permissionNotice}</p>}
            <div className="mt-4 flex flex-wrap justify-end gap-2 text-xs font-semibold">
              <button
                type="button"
                className="rounded-full border border-[#191919] px-4 py-2 text-[#191919]"
                onClick={() => setPermissionModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-[#b80f0a] px-4 py-2 text-white hover:opacity-90"
                onClick={saveRolePermissions}
                disabled={permissionSaving}
              >
                {permissionSaving ? 'Saving...' : 'Save permissions'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showInviteModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Invite</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Add a teammate</h2>
              </div>
              <button
                type="button"
                className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                onClick={() => setShowInviteModal(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-[#4a4a4a]">Email</span>
                <input
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  placeholder="name@email.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-[#4a4a4a]">Role</span>
                <select
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  value={inviteRole}
                  onChange={(event) => {
                    setInviteRole(event.target.value)
                    setInviteTeamId('')
                  }}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {showTeamSelect && (
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Team (optional)</span>
                  <select
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={inviteTeamId}
                    onChange={(event) => setInviteTeamId(event.target.value)}
                  >
                    <option value="">No team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name || 'Team'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {inviteNotice && <p className="text-xs text-[#4a4a4a]">{inviteNotice}</p>}
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={handleSendInvite}
                  disabled={inviteSaving}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-white disabled:opacity-60"
                >
                  {inviteSaving ? 'Sending...' : 'Send invite'}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-[#191919]"
                  onClick={() => setShowInviteModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {assignModal && assignMember && (
        <div className="fixed inset-0 z-[620] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Team access</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">Assign team</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">{assignMember.full_name || 'Member'}</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                onClick={() => setAssignModal(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-[#4a4a4a]">Team</span>
                <select
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  value={assignTeamId}
                  onChange={(event) => setAssignTeamId(event.target.value)}
                >
                  <option value="">No team</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name || 'Team'}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={async () => {
                    await handleAssignTeam(assignMember.id, assignTeamId)
                    setAssignModal(null)
                    setAssignTeamId('')
                  }}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-white"
                >
                  Save
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-[#191919]"
                  onClick={() => {
                    setAssignTeamId('')
                    setAssignModal(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {previewModalOpen && (
        <div className="fixed inset-0 z-[620] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Preview</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">View as role</h2>
              </div>
              <button
                type="button"
                className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                onClick={() => setPreviewModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-[#4a4a4a]">Role</span>
                <select
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                  value={previewRole}
                  onChange={(event) => setPreviewRole(event.target.value)}
                >
                  <option value="">Select role</option>
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewModalOpen(false)
                    setToast(previewRole ? `Previewing as ${previewRole}` : 'Preview cleared')
                  }}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-white"
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-[#191919]"
                  onClick={() => {
                    setPreviewRole('')
                    setPreviewModalOpen(false)
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
