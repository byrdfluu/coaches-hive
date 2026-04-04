'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import { ORG_FEATURES, formatTierName, isOrgPlanActive, normalizeOrgTier, normalizeOrgStatus } from '@/lib/planRules'
import { ORG_SESSION_FEES } from '@/lib/orgPricing'
import { getOrgTypeConfig, normalizeOrgType } from '@/lib/orgTypeConfig'

type FeeRow = {
  id: string
  title: string
  amount_cents: number
  due_date?: string | null
  audience_type: string
  team_id?: string | null
  created_at?: string | null
}

type AssignmentRow = {
  id: string
  fee_id: string
  athlete_id: string
  status: string
  paid_at?: string | null
}

type TeamRow = {
  id: string
  name?: string | null
}

type TeamMemberRow = {
  team_id?: string | null
  athlete_id?: string | null
}

type AthleteRow = {
  id: string
  full_name: string | null
}

type CoachRow = {
  id: string
  full_name: string | null
}

type ReminderRow = {
  id: string
  fee_id: string
  assignment_id?: string | null
  reminder_type?: string | null
  created_at?: string | null
}

const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\\.00$/, '')}`
const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function OrgPaymentsPage() {
  const supabase = createClientComponentClient()
  const [fees, setFees] = useState<FeeRow[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [reminders, setReminders] = useState<ReminderRow[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([])
  const [athletes, setAthletes] = useState<AthleteRow[]>([])
  const [coaches, setCoaches] = useState<CoachRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [reminderPolicy, setReminderPolicy] = useState('off')
  const [reminderSaving, setReminderSaving] = useState(false)
  const [reminderNotice, setReminderNotice] = useState('')
  const [reminderSendingId, setReminderSendingId] = useState<string | null>(null)
  const [scheduleRunning, setScheduleRunning] = useState(false)
  const [scheduleNotice, setScheduleNotice] = useState('')
  const [orgTier, setOrgTier] = useState<'standard' | 'growth' | 'enterprise'>('standard')
  const [planStatus, setPlanStatus] = useState<'trialing' | 'active' | 'past_due' | 'canceled'>('trialing')
  const [orgType, setOrgType] = useState('organization')
  const [statusModal, setStatusModal] = useState<'paid' | 'unpaid' | 'waived' | null>(null)
  const [statusTeamModal, setStatusTeamModal] = useState<{
    status: 'paid' | 'unpaid' | 'waived'
    teamId: string
  } | null>(null)
  const [activeStatusTab, setActiveStatusTab] = useState<'all' | 'due' | 'overdue' | 'paid' | 'waived'>('all')
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('all')
  const [selectedAthleteFilter, setSelectedAthleteFilter] = useState('all')
  const [timeframeFilter, setTimeframeFilter] = useState('30')
  const [activeFeeId, setActiveFeeId] = useState<string | null>(null)
  const [bulkActionRunning, setBulkActionRunning] = useState(false)
  const [nowMs, setNowMs] = useState<number | null>(null)

  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('single')
  const [form, setForm] = useState({
    title: '',
    amount: '',
    due_date: '',
    audience_type: 'team',
    team_ids: [] as string[],
    coach_ids: [] as string[],
    athlete_ids: [] as string[],
  })
  const [saving, setSaving] = useState(false)
  const orgConfig = useMemo(() => getOrgTypeConfig(orgType), [orgType])
  const feeTemplates = useMemo(() => orgConfig.feeTemplates, [orgConfig.feeTemplates])

  useEffect(() => {
    setNowMs(Date.now())
  }, [])

  useEffect(() => {
    let active = true
    const loadData = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch('/api/org/charges')
      if (!response.ok) {
        setNotice('Unable to load fees.')
        setLoading(false)
        return
      }
      const payload = await response.json()
      if (!active) return
      setFees((payload.fees || []) as FeeRow[])
      setAssignments((payload.assignments || []) as AssignmentRow[])
      setReminders((payload.reminders || []) as ReminderRow[])

      const settingsResponse = await fetch('/api/org/settings')
      const settingsPayload = settingsResponse.ok ? await settingsResponse.json() : {}
      if (!active) return
      setReminderPolicy(settingsPayload.settings?.fee_reminder_policy || 'off')
      setOrgTier(normalizeOrgTier(settingsPayload.settings?.plan))
      setPlanStatus(normalizeOrgStatus(settingsPayload.settings?.plan_status))
      setOrgType(normalizeOrgType(settingsPayload.settings?.org_type))

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
      const [teamRows, memberRows] = await Promise.all([
        supabase
          .from('org_teams')
          .select('id, name')
          .eq('org_id', membershipRow.org_id),
        supabase
          .from('organization_memberships')
          .select('user_id, role')
          .eq('org_id', membershipRow.org_id),
      ])
      const teams = (teamRows.data || []) as Array<{ id: string; name?: string | null }>
      const members = (memberRows.data || []) as Array<{ user_id: string; role?: string | null }>

      const teamIds = teams.map((row) => row.id).filter(Boolean)
      const { data: teamMemberRows } = teamIds.length
        ? await supabase
            .from('org_team_members')
            .select('team_id, athlete_id')
            .in('team_id', teamIds)
        : { data: [] }
      const teamMembers = (teamMemberRows || []) as Array<{ team_id?: string | null; athlete_id?: string | null }>

      const athleteIds = members
        .filter((row) => row.role === 'athlete')
        .map((row) => row.user_id)

      const coachIds = members
        .filter((row) => ['coach', 'assistant_coach'].includes(row.role || ''))
        .map((row) => row.user_id)

      const profileIds = Array.from(new Set([...athleteIds, ...coachIds]))
      const { data: profileRows } = profileIds.length
        ? await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', profileIds)
        : { data: [] }
      const profiles = (profileRows || []) as Array<{ id: string; full_name?: string | null }>

      const profileMap = new Map(profiles.map((row) => [row.id, row] as const))
      const athleteProfiles = athleteIds.map((id) => profileMap.get(id)).filter(Boolean)
      const coachProfiles = coachIds.map((id) => profileMap.get(id)).filter(Boolean)

      if (!active) return
      setTeams((teamRows.data || []) as TeamRow[])
      setTeamMembers(teamMembers as TeamMemberRow[])
      setAthletes(athleteProfiles as AthleteRow[])
      setCoaches(coachProfiles as CoachRow[])
      setLoading(false)
    }
    loadData()
    return () => {
      active = false
    }
  }, [supabase])

  const assignmentStats = useMemo(() => {
    const paid = assignments.filter((row) => row.status === 'paid').length
    const unpaid = assignments.filter((row) => row.status === 'unpaid').length
    const waived = assignments.filter((row) => row.status === 'waived').length
    return { paid, unpaid, waived }
  }, [assignments])

  const remindersByFee = useMemo(() => {
    const map = new Map<string, ReminderRow[]>()
    reminders.forEach((reminder) => {
      const list = map.get(reminder.fee_id) || []
      list.push(reminder)
      map.set(reminder.fee_id, list)
    })
    map.forEach((list, key) => {
      list.sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
      })
      map.set(key, list)
    })
    return map
  }, [reminders])

  const feeById = useMemo(() => {
    const map = new Map<string, FeeRow>()
    fees.forEach((fee) => map.set(fee.id, fee))
    return map
  }, [fees])

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>()
    teams.forEach((team) => map.set(team.id, team.name || 'Team'))
    return map
  }, [teams])

  const athleteNameById = useMemo(() => {
    const map = new Map<string, string>()
    athletes.forEach((athlete) => map.set(athlete.id, athlete.full_name || 'Athlete'))
    return map
  }, [athletes])

  const teamIdsByAthlete = useMemo(() => {
    const map = new Map<string, string[]>()
    teamMembers.forEach((member) => {
      if (!member.athlete_id || !member.team_id) return
      const existing = map.get(member.athlete_id) || []
      existing.push(member.team_id)
      map.set(member.athlete_id, existing)
    })
    return map
  }, [teamMembers])

  const teamAssignmentsByStatus = useMemo(() => {
    const base = {
      paid: new Map<string, AssignmentRow[]>(),
      unpaid: new Map<string, AssignmentRow[]>(),
      waived: new Map<string, AssignmentRow[]>(),
    }
    assignments.forEach((assignment) => {
      if (assignment.status !== 'paid' && assignment.status !== 'unpaid' && assignment.status !== 'waived') return
      const teamIds = teamIdsByAthlete.get(assignment.athlete_id) || []
      const targetIds = teamIds.length ? teamIds : ['unassigned']
      targetIds.forEach((teamId) => {
        const list = base[assignment.status as 'paid' | 'unpaid' | 'waived'].get(teamId) || []
        list.push(assignment)
        base[assignment.status as 'paid' | 'unpaid' | 'waived'].set(teamId, list)
      })
    })
    return base
  }, [assignments, teamIdsByAthlete])

  const assignmentDetails = useMemo(() => {
    return assignments.map((assignment) => {
      const fee = feeById.get(assignment.fee_id)
      const athleteName = athleteNameById.get(assignment.athlete_id) || 'Member'
      const teamIds = teamIdsByAthlete.get(assignment.athlete_id) || []
      const teamNames = teamIds.length
        ? teamIds.map((teamId) => teamNameById.get(teamId) || 'Team')
        : ['Unassigned']
      return {
        assignment,
        fee,
        athleteName,
        teamIds,
        teamNames,
        amountCents: fee?.amount_cents || 0,
        dueDate: fee?.due_date || null,
        paidAt: assignment.paid_at || null,
      }
    })
  }, [assignments, feeById, athleteNameById, teamIdsByAthlete, teamNameById])

  const overdueAssignments = assignmentDetails.filter((row) => {
    if (nowMs === null) return false
    if (row.assignment.status !== 'unpaid') return false
    if (!row.dueDate) return false
    return new Date(row.dueDate).getTime() < nowMs
  })
  const dueAssignments = assignmentDetails.filter((row) => row.assignment.status === 'unpaid')
  const paidAssignments = assignmentDetails.filter((row) => row.assignment.status === 'paid')
  const waivedAssignments = assignmentDetails.filter((row) => row.assignment.status === 'waived')
  const upcomingAssignments = dueAssignments.filter((row) => {
    if (nowMs === null) return false
    if (!row.dueDate) return true
    return new Date(row.dueDate).getTime() >= nowMs
  })

  const totalDueCents = dueAssignments.reduce((sum, row) => sum + row.amountCents, 0)
  const totalPaidCents = paidAssignments.reduce((sum, row) => sum + row.amountCents, 0)
  const totalOverdueCents = overdueAssignments.reduce((sum, row) => sum + row.amountCents, 0)
  const totalUpcomingCents = upcomingAssignments.reduce((sum, row) => sum + row.amountCents, 0)

  const nextDue = useMemo(() => {
    const upcoming = dueAssignments
      .filter((row) => row.dueDate)
      .sort((a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime())
    return upcoming[0] || null
  }, [dueAssignments])

  const filteredAssignments = useMemo(() => {
    const timeframeDays = timeframeFilter === '30' ? 30 : timeframeFilter === '90' ? 90 : null
    return assignmentDetails.filter((row) => {
      if (selectedTeamFilter !== 'all') {
        if (!row.teamIds.includes(selectedTeamFilter)) return false
      }
      if (selectedAthleteFilter !== 'all') {
        if (row.assignment.athlete_id !== selectedAthleteFilter) return false
      }
      if (timeframeFilter === 'month') {
        if (nowMs === null) return false
        const targetDate = row.paidAt || row.dueDate
        if (!targetDate) return true
        const date = new Date(targetDate)
        const now = new Date(nowMs)
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
      }
      if (timeframeDays) {
        if (nowMs === null) return false
        const targetDate = row.paidAt || row.dueDate
        if (!targetDate) return true
        const date = new Date(targetDate)
        return nowMs - date.getTime() <= timeframeDays * 86400000
      }
      return true
    })
  }, [assignmentDetails, selectedTeamFilter, selectedAthleteFilter, timeframeFilter, nowMs])

  const statusFilteredAssignments = useMemo(() => {
    if (activeStatusTab === 'all') return filteredAssignments
    if (activeStatusTab === 'paid') return filteredAssignments.filter((row) => row.assignment.status === 'paid')
    if (activeStatusTab === 'waived') return filteredAssignments.filter((row) => row.assignment.status === 'waived')
    if (activeStatusTab === 'overdue') {
      return filteredAssignments.filter((row) => {
        if (nowMs === null) return false
        if (row.assignment.status !== 'unpaid') return false
        if (!row.dueDate) return false
        return new Date(row.dueDate).getTime() < nowMs
      })
    }
    return filteredAssignments.filter((row) => row.assignment.status === 'unpaid')
  }, [activeStatusTab, filteredAssignments, nowMs])

  const recentActivity = useMemo(() => {
    return paidAssignments
      .filter((row) => row.paidAt)
      .sort((a, b) => new Date(b.paidAt || 0).getTime() - new Date(a.paidAt || 0).getTime())
      .slice(0, 4)
  }, [paidAssignments])

  const onTimeRate = useMemo(() => {
    const total = paidAssignments.length + dueAssignments.length
    if (!total) return 0
    return Math.round((paidAssignments.length / total) * 100)
  }, [paidAssignments.length, dueAssignments.length])

  const onTimeTrend = onTimeRate >= 85 ? '+3%' : onTimeRate >= 70 ? '+1%' : '-4%'

  const statusTeams = useMemo(() => {
    if (!statusModal) return []
    const map = teamAssignmentsByStatus[statusModal]
    const rows = teams.map((team) => ({
      id: team.id,
      name: team.name || 'Team',
      count: map.get(team.id)?.length || 0,
    }))
    const unassignedCount = map.get('unassigned')?.length || 0
    if (unassignedCount) {
      rows.push({ id: 'unassigned', name: 'Unassigned', count: unassignedCount })
    }
    return rows
  }, [statusModal, teamAssignmentsByStatus, teams])

  const selectedStatusAssignments = useMemo(() => {
    if (!statusTeamModal) return []
    const map = teamAssignmentsByStatus[statusTeamModal.status]
    return map.get(statusTeamModal.teamId) || []
  }, [statusTeamModal, teamAssignmentsByStatus])

  const formatReminderDate = (value?: string | null) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const isMultiSelect = selectionMode === 'multiple'
  const orgFeatures = ORG_FEATURES[orgTier]
  const planActive = isOrgPlanActive(planStatus)
  const orgTierLabel = formatTierName(orgTier)
  const statusLabel = formatTierName(planStatus)
  const activeFee = activeFeeId ? feeById.get(activeFeeId) : null
  const activeFeeAssignments = activeFeeId
    ? assignments.filter((row) => row.fee_id === activeFeeId)
    : []
  const activeFeeReminders = activeFeeId ? remindersByFee.get(activeFeeId) || [] : []

  const handleCreateFee = async () => {
    if (!planActive) {
      setNotice('Activate billing to create fees.')
      return
    }
    if (!orgFeatures.feeCreation) {
      setNotice('Upgrade to Growth or Enterprise to create fees.')
      return
    }
    setSaving(true)
    setNotice('')
    const amountValue = Math.round(Number(form.amount) * 100)
    if (!form.title.trim() || !amountValue) {
      setNotice('Add a title and amount.')
      setSaving(false)
      return
    }
    const selectedTargets =
      form.audience_type === 'team'
        ? form.team_ids
        : form.audience_type === 'coach'
          ? form.coach_ids
          : form.athlete_ids
    if (['team', 'coach', 'athlete'].includes(form.audience_type) && selectedTargets.length === 0) {
      const audienceLabel = form.audience_type === 'team'
        ? orgConfig.portal.teamsLabel.toLowerCase()
        : form.audience_type
      setNotice(`Select at least one ${audienceLabel}.`)
      setSaving(false)
      return
    }
    const selectedTeams = form.audience_type === 'team' ? selectedTargets : []
    const selectedCoaches = form.audience_type === 'coach' ? selectedTargets : []
    const selectedAthletes = form.audience_type === 'athlete' ? selectedTargets : []
    const response = await fetch('/api/org/charges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim(),
        amount_cents: amountValue,
        due_date: form.due_date || null,
        audience_type: form.audience_type,
        team_id: selectedTeams.length === 1 ? selectedTeams[0] : null,
        athlete_id: selectedAthletes.length === 1 ? selectedAthletes[0] : null,
        team_ids: selectedTeams,
        coach_ids: selectedCoaches,
        athlete_ids: selectedAthletes,
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setNotice(payload?.error || 'Unable to create fee.')
      setSaving(false)
      return
    }

    setForm({ title: '', amount: '', due_date: '', audience_type: 'team', team_ids: [], coach_ids: [], athlete_ids: [] })
    setToast('Save complete')
    setSaving(false)
    const payload = await response.json()
    setFees((prev) => [payload.fee, ...prev])
    const refresh = await fetch('/api/org/charges')
    if (refresh.ok) {
      const data = await refresh.json()
      setAssignments((data.assignments || []) as AssignmentRow[])
    }
  }

  const applyAssignmentUpdates = (updates: AssignmentRow[]) => {
    if (updates.length === 0) return
    const updateMap = new Map(updates.map((row) => [row.id, row]))
    setAssignments((prev) => prev.map((row) => updateMap.get(row.id) || row))
  }

  const applyFeeTemplate = (title: string, amount: string, audience: 'team' | 'coach' | 'athlete') => {
    setForm((prev) => ({
      ...prev,
      title,
      amount,
      audience_type: audience,
      team_ids: [],
      coach_ids: [],
      athlete_ids: [],
    }))
  }

  const handleSaveReminderPolicy = async () => {
    if (!planActive) {
      setReminderNotice('Activate billing to enable automated reminders.')
      return
    }
    if (!orgFeatures.feeReminders) {
      setReminderNotice('Upgrade to Growth or Enterprise to enable automated reminders.')
      return
    }
    setReminderSaving(true)
    setReminderNotice('')
    const response = await fetch('/api/org/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fee_reminder_policy: reminderPolicy }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setReminderNotice(payload?.error || 'Unable to save reminder settings.')
    } else {
      setToast('Reminder settings saved')
    }
    setReminderSaving(false)
  }

  const handleRunScheduledReminders = async () => {
    if (!planActive) {
      setScheduleNotice('Activate billing to run scheduled reminders.')
      return
    }
    if (!orgFeatures.feeReminders) {
      setScheduleNotice('Upgrade to Growth or Enterprise to run scheduled reminders.')
      return
    }
    setScheduleRunning(true)
    setScheduleNotice('')
    const response = await fetch('/api/org/charges/reminders/schedule', { method: 'POST' })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setScheduleNotice(payload?.error || 'Unable to run scheduled reminders.')
      setScheduleRunning(false)
      return
    }
    const payload = await response.json().catch(() => null)
    if (payload?.reminders?.length) {
      setReminders((prev) => [...payload.reminders, ...prev])
    }
    setScheduleNotice(
      payload?.created ? `Scheduled ${payload.created} reminder(s).` : 'No reminders needed for today.'
    )
    setScheduleRunning(false)
  }

  const handleSendReminder = async (feeId: string) => {
    if (!planActive) {
      setNotice('Activate billing to send reminders.')
      return
    }
    if (!orgFeatures.manualReminders) {
      setNotice('Upgrade to Growth or Enterprise to send reminders.')
      return
    }
    setReminderSendingId(feeId)
    setNotice('')
    const response = await fetch('/api/org/charges/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fee_id: feeId, reminder_type: 'manual' }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setNotice(payload?.error || 'Unable to send reminders.')
      setReminderSendingId(null)
      return
    }
    const payload = await response.json()
    setReminders((prev) => [...(payload.reminders || []), ...prev])
    setToast(`Reminders sent to ${payload.sent || 0} members`)
    setReminderSendingId(null)
  }

  const handleBulkAction = async (action: 'reminders' | 'mark-paid' | 'mark-waived') => {
    if (bulkActionRunning) return
    setBulkActionRunning(true)
    if (action === 'reminders') {
      await handleRunScheduledReminders()
      setBulkActionRunning(false)
      return
    }
    const targetIds = statusFilteredAssignments
      .filter((row) => row.assignment.status === 'unpaid')
      .map((row) => row.assignment.id)
    if (targetIds.length === 0) {
      setToast('No unpaid items in this view')
      setBulkActionRunning(false)
      return
    }
    const response = await fetch('/api/org/charges/assignments/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignment_ids: targetIds,
        status: action === 'mark-paid' ? 'paid' : 'waived',
      }),
    })
    if (!response.ok) {
      setToast('Unable to update payments')
      setBulkActionRunning(false)
      return
    }
    const payload = await response.json().catch(() => null)
    applyAssignmentUpdates((payload?.assignments || []) as AssignmentRow[])
    setToast(action === 'mark-paid' ? 'Marked as paid' : 'Marked as waived')
    setBulkActionRunning(false)
  }

  const handleMarkSinglePaid = async (assignmentId: string) => {
    const response = await fetch(`/api/org/charges/assignments/${assignmentId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    })
    if (!response.ok) {
      setToast('Unable to mark as paid')
      return
    }
    const payload = await response.json().catch(() => null)
    if (payload?.assignment) {
      applyAssignmentUpdates([payload.assignment as AssignmentRow])
    }
    setToast('Marked as paid')
  }

  const handleMarkFeePaid = async (feeId: string) => {
    const response = await fetch(`/api/org/charges/fees/${feeId}/mark-paid`, { method: 'POST' })
    if (!response.ok) {
      setToast('Unable to mark fee as paid')
      return
    }
    const payload = await response.json().catch(() => null)
    applyAssignmentUpdates((payload?.assignments || []) as AssignmentRow[])
    setToast('Fee marked as paid')
  }

  const handleDownloadReceipt = async (assignmentId: string) => {
    const response = await fetch(`/api/org/charges/receipts/${assignmentId}`)
    if (!response.ok) {
      setToast('Receipt unavailable')
      return
    }
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `receipt-${assignmentId}.txt`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
    setToast('Receipt downloaded')
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Payments</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Create dues and track payment status.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="space-y-6">
            {notice ? <p className="text-sm text-[#b80f0a]">{notice}</p> : null}
            <div className="flex justify-start">
              <Link
                href="/org/settings#export-center"
                className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
              >
                Go to export center
              </Link>
            </div>

            <section className="grid gap-3 md:grid-cols-5">
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Total due</p>
                <p className="mt-2 text-xl font-semibold text-[#191919]">{formatCurrency(totalDueCents)}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Paid</p>
                <p className="mt-2 text-xl font-semibold text-[#191919]">{formatCurrency(totalPaidCents)}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Overdue</p>
                <p className="mt-2 text-xl font-semibold text-[#191919]">{formatCurrency(totalOverdueCents)}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Upcoming</p>
                <p className="mt-2 text-xl font-semibold text-[#191919]">{formatCurrency(totalUpcomingCents)}</p>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Payment method</p>
                <p className="mt-2 text-sm font-semibold text-[#191919]">
                  {planActive ? 'Connected' : 'Needs setup'}
                </p>
                <p className="mt-1 text-[11px] text-[#4a4a4a]">Billing status: {statusLabel}</p>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Next due</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">
                    {nextDue?.fee?.title || 'No upcoming dues'}
                  </p>
                  <p className="mt-1 text-sm text-[#4a4a4a]">
                    {nextDue
                      ? `${formatCurrency(nextDue.amountCents)} · Due ${formatDate(nextDue.dueDate)}`
                      : 'All caught up.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!nextDue?.fee?.id}
                    onClick={() => nextDue?.fee?.id && handleSendReminder(nextDue.fee.id)}
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] disabled:opacity-50"
                  >
                    Send reminder
                  </button>
                  <button
                    type="button"
                    disabled={!nextDue}
                    onClick={() => nextDue && handleMarkSinglePaid(nextDue.assignment.id)}
                    className="rounded-full bg-[#191919] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Mark paid
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#4a4a4a]">
                <span className="rounded-full border border-[#dcdcdc] px-3 py-1">
                  Collections health: {onTimeRate}% on-time
                </span>
                <span className="rounded-full border border-[#dcdcdc] px-3 py-1">
                  Trend vs last month: {onTimeTrend}
                </span>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <button
                type="button"
                onClick={() => setStatusModal('paid')}
                className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Paid</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{loading ? '...' : assignmentStats.paid}</p>
              </button>
              <button
                type="button"
                onClick={() => setStatusModal('unpaid')}
                className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Unpaid</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{loading ? '...' : assignmentStats.unpaid}</p>
              </button>
              <button
                type="button"
                onClick={() => setStatusModal('waived')}
                className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Waived</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{loading ? '...' : assignmentStats.waived}</p>
              </button>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#191919]">
                  {[
                    { id: 'all', label: 'All', count: assignmentDetails.length },
                    { id: 'due', label: 'Due', count: dueAssignments.length },
                    { id: 'overdue', label: 'Overdue', count: overdueAssignments.length },
                    { id: 'paid', label: 'Paid', count: paidAssignments.length },
                    { id: 'waived', label: 'Waived', count: waivedAssignments.length },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveStatusTab(tab.id as typeof activeStatusTab)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        activeStatusTab === tab.id
                          ? 'border-[#191919] bg-[#191919] text-white'
                          : 'border-[#dcdcdc] text-[#191919] hover:border-[#191919]'
                      }`}
                    >
                      {tab.label} <span className="ml-1 text-[11px] text-[#b80f0a]">{tab.count}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-xs text-[#191919]"
                    value={timeframeFilter}
                    onChange={(event) => setTimeframeFilter(event.target.value)}
                  >
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="month">This month</option>
                    <option value="all">All time</option>
                  </select>
                  <select
                    className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-xs text-[#191919]"
                    value={selectedTeamFilter}
                    onChange={(event) => setSelectedTeamFilter(event.target.value)}
                  >
                    <option value="all">All {orgConfig.portal.teamsLabel.toLowerCase()}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name || 'Team'}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-xs text-[#191919]"
                    value={selectedAthleteFilter}
                    onChange={(event) => setSelectedAthleteFilter(event.target.value)}
                  >
                    <option value="all">All athletes</option>
                    {athletes.map((athlete) => (
                      <option key={athlete.id} value={athlete.id}>
                        {athlete.full_name || 'Athlete'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#4a4a4a]">
                <p>Showing {statusFilteredAssignments.length} items.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                    onClick={() => handleBulkAction('reminders')}
                    disabled={bulkActionRunning}
                  >
                    Send reminders
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                    onClick={() => handleBulkAction('mark-paid')}
                    disabled={bulkActionRunning}
                  >
                    Mark paid
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                    onClick={() => handleBulkAction('mark-waived')}
                    disabled={bulkActionRunning}
                  >
                    Mark waived
                  </button>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-[#191919]">Payment timeline</h2>
                  <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs text-[#4a4a4a]">
                    {statusFilteredAssignments.length} items
                  </span>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {loading ? (
                    <LoadingState label="Loading payments..." />
                  ) : statusFilteredAssignments.length === 0 ? (
                    <EmptyState title="No payments in this view." description="Try adjusting the filters or timeframe." />
                  ) : (
                    statusFilteredAssignments.slice(0, 6).map((row) => (
                      <div
                        key={row.assignment.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                      >
                        <div>
                          <p className="font-semibold text-[#191919]">{row.athleteName}</p>
                          <p className="text-xs text-[#4a4a4a]">
                            {row.fee?.title || 'Fee'} · {row.teamNames.join(', ')}
                          </p>
                        </div>
                        <div className="text-xs text-[#4a4a4a]">
                          {row.assignment.status === 'paid' ? 'Paid' : row.assignment.status === 'waived' ? 'Waived' : 'Due'} ·{' '}
                          {formatDate(row.paidAt || row.dueDate)}
                        </div>
                        <div className="text-sm font-semibold text-[#191919]">
                          {formatCurrency(row.amountCents)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-[#191919]">Recent activity</h2>
                  <span className="text-xs text-[#4a4a4a]">Receipts + exports</span>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {recentActivity.length === 0 ? (
                    <EmptyState title="No payments yet." description="Receipts will appear once payments are recorded." />
                  ) : (
                    recentActivity.map((row) => (
                      <div
                        key={row.assignment.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3"
                      >
                        <div>
                          <p className="font-semibold text-[#191919]">{row.fee?.title || 'Fee'}</p>
                          <p className="text-xs text-[#4a4a4a]">
                            {row.athleteName} · {formatDate(row.paidAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[#191919]">{formatCurrency(row.amountCents)}</span>
                          <button
                            type="button"
                            onClick={() => handleDownloadReceipt(row.assignment.id)}
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                          >
                            Receipt
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Automated fee reminders</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Send scheduled nudges before or after due dates.</p>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] disabled:opacity-60"
                  onClick={handleRunScheduledReminders}
                  disabled={scheduleRunning || !orgFeatures.feeReminders || !planActive}
                >
                  {scheduleRunning ? 'Running...' : 'Run scheduled reminders'}
                </button>
              </div>
              {!planActive && (
                <div className="mt-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#4a4a4a]">
                  Billing status: {statusLabel}. Activate billing to use reminders.
                </div>
              )}
              {planActive && !orgFeatures.feeReminders && (
                <div className="mt-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#4a4a4a]">
                  Upgrade to Growth or Enterprise to enable automated reminders. Current plan: {orgTierLabel}.
                </div>
              )}
              <div className="mt-4 grid gap-4 text-sm md:grid-cols-[1fr_auto]">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Reminder policy</span>
                  <select
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={reminderPolicy}
                    onChange={(event) => setReminderPolicy(event.target.value)}
                    disabled={!orgFeatures.feeReminders || !planActive}
                  >
                    <option value="off">Off</option>
                    <option value="3-days-before">3 days before due date</option>
                    <option value="7-days-before">7 days before due date</option>
                    <option value="due-date">On due date</option>
                    <option value="7-days-after">7 days after due date</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white disabled:bg-[#b80f0a] disabled:text-white disabled:opacity-100"
                    onClick={handleSaveReminderPolicy}
                    disabled={reminderSaving || !orgFeatures.feeReminders || !planActive}
                  >
                    {reminderSaving ? 'Saving...' : 'Save policy'}
                  </button>
                </div>
              </div>
              {reminderNotice ? <p className="mt-2 text-xs text-[#4a4a4a]">{reminderNotice}</p> : null}
              {scheduleNotice ? <p className="mt-2 text-xs text-[#4a4a4a]">{scheduleNotice}</p> : null}
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Create fee</h2>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Platform fee: {ORG_SESSION_FEES[orgTier]}% is applied to each payment.</p>
                </div>
                <button
                  className="inline-flex self-start whitespace-nowrap rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:bg-[#b80f0a] disabled:text-white disabled:cursor-not-allowed"
                  onClick={handleCreateFee}
                  disabled={saving || !planActive || !orgFeatures.feeCreation}
                >
                  {saving ? 'Saving...' : 'Create fee'}
                </button>
              </div>
              {!planActive ? (
                <div className="mt-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#4a4a4a]">
                  Billing status: {statusLabel}. Activate billing to create fees.
                </div>
              ) : !orgFeatures.feeCreation ? (
                <div className="mt-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#4a4a4a]">
                  Upgrade to Growth or Enterprise to create fees. Current plan: {orgTierLabel}.
                </div>
              ) : null}
              {feeTemplates.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-xs text-[#4a4a4a]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">Quick templates</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {feeTemplates.map((template) => (
                      <button
                        key={template.title}
                        type="button"
                        className="rounded-full border border-[#191919] px-3 py-1 text-[11px] font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                        onClick={() => applyFeeTemplate(template.title, template.amount, template.audience)}
                      >
                        {template.title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Title</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={form.title}
                    onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Annual dues, Uniform fee, Tournament fee"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Amount</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={form.amount}
                    onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                    placeholder="150"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Due date</span>
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={form.due_date}
                    onChange={(event) => setForm((prev) => ({ ...prev, due_date: event.target.value }))}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Audience</span>
                  <select
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={form.audience_type}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        audience_type: event.target.value,
                        team_ids: [],
                        coach_ids: [],
                        athlete_ids: [],
                      }))
                    }
                  >
                    <option value="team">{orgConfig.portal.teamsLabel}</option>
                    <option value="coach">Coach</option>
                    <option value="athlete">Athlete</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Selection</span>
                  <select
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={selectionMode}
                    onChange={(event) => setSelectionMode(event.target.value === 'multiple' ? 'multiple' : 'single')}
                  >
                    <option value="single">Single</option>
                    <option value="multiple">Multiple</option>
                  </select>
                  {isMultiSelect ? (
                    <span className="text-[11px] text-[#4a4a4a]">Hold Ctrl/Cmd to select multiple.</span>
                  ) : null}
                </label>
                {form.audience_type === 'team' && (
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-xs font-semibold text-[#4a4a4a]">{orgConfig.portal.teamsLabel}</span>
                    <select
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      multiple={isMultiSelect}
                      size={isMultiSelect ? 6 : 1}
                      value={isMultiSelect ? form.team_ids : form.team_ids[0] || ''}
                      onChange={(event) => {
                        const values = Array.from(event.target.selectedOptions)
                          .map((option) => option.value)
                          .filter(Boolean)
                        setForm((prev) => ({
                          ...prev,
                          team_ids: isMultiSelect ? values : values.slice(0, 1),
                        }))
                      }}
                    >
                      {!isMultiSelect ? <option value="">Select {orgConfig.portal.teamsLabel.toLowerCase()}</option> : null}
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name || 'Team'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {form.audience_type === 'coach' && (
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Coaches</span>
                    <select
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      multiple={isMultiSelect}
                      size={isMultiSelect ? 6 : 1}
                      value={isMultiSelect ? form.coach_ids : form.coach_ids[0] || ''}
                      onChange={(event) => {
                        const values = Array.from(event.target.selectedOptions)
                          .map((option) => option.value)
                          .filter(Boolean)
                        setForm((prev) => ({
                          ...prev,
                          coach_ids: isMultiSelect ? values : values.slice(0, 1),
                        }))
                      }}
                    >
                      {!isMultiSelect ? <option value="">Select coach</option> : null}
                      {coaches.map((coach) => (
                        <option key={coach.id} value={coach.id}>
                          {coach.full_name || 'Coach'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {form.audience_type === 'athlete' && (
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Athletes</span>
                    <select
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      multiple={isMultiSelect}
                      size={isMultiSelect ? 6 : 1}
                      value={isMultiSelect ? form.athlete_ids : form.athlete_ids[0] || ''}
                      onChange={(event) => {
                        const values = Array.from(event.target.selectedOptions)
                          .map((option) => option.value)
                          .filter(Boolean)
                        setForm((prev) => ({
                          ...prev,
                          athlete_ids: isMultiSelect ? values : values.slice(0, 1),
                        }))
                      }}
                    >
                      {!isMultiSelect ? <option value="">Select athlete</option> : null}
                      {athletes.map((athlete) => (
                        <option key={athlete.id} value={athlete.id}>
                          {athlete.full_name || 'Athlete'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Fees</h2>
              <div className="mt-4 space-y-3 text-sm">
                {loading ? (
                  <LoadingState label="Loading fees..." />
                ) : fees.length === 0 ? (
                  <EmptyState title="No fees created yet." description="Create a fee to start collecting payments." />
                ) : (
                  fees.map((fee) => {
                    const feeAssignments = assignments.filter((row) => row.fee_id === fee.id)
                    const paid = feeAssignments.filter((row) => row.status === 'paid').length
                    const unpaid = feeAssignments.filter((row) => row.status === 'unpaid').length
                    const feeReminders = remindersByFee.get(fee.id) || []
                    const lastReminder = feeReminders[0]?.created_at
                    return (
                      <div
                        key={fee.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveFeeId(fee.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') setActiveFeeId(fee.id)
                        }}
                        className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 transition hover:border-[#b80f0a]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[#191919]">{fee.title}</p>
                            <p className="text-xs text-[#4a4a4a]">
                              {formatCurrency(fee.amount_cents)} · Due {fee.due_date || 'TBD'}
                            </p>
                            <p className="mt-1 text-xs text-[#4a4a4a]">
                              Reminders sent: {feeReminders.length} · Last: {formatReminderDate(lastReminder)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-[#4a4a4a]">
                            <span>Paid: {paid} · Unpaid: {unpaid}</span>
                            <button
                              type="button"
                              className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] disabled:opacity-60"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleSendReminder(fee.id)
                              }}
                              disabled={reminderSendingId === fee.id || !orgFeatures.manualReminders || !planActive}
                            >
                              {reminderSendingId === fee.id ? 'Sending...' : 'Send reminder'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
      {statusModal && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Payments</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
                  {statusModal.charAt(0).toUpperCase() + statusModal.slice(1)} by team
                </h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">Select a team to review payment detail.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStatusModal(null)
                  setStatusTeamModal(null)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {statusTeams.length === 0 ? (
                <EmptyState title="No payments found." description="Payments will appear once fees are assigned." />
              ) : (
                statusTeams.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => setStatusTeamModal({ status: statusModal, teamId: team.id })}
                    className="flex w-full items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-left text-sm transition hover:border-[#b80f0a]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#191919]">{team.name}</p>
                      <p className="text-xs text-[#4a4a4a]">{team.count} {team.count === 1 ? 'member' : 'members'}</p>
                    </div>
                    <span className="text-xs font-semibold text-[#b80f0a]">View</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {statusTeamModal && (
        <div className="fixed inset-0 z-[750] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-3xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Payment detail</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">
                  {statusTeamModal.teamId === 'unassigned'
                    ? 'Unassigned'
                    : teamNameById.get(statusTeamModal.teamId) || 'Team'} · {statusTeamModal.status}
                </h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">{selectedStatusAssignments.length} items</p>
              </div>
              <button
                type="button"
                onClick={() => setStatusTeamModal(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4">
              <div className="grid grid-cols-[1.2fr_1.4fr_0.8fr_0.6fr] gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">
                <span>Member</span>
                <span>Item</span>
                <span>Date</span>
                <span>Amount</span>
              </div>
              <div className="mt-2 space-y-2">
                {selectedStatusAssignments.length === 0 ? (
                  <EmptyState title="No payments recorded." description="Payment assignments will appear here." />
                ) : (
                  selectedStatusAssignments.map((assignment) => {
                    const fee = feeById.get(assignment.fee_id)
                    const dateValue =
                      statusTeamModal.status === 'paid' ? assignment.paid_at || fee?.due_date : fee?.due_date
                    return (
                      <div
                        key={assignment.id}
                        className="grid grid-cols-[1.2fr_1.4fr_0.8fr_0.6fr] items-center gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm"
                      >
                        <span className="font-semibold text-[#191919]">
                          {athleteNameById.get(assignment.athlete_id) || 'Member'}
                        </span>
                        <span className="text-[#4a4a4a]">{fee?.title || 'Fee'}</span>
                        <span className="text-[#4a4a4a]">{formatDate(dateValue)}</span>
                        <span className="font-semibold text-[#191919]">
                          {fee ? formatCurrency(fee.amount_cents) : '—'}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                onClick={() => setStatusTeamModal(null)}
              >
                Back to teams
              </button>
            </div>
          </div>
        </div>
      )}
      {activeFee && (
        <div
          className="fixed inset-0 z-[760] flex justify-end bg-black/40"
          onClick={() => setActiveFeeId(null)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col border-l border-[#191919] bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e5e5e5] p-6">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Fee details</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">{activeFee.title}</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">
                  {formatCurrency(activeFee.amount_cents)} · Due {formatDate(activeFee.due_date)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveFeeId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid gap-3 text-sm">
                <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Status</p>
                  <p className="mt-2 text-sm text-[#191919]">
                    Paid: {activeFeeAssignments.filter((row) => row.status === 'paid').length} · Unpaid:{' '}
                    {activeFeeAssignments.filter((row) => row.status === 'unpaid').length} · Waived:{' '}
                    {activeFeeAssignments.filter((row) => row.status === 'waived').length}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Notes</p>
                  <p className="mt-2 text-sm text-[#4a4a4a]">
                    Add internal notes about this fee, refunds, or exceptions.
                  </p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Reminder history</p>
                  {activeFeeReminders.length === 0 ? (
                    <p className="mt-2 text-sm text-[#4a4a4a]">No reminders sent yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-sm text-[#4a4a4a]">
                      {activeFeeReminders.slice(0, 4).map((reminder) => (
                        <li key={reminder.id}>
                          {reminder.reminder_type || 'Reminder'} · {formatReminderDate(reminder.created_at)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Receipts</p>
                  {activeFeeAssignments.filter((row) => row.status === 'paid').length === 0 ? (
                    <p className="mt-2 text-sm text-[#4a4a4a]">No receipts available yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {activeFeeAssignments
                        .filter((row) => row.status === 'paid')
                        .slice(0, 4)
                        .map((row) => (
                          <div key={row.id} className="flex items-center justify-between gap-2 text-sm">
                            <span>{athleteNameById.get(row.athlete_id) || 'Member'}</span>
                          <button
                            type="button"
                            onClick={() => handleDownloadReceipt(row.id)}
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                          >
                            Download
                          </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="border-t border-[#e5e5e5] p-6">
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <button
                  type="button"
                  className="rounded-full border border-[#191919] px-4 py-2 text-[#191919]"
                  onClick={() => handleSendReminder(activeFee.id)}
                >
                  Send reminder
                </button>
                <button
                  type="button"
                  className="rounded-full bg-[#191919] px-4 py-2 text-white"
                  onClick={() => handleMarkFeePaid(activeFee.id)}
                >
                  Mark paid
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
