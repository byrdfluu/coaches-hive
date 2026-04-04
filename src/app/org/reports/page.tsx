'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import { ORG_FEATURES, formatTierName, isOrgPlanActive, normalizeOrgTier, normalizeOrgStatus } from '@/lib/planRules'

type SessionRow = {
  id: string
  start_time?: string | null
  end_time?: string | null
  status?: string | null
  session_type?: string | null
  attendance_status?: string | null
  coach_id?: string | null
  athlete_id?: string | null
  duration_minutes?: number | null
}
type OrderRow = {
  id?: string
  product_id?: string | null
  coach_id?: string | null
  athlete_id?: string | null
  amount?: number | string | null
  total?: number | string | null
  price?: number | string | null
  created_at?: string | null
}
type FeeAssignmentRow = {
  status?: string | null
  fee_id?: string | null
  paid_at?: string | null
  created_at?: string | null
  athlete_id?: string | null
}
type OrgFeeRow = {
  id: string
  amount_cents?: number | null
  title?: string | null
  due_date?: string | null
  created_at?: string | null
}
type TeamRow = { id: string; name?: string | null; coach_id?: string | null }
type TeamMemberRow = { team_id?: string | null; athlete_id?: string | null }
type ProfileRow = { id: string; full_name?: string | null; email?: string | null; role?: string | null }
type RevenueMonth = {
  key: string
  label: string
  total: number
  ordersTotal: number
  ordersCount: number
  feesTotal: number
  feesCount: number
}
type RetentionCohort = {
  key: string
  label: string
  retained: number
  total: number
}

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const formatCurrency = (value: number) => `$${value.toFixed(0)}`
const formatMonthLabel = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}
const getMonthKey = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 7)
}
const formatSessionDateTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const buildSparklinePoints = (values: number[], width = 60, height = 20) => {
  if (values.length === 0) return ''
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
      const y = height - ((value - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}
const ATHLETE_LEVEL_OPTIONS = [
  'U8',
  'U10',
  'U12',
  'U14',
  'U16',
  'U18',
  'Freshman',
  'Sophomore',
  'Junior',
  'Senior',
  'JV',
  'Varsity',
  'College',
  'Adult',
  'Masters',
]
export default function OrgReportsPage() {
  const supabase = createClientComponentClient()
  const [sessionCount, setSessionCount] = useState(0)
  const [sessionRows, setSessionRows] = useState<SessionRow[]>([])
  const [orderRows, setOrderRows] = useState<OrderRow[]>([])
  const [productsById, setProductsById] = useState<Record<string, { title: string }>>({})
  const [coachCount, setCoachCount] = useState(0)
  const [athleteCount, setAthleteCount] = useState(0)
  const [revenue, setRevenue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [feePaid, setFeePaid] = useState(0)
  const [feeUnpaid, setFeeUnpaid] = useState(0)
  const [attendanceRate, setAttendanceRate] = useState(0)
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({})
  const [orgFeeRows, setOrgFeeRows] = useState<OrgFeeRow[]>([])
  const [feeAssignments, setFeeAssignments] = useState<FeeAssignmentRow[]>([])
  const [revenueByMonth, setRevenueByMonth] = useState<RevenueMonth[]>([])
  const [reportRangePreset, setReportRangePreset] = useState('30d')
  const [reportRangeStart, setReportRangeStart] = useState('')
  const [reportRangeEnd, setReportRangeEnd] = useState('')
  const [compareEnabled, setCompareEnabled] = useState(true)
  const [cohortTeamFilter, setCohortTeamFilter] = useState('all')
  const [cohortCoachFilter, setCohortCoachFilter] = useState('all')
  const [cohortProgramFilter, setCohortProgramFilter] = useState('all')
  const [cohortSeasonFilter, setCohortSeasonFilter] = useState('current')
  const [explainMetric, setExplainMetric] = useState<{ title: string; body: string } | null>(null)
  const [showCoachesModal, setShowCoachesModal] = useState(false)
  const [showAthletesModal, setShowAthletesModal] = useState(false)
  const [activeCoachTeam, setActiveCoachTeam] = useState<TeamRow | null>(null)
  const [activeAthleteTeam, setActiveAthleteTeam] = useState<TeamRow | null>(null)
  const [showRevenueModal, setShowRevenueModal] = useState(false)
  const [activeRevenueMonth, setActiveRevenueMonth] = useState<RevenueMonth | null>(null)
  const [showFeesPaidModal, setShowFeesPaidModal] = useState(false)
  const [showFeesUnpaidModal, setShowFeesUnpaidModal] = useState(false)
  const [activeFeeTeam, setActiveFeeTeam] = useState<TeamRow | null>(null)
  const [activeFeeStatus, setActiveFeeStatus] = useState<'paid' | 'unpaid' | null>(null)
  const [feeSearch, setFeeSearch] = useState('')
  const [feeTypeFilter, setFeeTypeFilter] = useState('all')
  const [feeDueMonthFilter, setFeeDueMonthFilter] = useState('all')
  const [feeStatusFilter, setFeeStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all')
  const [feeSort, setFeeSort] = useState('amount-desc')
  const [feeTeamFilter, setFeeTeamFilter] = useState('all')
  const [expandedFeeGroups, setExpandedFeeGroups] = useState<Record<string, boolean>>({})
  const [showSessionsModal, setShowSessionsModal] = useState(false)
  const [showRetentionModal, setShowRetentionModal] = useState(false)
  const [retentionTimeframe, setRetentionTimeframe] = useState('6m')
  const [retentionTeamFilter, setRetentionTeamFilter] = useState('all')
  const [retentionLevelFilter, setRetentionLevelFilter] = useState('all')
  const [showAttendanceModal, setShowAttendanceModal] = useState(false)
  const [attendanceTimeframe, setAttendanceTimeframe] = useState('6m')
  const [attendanceTeamFilter, setAttendanceTeamFilter] = useState('all')
  const [attendanceCoachFilter, setAttendanceCoachFilter] = useState('all')
  const [attendanceSessionTypeFilter, setAttendanceSessionTypeFilter] = useState('all')
  const [revenueTimeframe, setRevenueTimeframe] = useState('6m')
  const [revenueSourceFilter, setRevenueSourceFilter] = useState('all')
  const [revenueTeamFilter, setRevenueTeamFilter] = useState('all')
  const [showRevenueDetailsDrawer, setShowRevenueDetailsDrawer] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleNotice, setScheduleNotice] = useState('')
  const [scheduleForm, setScheduleForm] = useState({
    enabled: false,
    cadence: 'weekly',
    dayOfWeek: '1',
    dayOfMonth: '1',
    timeOfDay: '09:00',
    recipients: '',
  })
  const [athleteSearch, setAthleteSearch] = useState('')
  const [athleteTeamFilter, setAthleteTeamFilter] = useState('all')
  const [athleteStatusFilter, setAthleteStatusFilter] = useState('all')
  const [athleteYearFilter, setAthleteYearFilter] = useState('all')
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({})
  const hasLiveData = sessionCount > 0
    || coachCount > 0
    || athleteCount > 0
    || revenue > 0
    || feePaid > 0
    || feeUnpaid > 0
  const sessionsForDisplay = sessionRows
  const ordersForDisplay = orderRows
  const teamsForDisplay = teams
  const teamMembersForDisplay = teamMembers
  const profilesForDisplay = profiles
  const athleteYearById = useMemo<Record<string, string>>(() => ({}), [])
  const coachesForFilters = useMemo(() => {
    return Object.values(profilesForDisplay)
      .filter((profile) => ['coach', 'assistant_coach'].includes(String(profile?.role || '').toLowerCase()))
      .sort((a, b) => {
        const aLabel = a.full_name || a.email || ''
        const bLabel = b.full_name || b.email || ''
        return aLabel.localeCompare(bLabel)
      })
  }, [profilesForDisplay])
  const orgFeesForDisplay = orgFeeRows
  const feeAssignmentsForDisplay = feeAssignments
  const revenueByMonthForDisplay = revenueByMonth
  const productsByIdForDisplay = useMemo(() => productsById, [productsById])
  const teamNameById = useMemo(
    () => new Map(teamsForDisplay.map((team) => [team.id, team.name || 'Team'])),
    [teamsForDisplay],
  )
  const programOptions = useMemo(() => {
    const set = new Set<string>()
    sessionsForDisplay.forEach((session) => {
      const label = String(session.session_type || '').trim()
      if (label) set.add(label)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [sessionsForDisplay])
  const athletesByTeam = useMemo(() => {
    const map = new Map<string, string[]>()
    teamMembersForDisplay.forEach((member) => {
      if (!member.team_id || !member.athlete_id) return
      const profile = profilesForDisplay[member.athlete_id]
      if (String(profile?.role || '').toLowerCase() !== 'athlete') return
      const list = map.get(member.team_id) || []
      list.push(member.athlete_id)
      map.set(member.team_id, list)
    })
    return map
  }, [profilesForDisplay, teamMembersForDisplay])

  const assistantCoachesByTeam = useMemo(() => {
    const map = new Map<string, ProfileRow[]>()
    teamMembersForDisplay.forEach((member) => {
      if (!member.team_id || !member.athlete_id) return
      const profile = profilesForDisplay[member.athlete_id]
      if (String(profile?.role || '').toLowerCase() !== 'assistant_coach') return
      const list = map.get(member.team_id) || []
      list.push(profile)
      map.set(member.team_id, list)
    })
    return map
  }, [profilesForDisplay, teamMembersForDisplay])

  const coachByTeam = useMemo(() => {
    const map = new Map<string, ProfileRow | null>()
    teamsForDisplay.forEach((team) => {
      map.set(team.id, team.coach_id ? profilesForDisplay[team.coach_id] || null : null)
    })
    return map
  }, [profilesForDisplay, teamsForDisplay])
  const coachTeamsById = useMemo(() => {
    const map = new Map<string, TeamRow[]>()
    const addTeam = (coachId: string, team: TeamRow) => {
      const list = map.get(coachId) || []
      if (!list.find((item) => item.id === team.id)) {
        list.push(team)
      }
      map.set(coachId, list)
    }
    teamsForDisplay.forEach((team) => {
      if (team.coach_id) addTeam(team.coach_id, team)
    })
    teamsForDisplay.forEach((team) => {
      const assistants = assistantCoachesByTeam.get(team.id) || []
      assistants.forEach((assistant) => addTeam(assistant.id, team))
    })
    return map
  }, [assistantCoachesByTeam, teamsForDisplay])
  const assigneeTeams = useMemo(() => {
    const map = new Map<string, string[]>()
    const addToMap = (assigneeId: string, teamId: string) => {
      const list = map.get(assigneeId) || []
      if (!list.includes(teamId)) list.push(teamId)
      map.set(assigneeId, list)
    }
    teamsForDisplay.forEach((team) => {
      if (team.coach_id) addToMap(team.coach_id, team.id)
    })
    teamMembersForDisplay.forEach((member) => {
      if (!member.team_id || !member.athlete_id) return
      addToMap(member.athlete_id, member.team_id)
    })
    return map
  }, [teamsForDisplay, teamMembersForDisplay])
  const feeById = useMemo(() => new Map(orgFeesForDisplay.map((fee) => [fee.id, fee])), [orgFeesForDisplay])
  const feeAssignmentsByStatus = useMemo(() => {
    const paid = new Map<string, FeeAssignmentRow[]>()
    const unpaid = new Map<string, FeeAssignmentRow[]>()
    const addToMap = (map: Map<string, FeeAssignmentRow[]>, teamId: string, row: FeeAssignmentRow) => {
      const list = map.get(teamId) || []
      list.push(row)
      map.set(teamId, list)
    }
    feeAssignmentsForDisplay.forEach((assignment) => {
      const status = assignment.status
      if (status !== 'paid' && status !== 'unpaid') return
      const map = status === 'paid' ? paid : unpaid
      const assigneeId = assignment.athlete_id
      const teamIds = assigneeId ? assigneeTeams.get(assigneeId) || [] : []
      if (teamIds.length === 0) {
        addToMap(map, 'unassigned', assignment)
        return
      }
      teamIds.forEach((teamId) => addToMap(map, teamId, assignment))
    })
    return { paid, unpaid }
  }, [assigneeTeams, feeAssignmentsForDisplay])
  const feeAssignmentsWithMeta = useMemo(() => {
    return feeAssignmentsForDisplay.map((assignment) => {
      const fee = assignment.fee_id ? feeById.get(assignment.fee_id) : null
      const feeTitle = fee?.title || 'Fee'
      const feeAmount = fee ? Number(fee.amount_cents || 0) / 100 : 0
      const dueDateValue = fee?.due_date || assignment.created_at || null
      const dueMonthKey = getMonthKey(dueDateValue)
      const assignee = assignment.athlete_id ? profilesForDisplay[assignment.athlete_id] : undefined
      const assigneeName = assignee?.full_name || assignee?.email || 'Member'
      const teamIds = assignment.athlete_id ? assigneeTeams.get(assignment.athlete_id) || [] : []
      const resolvedTeams = teamIds.length > 0 ? teamIds : ['unassigned']
      return {
        assignment,
        fee,
        feeTitle,
        feeAmount,
        dueDateValue,
        dueMonthKey,
        assignee,
        assigneeName,
        teamIds: resolvedTeams,
      }
    })
  }, [assigneeTeams, feeAssignmentsForDisplay, feeById, profilesForDisplay])
  const feeTypeOptions = useMemo(() => {
    const set = new Set<string>()
    feeAssignmentsWithMeta.forEach((item) => set.add(item.feeTitle))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [feeAssignmentsWithMeta])
  const feeDueMonthOptions = useMemo(() => {
    const map = new Map<string, string>()
    feeAssignmentsWithMeta.forEach((item) => {
      if (!item.dueMonthKey || !item.dueDateValue) return
      map.set(item.dueMonthKey, formatMonthLabel(item.dueDateValue))
    })
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, label]) => ({ key, label }))
  }, [feeAssignmentsWithMeta])
  const filteredFeeAssignments = useMemo(() => {
    const searchValue = feeSearch.trim().toLowerCase()
    const matchesStatus = (status?: string | null) => {
      if (feeStatusFilter === 'all') return true
      return String(status || '').toLowerCase() === feeStatusFilter
    }
    const matchesTeam = (teamIds: string[]) => {
      if (feeTeamFilter === 'all') return true
      return teamIds.includes(feeTeamFilter)
    }
    const matchesDueMonth = (dueMonthKey?: string | null) => {
      if (feeDueMonthFilter === 'all') return true
      return dueMonthKey === feeDueMonthFilter
    }
    const matchesFeeType = (feeTitle: string) => {
      if (feeTypeFilter === 'all') return true
      return feeTitle === feeTypeFilter
    }
    const filtered = feeAssignmentsWithMeta.filter((item) => {
      if (!matchesStatus(item.assignment.status)) return false
      if (!matchesTeam(item.teamIds)) return false
      if (!matchesDueMonth(item.dueMonthKey)) return false
      if (!matchesFeeType(item.feeTitle)) return false
      if (searchValue) {
        const haystack = `${item.assigneeName} ${item.assignee?.email || ''} ${item.feeTitle}`.toLowerCase()
        if (!haystack.includes(searchValue)) return false
      }
      return true
    })
    const sorted = [...filtered].sort((a, b) => {
      if (feeSort === 'amount-desc') return b.feeAmount - a.feeAmount
      if (feeSort === 'amount-asc') return a.feeAmount - b.feeAmount
      if (feeSort === 'due-date') {
        const aDate = a.dueDateValue ? new Date(a.dueDateValue).getTime() : 0
        const bDate = b.dueDateValue ? new Date(b.dueDateValue).getTime() : 0
        return aDate - bDate
      }
      if (feeSort === 'name') return a.assigneeName.localeCompare(b.assigneeName)
      if (feeSort === 'fee') return a.feeTitle.localeCompare(b.feeTitle)
      return 0
    })
    return sorted
  }, [
    feeAssignmentsWithMeta,
    feeDueMonthFilter,
    feeSearch,
    feeSort,
    feeStatusFilter,
    feeTeamFilter,
    feeTypeFilter,
  ])
  const feeSummary = useMemo(() => {
    const count = filteredFeeAssignments.length
    const total = filteredFeeAssignments.reduce((sum, item) => sum + item.feeAmount, 0)
    const avg = count ? total / count : 0
    const lastPayment = filteredFeeAssignments.reduce<string | null>((latest, item) => {
      if (String(item.assignment.status || '').toLowerCase() !== 'paid') return latest
      if (!item.assignment.paid_at) return latest
      if (!latest) return item.assignment.paid_at
      return new Date(item.assignment.paid_at) > new Date(latest) ? item.assignment.paid_at : latest
    }, null)
    return { count, total, avg, lastPayment }
  }, [filteredFeeAssignments])
  const feeGroups = useMemo(() => {
    const map = new Map<string, {
      key: string
      title: string
      total: number
      count: number
      dueDate?: number
      dueLabel?: string
      items: typeof filteredFeeAssignments
    }>()
    filteredFeeAssignments.forEach((item) => {
      const key = item.fee?.id || item.feeTitle
      const entry = map.get(key) || {
        key,
        title: item.feeTitle,
        total: 0,
        count: 0,
        dueDate: undefined,
        dueLabel: undefined,
        items: [],
      }
      entry.total += item.feeAmount
      entry.count += 1
      if (item.dueDateValue) {
        const time = new Date(item.dueDateValue).getTime()
        if (!Number.isNaN(time)) {
          if (!entry.dueDate || time < entry.dueDate) {
            entry.dueDate = time
            entry.dueLabel = formatMonthLabel(item.dueDateValue)
          }
        }
      }
      entry.items.push(item)
      map.set(key, entry)
    })
    const groups = Array.from(map.values())
    groups.sort((a, b) => {
      if (feeSort === 'amount-asc') return a.total - b.total
      if (feeSort === 'amount-desc') return b.total - a.total
      if (feeSort === 'due-date') return (a.dueDate || 0) - (b.dueDate || 0)
      if (feeSort === 'fee') return a.title.localeCompare(b.title)
      return b.total - a.total
    })
    return groups
  }, [filteredFeeAssignments, feeSort])
  const unpaidAging = useMemo(() => {
    const buckets = { days0to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 }
    const now = new Date()
    filteredFeeAssignments.forEach((item) => {
      if (String(item.assignment.status || '').toLowerCase() !== 'unpaid') return
      if (!item.dueDateValue) return
      const dueDate = new Date(item.dueDateValue)
      if (Number.isNaN(dueDate.getTime())) return
      const days = Math.floor((now.getTime() - dueDate.getTime()) / 86400000)
      if (days <= 0) return
      if (days <= 30) buckets.days0to30 += 1
      else if (days <= 60) buckets.days31to60 += 1
      else if (days <= 90) buckets.days61to90 += 1
      else buckets.days90plus += 1
    })
    return buckets
  }, [filteredFeeAssignments])
  const revenueMonthsFiltered = useMemo(() => {
    const monthMap = new Map<string, RevenueMonth>()
    const includeOrders = revenueSourceFilter !== 'fees'
    const includeFees = revenueSourceFilter !== 'orders'
    const matchesTeamFilter = (teamIds: string[]) =>
      revenueTeamFilter === 'all' || teamIds.includes(revenueTeamFilter)
    const ensureMonth = (key: string) => {
      if (!monthMap.has(key)) {
        const date = new Date(`${key}-01T00:00:00Z`)
        const label = Number.isNaN(date.getTime())
          ? key
          : date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        monthMap.set(key, {
          key,
          label,
          total: 0,
          ordersTotal: 0,
          ordersCount: 0,
          feesTotal: 0,
          feesCount: 0,
        })
      }
      return monthMap.get(key) as RevenueMonth
    }

    if (includeOrders) {
      ordersForDisplay.forEach((order) => {
        const key = getMonthKey(order.created_at)
        if (!key) return
        const athleteTeams = order.athlete_id ? assigneeTeams.get(order.athlete_id) || [] : []
        const coachTeams = order.coach_id ? assigneeTeams.get(order.coach_id) || [] : []
        const teamIds = athleteTeams.length ? athleteTeams : coachTeams
        if (revenueTeamFilter !== 'all' && !matchesTeamFilter(teamIds)) return
        const value = Number(order.amount ?? order.total ?? order.price ?? 0)
        if (!Number.isFinite(value)) return
        const entry = ensureMonth(key)
        entry.ordersTotal += value
        entry.ordersCount += 1
        entry.total += value
      })
    }

    if (includeFees) {
      feeAssignmentsForDisplay
        .filter((assignment) => assignment.status === 'paid' && assignment.fee_id)
        .forEach((assignment) => {
          const key = getMonthKey(assignment.paid_at || assignment.created_at)
          if (!key) return
          const teamIds = assignment.athlete_id ? assigneeTeams.get(assignment.athlete_id) || [] : []
          if (revenueTeamFilter !== 'all' && !matchesTeamFilter(teamIds)) return
          const fee = assignment.fee_id ? feeById.get(assignment.fee_id) : null
          const value = fee ? Number(fee.amount_cents || 0) / 100 : 0
          if (!Number.isFinite(value)) return
          const entry = ensureMonth(key)
          entry.feesTotal += value
          entry.feesCount += 1
          entry.total += value
        })
    }

    const months = Array.from(monthMap.values())
    const baseMonths = months.length > 0 ? months : revenueByMonthForDisplay
    const sorted = [...baseMonths].sort((a, b) => b.key.localeCompare(a.key))
    const timeframeCount = revenueTimeframe === '3m'
      ? 3
      : revenueTimeframe === '6m'
        ? 6
        : revenueTimeframe === '12m'
          ? 12
          : null
    const sliced = timeframeCount ? sorted.slice(0, timeframeCount) : sorted
    return sliced.filter((month) => {
      if (revenueSourceFilter === 'orders') return month.ordersTotal > 0
      if (revenueSourceFilter === 'fees') return month.feesTotal > 0
      return month.total > 0
    })
  }, [
    assigneeTeams,
    feeAssignmentsForDisplay,
    feeById,
    ordersForDisplay,
    revenueByMonthForDisplay,
    revenueSourceFilter,
    revenueTeamFilter,
    revenueTimeframe,
  ])
  const revenueSummary = useMemo(() => {
    const ordersTotal = revenueMonthsFiltered.reduce((sum, month) => sum + month.ordersTotal, 0)
    const feesTotal = revenueMonthsFiltered.reduce((sum, month) => sum + month.feesTotal, 0)
    const ordersCount = revenueMonthsFiltered.reduce((sum, month) => sum + month.ordersCount, 0)
    const total = revenueSourceFilter === 'orders'
      ? ordersTotal
      : revenueSourceFilter === 'fees'
        ? feesTotal
        : ordersTotal + feesTotal
    const avgOrderValue = ordersCount ? ordersTotal / ordersCount : 0
    return { total, ordersTotal, feesTotal, ordersCount, avgOrderValue }
  }, [revenueMonthsFiltered, revenueSourceFilter])
  const activeRevenueDetails = useMemo(() => {
    if (!activeRevenueMonth) return null
    const monthKey = activeRevenueMonth.key
    const matchesTeamFilter = (teamIds: string[]) =>
      revenueTeamFilter === 'all' || teamIds.includes(revenueTeamFilter)
    const ordersForMonth = ordersForDisplay.filter((order) => {
      const key = getMonthKey(order.created_at)
      if (key !== monthKey) return false
      if (revenueTeamFilter === 'all') return true
      const athleteTeams = order.athlete_id ? assigneeTeams.get(order.athlete_id) || [] : []
      const coachTeams = order.coach_id ? assigneeTeams.get(order.coach_id) || [] : []
      const teamIds = athleteTeams.length ? athleteTeams : coachTeams
      return matchesTeamFilter(teamIds)
    })
    const feePaymentsForMonth = feeAssignmentsForDisplay.filter((assignment) => {
      if (assignment.status !== 'paid') return false
      const key = getMonthKey(assignment.paid_at || assignment.created_at)
      if (key !== monthKey) return false
      if (revenueTeamFilter === 'all') return true
      const teamIds = assignment.athlete_id ? assigneeTeams.get(assignment.athlete_id) || [] : []
      return matchesTeamFilter(teamIds)
    })

    const topProducts = new Map<string, { title: string; total: number; count: number }>()
    ordersForMonth.forEach((order) => {
      const value = Number(order.amount ?? order.total ?? order.price ?? 0)
      if (!Number.isFinite(value)) return
      const productId = order.product_id || 'unknown'
      const productTitle = productsByIdForDisplay[productId]?.title || 'Product'
      const entry = topProducts.get(productId) || { title: productTitle, total: 0, count: 0 }
      entry.total += value
      entry.count += 1
      topProducts.set(productId, entry)
    })

    const topFees = new Map<string, { title: string; total: number; count: number }>()
    feePaymentsForMonth.forEach((assignment) => {
      if (!assignment.fee_id) return
      const fee = feeById.get(assignment.fee_id)
      const value = fee ? Number(fee.amount_cents || 0) / 100 : 0
      if (!Number.isFinite(value)) return
      const entry = topFees.get(assignment.fee_id) || { title: fee?.title || 'Fee', total: 0, count: 0 }
      entry.total += value
      entry.count += 1
      topFees.set(assignment.fee_id, entry)
    })

    const ordersTotal = ordersForMonth.reduce((sum, order) => {
      const value = Number(order.amount ?? order.total ?? order.price ?? 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
    const feesTotal = feePaymentsForMonth.reduce((sum, assignment) => {
      const fee = assignment.fee_id ? feeById.get(assignment.fee_id) : null
      const value = fee ? Number(fee.amount_cents || 0) / 100 : 0
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
    const processingFee = ordersForMonth.length
      ? ordersTotal * 0.029 + ordersForMonth.length * 0.3
      : 0
    const payout = Math.max(0, ordersTotal + feesTotal - processingFee)

    return {
      ordersForMonth,
      feePaymentsForMonth,
      topProducts: Array.from(topProducts.values()).sort((a, b) => b.total - a.total).slice(0, 3),
      topFees: Array.from(topFees.values()).sort((a, b) => b.total - a.total).slice(0, 3),
      ordersTotal,
      feesTotal,
      processingFee,
      payout,
    }
  }, [
    activeRevenueMonth,
    assigneeTeams,
    feeAssignmentsForDisplay,
    feeById,
    ordersForDisplay,
    productsByIdForDisplay,
    revenueTeamFilter,
  ])
  const revenueValueByKey = useMemo(() => {
    const map = new Map<string, number>()
    revenueMonthsFiltered.forEach((month) => {
      const value = revenueSourceFilter === 'orders'
        ? month.ordersTotal
        : revenueSourceFilter === 'fees'
          ? month.feesTotal
          : month.total
      map.set(month.key, value)
    })
    return map
  }, [revenueMonthsFiltered, revenueSourceFilter])
  const revenueMonthsChrono = useMemo(
    () => [...revenueMonthsFiltered].sort((a, b) => a.key.localeCompare(b.key)),
    [revenueMonthsFiltered],
  )
  const resolveRange = (startValue: string, endValue: string) => {
    if (!startValue || !endValue) return null
    const start = new Date(startValue)
    const end = new Date(endValue)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }
  const reportRange = useMemo(
    () => resolveRange(reportRangeStart, reportRangeEnd),
    [reportRangeEnd, reportRangeStart],
  )
  const seasonRange = useMemo(() => {
    if (cohortSeasonFilter === 'current') return null
    const [season, yearValue] = cohortSeasonFilter.split('-')
    const year = Number(yearValue)
    if (!year) return null
    if (season === 'fall') {
      return { start: new Date(year, 8, 1), end: new Date(year, 10, 30, 23, 59, 59, 999) }
    }
    if (season === 'winter') {
      return { start: new Date(year - 1, 11, 1), end: new Date(year, 1, 28, 23, 59, 59, 999) }
    }
    if (season === 'spring') {
      return { start: new Date(year, 2, 1), end: new Date(year, 4, 31, 23, 59, 59, 999) }
    }
    return null
  }, [cohortSeasonFilter])
  const activeRange = seasonRange || reportRange
  const priorRange = useMemo(() => {
    if (!activeRange) return null
    const rangeMs = activeRange.end.getTime() - activeRange.start.getTime()
    const priorEnd = new Date(activeRange.start.getTime() - 1)
    const priorStart = new Date(priorEnd.getTime() - rangeMs)
    return { start: priorStart, end: priorEnd }
  }, [activeRange])
  const isWithinRange = useCallback((value?: string | null, range?: { start: Date; end: Date } | null) => {
    if (!range) return true
    if (!value) return false
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return false
    return date >= range.start && date <= range.end
  }, [])
  useEffect(() => {
    if (activeFeeStatus) setFeeStatusFilter(activeFeeStatus)
  }, [activeFeeStatus])
  useEffect(() => {
    if (activeFeeTeam?.id) {
      setFeeTeamFilter(activeFeeTeam.id)
    } else {
      setFeeTeamFilter('all')
    }
  }, [activeFeeTeam])
  useEffect(() => {
    setShowRevenueDetailsDrawer(false)
  }, [activeRevenueMonth, showRevenueModal])
  const exportCsv = (
    filename: string,
    rows: Array<Array<string | number | null | undefined>>,
  ) => {
    void filename
    void rows
    setExportNotice('Exports moved to Settings > Export center.')
    window.location.assign('/org/settings#export-center')
  }
  const exportFeeView = () => {
    if (!exportFullEnabled || filteredFeeAssignments.length === 0) return
    const rows = [
      ['Assignee', 'Email', 'Role', 'Fee', 'Amount', 'Status', 'Issued', 'Due', 'Paid'],
      ...filteredFeeAssignments.map((item) => {
        const role = String(item.assignee?.role || '').toLowerCase()
        const roleLabel = role === 'assistant_coach'
          ? 'Assistant coach'
          : role === 'coach'
            ? 'Coach'
            : role === 'athlete'
              ? 'Athlete'
              : 'Member'
        const issued = formatMonthLabel(item.assignment.created_at || item.fee?.created_at)
        const due = formatMonthLabel(item.fee?.due_date || item.assignment.created_at)
        const paid = formatMonthLabel(item.assignment.paid_at)
        return [
          item.assigneeName,
          item.assignee?.email || '',
          roleLabel,
          item.feeTitle,
          item.feeAmount.toFixed(2),
          item.assignment.status || '',
          issued,
          due,
          paid,
        ]
      }),
    ]
    exportCsv(`fee-report-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }
  const exportRevenueCsv = () => {
    if (!exportFullEnabled) return
    const rows = [
      ['Month', 'Total', 'Orders', 'Fees'],
      ...revenueMonthsFiltered.map((month) => [
        month.label,
        month.total.toFixed(2),
        month.ordersTotal.toFixed(2),
        month.feesTotal.toFixed(2),
      ]),
    ]
    exportCsv(`revenue-report-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }
  const exportRetentionCsv = () => {
    if (!exportFullEnabled) return
    const rows: Array<Array<string | number | null | undefined>> = [
      ['Retention summary', 'Value'],
      ['Current rate', `${retentionSummary.rate}%`],
      ['Prior period', `${retentionSummary.prevRate}%`],
      ['Change', `${retentionSummary.change}%`],
      [],
      ['Segment', 'Retained', 'Total', 'Rate'],
      ...retentionSegments.map((segment) => {
        const rate = segment.total ? Math.round((segment.retained / segment.total) * 100) : 0
        return [segment.label, segment.retained, segment.total, `${rate}%`]
      }),
    ]
    if (retentionCohorts.length > 0) {
      rows.push([])
      rows.push(['Cohort', 'Retained', 'Total', 'Rate'])
      retentionCohorts.forEach((cohort) => {
        const rate = cohort.total ? Math.round((cohort.retained / cohort.total) * 100) : 0
        rows.push([cohort.label, cohort.retained, cohort.total, `${rate}%`])
      })
    }
    exportCsv(`retention-report-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }
  const exportAttendanceCsv = () => {
    if (!exportFullEnabled) return
    const rows: Array<Array<string | number | null | undefined>> = [
      ['Attendance summary', 'Value'],
      ['Attendance rate', `${attendanceModalRate}%`],
      ['Sessions tracked', attendanceSessions.length],
      ['Marked attendance', attendanceStatusSplit.present + attendanceStatusSplit.excused + attendanceStatusSplit.absent],
      ['Unmarked', attendanceStatusSplit.unmarked],
      [],
      ['Team', 'Attendance rate', 'Sessions'],
      ...attendanceByTeam.map((team) => [team.label, `${team.rate}%`, team.sessions]),
    ]
    if (attendanceTrend.length > 0) {
      rows.push([])
      rows.push(['Month', 'Attendance rate'])
      attendanceTrend.forEach((item) => {
        rows.push([item.label, `${item.rate}%`])
      })
    }
    exportCsv(`attendance-report-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }
  const sessionSummary = useMemo(() => {
    const teamCounts = new Map<string, number>()
    const coachCounts = new Map<string, number>()
    const statusCounts = { completed: 0, upcoming: 0, canceled: 0 }
    const attendanceCounts = { present: 0, excused: 0, absent: 0, unmarked: 0 }
    const durationMinutes: number[] = []
    const peakCounts = new Map<string, { label: string; count: number }>()
    const now = new Date()
    const resolveTeamId = (session: SessionRow) => {
      const athleteTeams = session.athlete_id ? assigneeTeams.get(session.athlete_id) || [] : []
      if (athleteTeams.length > 0) return athleteTeams[0]
      const coachTeams = session.coach_id ? assigneeTeams.get(session.coach_id) || [] : []
      if (coachTeams.length > 0) return coachTeams[0]
      return null
    }

    sessionsForDisplay.forEach((session) => {
      const normalizedStatus = String(session.status || '').toLowerCase()
      if (normalizedStatus === 'canceled' || normalizedStatus === 'cancelled') {
        statusCounts.canceled += 1
      } else if (session.start_time) {
        const start = new Date(session.start_time)
        if (!Number.isNaN(start.getTime()) && start > now) {
          statusCounts.upcoming += 1
        } else {
          statusCounts.completed += 1
        }
      } else {
        statusCounts.completed += 1
      }

      const attendance = String(session.attendance_status || '').toLowerCase()
      if (attendance === 'present') {
        attendanceCounts.present += 1
      } else if (attendance === 'excused') {
        attendanceCounts.excused += 1
      } else if (attendance === 'absent') {
        attendanceCounts.absent += 1
      } else {
        attendanceCounts.unmarked += 1
      }

      const teamId = resolveTeamId(session) || 'unassigned'
      teamCounts.set(teamId, (teamCounts.get(teamId) || 0) + 1)

      if (session.coach_id) {
        coachCounts.set(session.coach_id, (coachCounts.get(session.coach_id) || 0) + 1)
      }

      if (typeof session.duration_minutes === 'number' && session.duration_minutes > 0) {
        durationMinutes.push(session.duration_minutes)
      } else if (session.start_time && session.end_time) {
        const start = new Date(session.start_time)
        const end = new Date(session.end_time)
        const diff = (end.getTime() - start.getTime()) / 60000
        if (Number.isFinite(diff) && diff > 0) durationMinutes.push(diff)
      }

      if (session.start_time) {
        const start = new Date(session.start_time)
        if (!Number.isNaN(start.getTime())) {
          const day = start.toLocaleDateString('en-US', { weekday: 'short' })
          const time = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          const key = `${day}-${time}`
          const label = `${day} · ${time}`
          const entry = peakCounts.get(key) || { label, count: 0 }
          entry.count += 1
          peakCounts.set(key, entry)
        }
      }
    })

    let peakLabel = '—'
    let peakCount = 0
    peakCounts.forEach((entry) => {
      if (entry.count > peakCount) {
        peakCount = entry.count
        peakLabel = entry.label
      }
    })

    const averageDuration = durationMinutes.length
      ? Math.round(durationMinutes.reduce((sum, value) => sum + value, 0) / durationMinutes.length)
      : 0
    const recentSessions = [...sessionsForDisplay]
      .filter((session) => Boolean(session.start_time))
      .sort((a, b) => new Date(b.start_time as string).getTime() - new Date(a.start_time as string).getTime())
      .slice(0, 5)

    return {
      teamCounts,
      coachCounts,
      statusCounts,
      attendanceCounts,
      averageDuration,
      peakLabel,
      recentSessions,
    }
  }, [assigneeTeams, sessionsForDisplay])
  const athleteMetricsById = useMemo(() => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(now.getDate() - 30)
    const sessionsByAthlete = new Map<string, SessionRow[]>()
    sessionsForDisplay.forEach((session) => {
      if (!session.athlete_id) return
      const list = sessionsByAthlete.get(session.athlete_id) || []
      list.push(session)
      sessionsByAthlete.set(session.athlete_id, list)
    })
    const unpaidByAthlete = new Map<string, number>()
    feeAssignmentsForDisplay.forEach((assignment) => {
      if (assignment.status !== 'unpaid' || !assignment.athlete_id) return
      unpaidByAthlete.set(assignment.athlete_id, (unpaidByAthlete.get(assignment.athlete_id) || 0) + 1)
    })
    const athleteIds = new Set<string>()
    teamMembersForDisplay.forEach((member) => {
      if (member.athlete_id) athleteIds.add(member.athlete_id)
    })
    Object.values(profilesForDisplay).forEach((profile) => {
      if (String(profile.role || '').toLowerCase() === 'athlete') athleteIds.add(profile.id)
    })
    const metrics = new Map<string, {
      active: boolean
      lastSession: string | null
      nextSession: string | null
      attendanceRate: number | null
      duesOwed: number
      year: string | null
    }>()
    athleteIds.forEach((athleteId) => {
      const sessions = sessionsByAthlete.get(athleteId) || []
      let lastSession: string | null = null
      let nextSession: string | null = null
      let attendanceMarked = 0
      let attendancePresent = 0
      sessions.forEach((session) => {
        const normalizedStatus = String(session.status || '').toLowerCase()
        if (session.start_time) {
          const start = new Date(session.start_time)
          if (!Number.isNaN(start.getTime())) {
            if (normalizedStatus !== 'canceled' && normalizedStatus !== 'cancelled') {
              if (start <= now) {
                if (!lastSession || start > new Date(lastSession)) {
                  lastSession = session.start_time
                }
              } else if (!nextSession || start < new Date(nextSession)) {
                nextSession = session.start_time
              }
            }
          }
        }
        const attendance = String(session.attendance_status || '').toLowerCase()
        if (attendance) {
          attendanceMarked += 1
          if (attendance === 'present' || attendance === 'excused') {
            attendancePresent += 1
          }
        }
      })
      const attendanceRate = attendanceMarked
        ? Math.round((attendancePresent / attendanceMarked) * 100)
        : null
      const active = Boolean(lastSession && new Date(lastSession) >= thirtyDaysAgo)
      metrics.set(athleteId, {
        active,
        lastSession,
        nextSession,
        attendanceRate,
        duesOwed: unpaidByAthlete.get(athleteId) || 0,
        year: athleteYearById[athleteId] || null,
      })
    })
    return metrics
  }, [athleteYearById, feeAssignmentsForDisplay, profilesForDisplay, sessionsForDisplay, teamMembersForDisplay])
  const athleteRosterSummary = useMemo(() => {
    const athleteIds = new Set<string>()
    teamMembersForDisplay.forEach((member) => {
      if (member.athlete_id) athleteIds.add(member.athlete_id)
    })
    const total = athleteIds.size
    let active = 0
    let withDues = 0
    athleteIds.forEach((athleteId) => {
      const metrics = athleteMetricsById.get(athleteId)
      if (metrics?.active) active += 1
      if (metrics && metrics.duesOwed > 0) withDues += 1
    })
    return { total, active, withDues }
  }, [athleteMetricsById, teamMembersForDisplay])
  const athleteYearOptions = useMemo(() => {
    const levelSet = new Set<string>()
    const teamIds = athleteTeamFilter === 'all'
      ? teamsForDisplay.map((team) => team.id)
      : [athleteTeamFilter]
    teamIds.forEach((teamId) => {
      const athletes = athletesByTeam.get(teamId) || []
      athletes.forEach((athleteId) => {
        const level = athleteMetricsById.get(athleteId)?.year
        if (level) levelSet.add(level)
      })
    })
    const ordered = ATHLETE_LEVEL_OPTIONS.filter((level) => levelSet.has(level))
    const extras = Array.from(levelSet).filter((level) => !ATHLETE_LEVEL_OPTIONS.includes(level)).sort()
    return [...ordered, ...extras]
  }, [athleteMetricsById, athleteTeamFilter, athletesByTeam, teamsForDisplay])
  const retentionCohorts = useMemo<RetentionCohort[]>(() => [], [])
  const retentionSegments = useMemo(() => {
    return teamsForDisplay.map((team) => {
      const athletes = athletesByTeam.get(team.id) || []
      const active = athletes.filter((athleteId) => athleteMetricsById.get(athleteId)?.active).length
      return { id: team.id, label: team.name || 'Team', retained: active, total: athletes.length }
    })
  }, [athleteMetricsById, athletesByTeam, teamsForDisplay])
  const retentionChurn = useMemo<Array<{ label: string; count: number }>>(() => [], [])
  const retentionReengaged = useMemo<Array<{ name: string; detail: string; team: string }>>(() => [], [])
  const retentionDrivers = useMemo<Array<{ label: string; value: string }>>(() => [], [])
  const retentionAtRisk = useMemo<Array<{ name: string; reason: string; team: string }>>(() => [], [])
  const retentionSummary = useMemo(() => {
    const filteredSegments = retentionTeamFilter === 'all'
      ? retentionSegments
      : retentionSegments.filter((segment) => segment.id === retentionTeamFilter)
    const summary = filteredSegments.reduce(
      (acc, segment) => {
        acc.total += segment.total
        acc.retained += segment.retained
        return acc
      },
      { total: 0, retained: 0 },
    )
    const rate = summary.total ? Math.round((summary.retained / summary.total) * 100) : 0
    const prev = retentionCohorts[1]
    const prevRate = prev?.total ? Math.round((prev.retained / prev.total) * 100) : 0
    const change = rate - prevRate
    return { rate, prevRate, change }
  }, [retentionCohorts, retentionSegments, retentionTeamFilter])
  const feePaidRate = useMemo(() => {
    const total = feePaid + feeUnpaid
    return total ? Math.round((feePaid / total) * 100) : 0
  }, [feePaid, feeUnpaid])
  const atRiskCount = retentionAtRisk.length
  const cohortSessions = useMemo(() => {
    const programValue = cohortProgramFilter === 'all' ? '' : cohortProgramFilter.toLowerCase()
    const matchesTeam = (athleteId?: string | null, coachId?: string | null) => {
      if (cohortTeamFilter === 'all') return true
      const athleteTeams = athleteId ? assigneeTeams.get(athleteId) || [] : []
      const coachTeams = coachId ? assigneeTeams.get(coachId) || [] : []
      return [...athleteTeams, ...coachTeams].includes(cohortTeamFilter)
    }
    const matchesCoach = (coachId?: string | null) =>
      cohortCoachFilter === 'all' || coachId === cohortCoachFilter
    const matchesProgram = (value?: string | null) => {
      if (!programValue) return true
      return String(value || '').toLowerCase().includes(programValue)
    }
    const filterByRange = (range: { start: Date; end: Date } | null) =>
      sessionsForDisplay.filter((session) => {
        if (!isWithinRange(session.start_time || '', range)) return false
        if (!matchesTeam(session.athlete_id, session.coach_id)) return false
        if (!matchesCoach(session.coach_id)) return false
        if (!matchesProgram(session.session_type)) return false
        return true
      })
    return {
      current: filterByRange(activeRange),
      prior: filterByRange(priorRange),
    }
  }, [
    activeRange,
    assigneeTeams,
    cohortCoachFilter,
    cohortProgramFilter,
    cohortTeamFilter,
    isWithinRange,
    priorRange,
    sessionsForDisplay,
  ])
  const attendanceInsight = useMemo(() => {
    const now = new Date()
    const eligible = cohortSessions.current.filter((session) => {
      if (session.start_time) {
        const start = new Date(session.start_time)
        if (!Number.isNaN(start.getTime()) && start > now) return false
      }
      const normalizedStatus = String(session.status || '').toLowerCase()
      return normalizedStatus !== 'canceled' && normalizedStatus !== 'cancelled'
    })
    const marked = eligible.filter((session) => Boolean(session.attendance_status))
    const present = marked.filter((session) =>
      ['present', 'excused'].includes(String(session.attendance_status || '').toLowerCase())
    )
    const rate = marked.length ? Math.round((present.length / marked.length) * 100) : 0
    return { rate, marked: marked.length, total: eligible.length }
  }, [cohortSessions])
  const attendanceInsightPrior = useMemo(() => {
    const now = new Date()
    const eligible = cohortSessions.prior.filter((session) => {
      if (session.start_time) {
        const start = new Date(session.start_time)
        if (!Number.isNaN(start.getTime()) && start > now) return false
      }
      const normalizedStatus = String(session.status || '').toLowerCase()
      return normalizedStatus !== 'canceled' && normalizedStatus !== 'cancelled'
    })
    const marked = eligible.filter((session) => Boolean(session.attendance_status))
    const present = marked.filter((session) =>
      ['present', 'excused'].includes(String(session.attendance_status || '').toLowerCase())
    )
    const rate = marked.length ? Math.round((present.length / marked.length) * 100) : 0
    return { rate, marked: marked.length, total: eligible.length }
  }, [cohortSessions])
  const retentionInsight = useMemo(() => {
    const activeAthletes = new Set(
      cohortSessions.current.map((session) => session.athlete_id).filter(Boolean) as string[],
    )
    const segments = retentionSegments.filter((segment) =>
      retentionTeamFilter === 'all' || segment.id === retentionTeamFilter,
    )
    const total = segments.reduce((sum, segment) => sum + segment.total, 0)
    const retained = segments.reduce((sum, segment) => {
      if (segment.id === 'unassigned') return sum
      const athletes = athletesByTeam.get(segment.id) || []
      const activeCount = athletes.filter((id) => activeAthletes.has(id)).length
      return sum + activeCount
    }, 0)
    const rate = total ? Math.round((retained / total) * 100) : 0
    return { rate, retained, total }
  }, [athletesByTeam, cohortSessions, retentionSegments, retentionTeamFilter])
  const retentionInsightPrior = useMemo(() => {
    const activeAthletes = new Set(
      cohortSessions.prior.map((session) => session.athlete_id).filter(Boolean) as string[],
    )
    const segments = retentionSegments.filter((segment) =>
      retentionTeamFilter === 'all' || segment.id === retentionTeamFilter,
    )
    const total = segments.reduce((sum, segment) => sum + segment.total, 0)
    const retained = segments.reduce((sum, segment) => {
      if (segment.id === 'unassigned') return sum
      const athletes = athletesByTeam.get(segment.id) || []
      const activeCount = athletes.filter((id) => activeAthletes.has(id)).length
      return sum + activeCount
    }, 0)
    const rate = total ? Math.round((retained / total) * 100) : 0
    return { rate, retained, total }
  }, [athletesByTeam, cohortSessions, retentionSegments, retentionTeamFilter])
  const revenueInsight = useMemo(() => {
    const programValue = cohortProgramFilter === 'all' ? '' : cohortProgramFilter.toLowerCase()
    const matchesTeam = (athleteId?: string | null, coachId?: string | null) => {
      if (cohortTeamFilter === 'all') return true
      const athleteTeams = athleteId ? assigneeTeams.get(athleteId) || [] : []
      const coachTeams = coachId ? assigneeTeams.get(coachId) || [] : []
      return [...athleteTeams, ...coachTeams].includes(cohortTeamFilter)
    }
    const matchesProgramLabel = (label?: string | null) => {
      if (!programValue) return true
      return String(label || '').toLowerCase().includes(programValue)
    }
    const ordersFiltered = ordersForDisplay.filter((order) => {
      if (!isWithinRange(order.created_at || '', activeRange)) return false
      if (cohortCoachFilter !== 'all' && order.coach_id !== cohortCoachFilter) return false
      if (!matchesTeam(order.athlete_id, order.coach_id)) return false
      if (programValue) {
        const title = order.product_id ? productsByIdForDisplay[order.product_id]?.title || '' : ''
        if (!matchesProgramLabel(title)) return false
      }
      return true
    })
    const feesFiltered = feeAssignmentsForDisplay.filter((assignment) => {
      const dateValue = assignment.paid_at || assignment.created_at
      if (!isWithinRange(dateValue || '', activeRange)) return false
      if (cohortCoachFilter !== 'all') return false
      if (!matchesTeam(assignment.athlete_id, null)) return false
      if (programValue) {
        const fee = assignment.fee_id ? feeById.get(assignment.fee_id) : null
        if (!matchesProgramLabel(fee?.title || '')) return false
      }
      return assignment.status === 'paid'
    })
    const ordersTotal = ordersFiltered.reduce((sum, order) => {
      const value = Number(order.amount ?? order.total ?? order.price ?? 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
    const feesTotal = feesFiltered.reduce((sum, assignment) => {
      const fee = assignment.fee_id ? feeById.get(assignment.fee_id) : null
      const value = fee ? Number(fee.amount_cents || 0) / 100 : 0
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
    return { total: ordersTotal + feesTotal, ordersTotal, feesTotal }
  }, [
    activeRange,
    assigneeTeams,
    cohortCoachFilter,
    cohortProgramFilter,
    cohortTeamFilter,
    feeAssignmentsForDisplay,
    feeById,
    isWithinRange,
    ordersForDisplay,
    productsByIdForDisplay,
  ])
  const revenueInsightPrior = useMemo(() => {
    const programValue = cohortProgramFilter === 'all' ? '' : cohortProgramFilter.toLowerCase()
    const matchesTeam = (athleteId?: string | null, coachId?: string | null) => {
      if (cohortTeamFilter === 'all') return true
      const athleteTeams = athleteId ? assigneeTeams.get(athleteId) || [] : []
      const coachTeams = coachId ? assigneeTeams.get(coachId) || [] : []
      return [...athleteTeams, ...coachTeams].includes(cohortTeamFilter)
    }
    const matchesProgramLabel = (label?: string | null) => {
      if (!programValue) return true
      return String(label || '').toLowerCase().includes(programValue)
    }
    const ordersFiltered = ordersForDisplay.filter((order) => {
      if (!isWithinRange(order.created_at || '', priorRange)) return false
      if (cohortCoachFilter !== 'all' && order.coach_id !== cohortCoachFilter) return false
      if (!matchesTeam(order.athlete_id, order.coach_id)) return false
      if (programValue) {
        const title = order.product_id ? productsByIdForDisplay[order.product_id]?.title || '' : ''
        if (!matchesProgramLabel(title)) return false
      }
      return true
    })
    const feesFiltered = feeAssignmentsForDisplay.filter((assignment) => {
      const dateValue = assignment.paid_at || assignment.created_at
      if (!isWithinRange(dateValue || '', priorRange)) return false
      if (cohortCoachFilter !== 'all') return false
      if (!matchesTeam(assignment.athlete_id, null)) return false
      if (programValue) {
        const fee = assignment.fee_id ? feeById.get(assignment.fee_id) : null
        if (!matchesProgramLabel(fee?.title || '')) return false
      }
      return assignment.status === 'paid'
    })
    const ordersTotal = ordersFiltered.reduce((sum, order) => {
      const value = Number(order.amount ?? order.total ?? order.price ?? 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
    const feesTotal = feesFiltered.reduce((sum, assignment) => {
      const fee = assignment.fee_id ? feeById.get(assignment.fee_id) : null
      const value = fee ? Number(fee.amount_cents || 0) / 100 : 0
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
    return { total: ordersTotal + feesTotal, ordersTotal, feesTotal }
  }, [
    assigneeTeams,
    cohortCoachFilter,
    cohortProgramFilter,
    cohortTeamFilter,
    feeAssignmentsForDisplay,
    feeById,
    isWithinRange,
    ordersForDisplay,
    priorRange,
    productsByIdForDisplay,
  ])
  const feePaidRateRange = useMemo(() => {
    const paid = feeAssignmentsForDisplay.filter(
      (assignment) => assignment.status === 'paid' && isWithinRange(assignment.paid_at || assignment.created_at || '', activeRange),
    ).length
    const unpaid = feeAssignmentsForDisplay.filter(
      (assignment) => assignment.status === 'unpaid' && isWithinRange(assignment.created_at || '', activeRange),
    ).length
    const total = paid + unpaid
    return total ? Math.round((paid / total) * 100) : 0
  }, [activeRange, feeAssignmentsForDisplay, isWithinRange])
  const compareDeltas = useMemo(() => {
    if (!compareEnabled) return null
    if (!priorRange) {
      return {
        attendance: null,
        retention: null,
        revenue: null,
        atRisk: null,
      }
    }
    const attendanceDelta = attendanceInsight.rate - attendanceInsightPrior.rate
    const retentionDelta = retentionInsight.rate - retentionInsightPrior.rate
    const revenueDelta = revenueInsightPrior.total
      ? Math.round(((revenueInsight.total - revenueInsightPrior.total) / revenueInsightPrior.total) * 100)
      : null
    return {
      attendance: Number.isFinite(attendanceDelta) ? attendanceDelta : null,
      retention: Number.isFinite(retentionDelta) ? retentionDelta : null,
      revenue: Number.isFinite(revenueDelta) ? revenueDelta : null,
      atRisk: null,
    }
  }, [
    attendanceInsight.rate,
    attendanceInsightPrior.rate,
    compareEnabled,
    priorRange,
    retentionInsight.rate,
    retentionInsightPrior.rate,
    revenueInsight.total,
    revenueInsightPrior.total,
  ])
  const keyDrivers = useMemo(() => {
    if (retentionDrivers.length > 0) return retentionDrivers
    return [
      { label: 'Attendance rate', value: `${attendanceInsight.rate}%` },
      { label: 'Fees paid on time', value: `${feePaidRateRange}%` },
      { label: 'Active members', value: `${athleteCount}` },
    ]
  }, [attendanceInsight.rate, athleteCount, feePaidRateRange, retentionDrivers])
  const attendanceSessions = useMemo(() => {
    const now = new Date()
    let cutoff: Date | null = null
    if (attendanceTimeframe === '3m') {
      cutoff = new Date(now)
      cutoff.setMonth(now.getMonth() - 3)
    } else if (attendanceTimeframe === '6m') {
      cutoff = new Date(now)
      cutoff.setMonth(now.getMonth() - 6)
    } else if (attendanceTimeframe === '12m') {
      cutoff = new Date(now)
      cutoff.setMonth(now.getMonth() - 12)
    }

    const matchesTeam = (assigneeId?: string | null) => {
      if (!assigneeId) return false
      const teamIds = assigneeTeams.get(assigneeId) || []
      return teamIds.includes(attendanceTeamFilter)
    }

    return sessionsForDisplay.filter((session) => {
      if (cutoff) {
        if (!session.start_time) return false
        const start = new Date(session.start_time)
        if (Number.isNaN(start.getTime()) || start < cutoff) return false
      }
      if (attendanceCoachFilter !== 'all' && session.coach_id !== attendanceCoachFilter) return false
      if (attendanceTeamFilter !== 'all') {
        const athleteMatch = matchesTeam(session.athlete_id)
        const coachMatch = matchesTeam(session.coach_id)
        if (!athleteMatch && !coachMatch) return false
      }
      if (attendanceSessionTypeFilter !== 'all') {
        const sessionType = String(
          (session as { session_type?: string | null; type?: string | null }).session_type
            || (session as { type?: string | null }).type
            || '',
        ).toLowerCase()
        if (sessionType && sessionType !== attendanceSessionTypeFilter) return false
      }
      return true
    })
  }, [
    assigneeTeams,
    attendanceCoachFilter,
    attendanceSessionTypeFilter,
    attendanceTeamFilter,
    attendanceTimeframe,
    sessionsForDisplay,
  ])
  const attendanceTrend = useMemo(() => {
    const monthMap = new Map<string, { key: string; label: string; total: number; marked: number; present: number }>()
    attendanceSessions.forEach((session) => {
      const key = getMonthKey(session.start_time)
      if (!key) return
      if (!monthMap.has(key)) {
        const date = new Date(`${key}-01T00:00:00Z`)
        const label = Number.isNaN(date.getTime())
          ? key
          : date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        monthMap.set(key, { key, label, total: 0, marked: 0, present: 0 })
      }
      const entry = monthMap.get(key) as { key: string; label: string; total: number; marked: number; present: number }
      entry.total += 1
      const attendance = String(session.attendance_status || '').toLowerCase()
      if (attendance) {
        entry.marked += 1
        if (attendance === 'present' || attendance === 'excused') entry.present += 1
      }
    })
    return Array.from(monthMap.values())
      .sort((a, b) => b.key.localeCompare(a.key))
      .slice(0, 6)
      .map((entry) => ({
        key: entry.key,
        label: entry.label,
        rate: entry.marked ? Math.round((entry.present / entry.marked) * 100) : 0,
      }))
  }, [attendanceSessions])
  const attendanceByTeam = useMemo(() => {
    const map = new Map<string, { total: number; marked: number; present: number }>()
    attendanceSessions.forEach((session) => {
      const athleteTeams = session.athlete_id ? assigneeTeams.get(session.athlete_id) || [] : []
      const coachTeams = session.coach_id ? assigneeTeams.get(session.coach_id) || [] : []
      const teamId = athleteTeams[0] || coachTeams[0] || 'unassigned'
      const entry = map.get(teamId) || { total: 0, marked: 0, present: 0 }
      entry.total += 1
      const attendance = String(session.attendance_status || '').toLowerCase()
      if (attendance) {
        entry.marked += 1
        if (attendance === 'present' || attendance === 'excused') entry.present += 1
      }
      map.set(teamId, entry)
    })
    return Array.from(map.entries()).map(([teamId, entry]) => {
      const rate = entry.marked ? Math.round((entry.present / entry.marked) * 100) : 0
      return {
        id: teamId,
        label: teamId === 'unassigned' ? 'Unassigned' : teamNameById.get(teamId) || 'Team',
        rate,
        sessions: entry.total,
      }
    })
  }, [assigneeTeams, attendanceSessions, teamNameById])
  const attendanceByCoach = useMemo(() => {
    const map = new Map<string, { total: number; marked: number; present: number }>()
    attendanceSessions.forEach((session) => {
      if (!session.coach_id) return
      const entry = map.get(session.coach_id) || { total: 0, marked: 0, present: 0 }
      entry.total += 1
      const attendance = String(session.attendance_status || '').toLowerCase()
      if (attendance) {
        entry.marked += 1
        if (attendance === 'present' || attendance === 'excused') entry.present += 1
      }
      map.set(session.coach_id, entry)
    })
    return Array.from(map.entries()).map(([coachId, entry]) => {
      const rate = entry.marked ? Math.round((entry.present / entry.marked) * 100) : 0
      const coach = profilesForDisplay[coachId]
      return {
        id: coachId,
        label: coach?.full_name || coach?.email || 'Coach',
        rate,
        sessions: entry.total,
      }
    })
  }, [attendanceSessions, profilesForDisplay])
  const attendanceBySessionType = useMemo(() => {
    const map = new Map<string, { total: number; marked: number; present: number }>()
    attendanceSessions.forEach((session) => {
      const sessionType = String(
        (session as { session_type?: string | null; type?: string | null }).session_type
          || (session as { type?: string | null }).type
          || 'Other',
      )
      const label = sessionType ? sessionType.charAt(0).toUpperCase() + sessionType.slice(1) : 'Other'
      const entry = map.get(label) || { total: 0, marked: 0, present: 0 }
      entry.total += 1
      const attendance = String(session.attendance_status || '').toLowerCase()
      if (attendance) {
        entry.marked += 1
        if (attendance === 'present' || attendance === 'excused') entry.present += 1
      }
      map.set(label, entry)
    })
    return Array.from(map.entries())
      .map(([label, entry]) => ({
        label,
        rate: entry.marked ? Math.round((entry.present / entry.marked) * 100) : 0,
        sessions: entry.total,
      }))
      .sort((a, b) => b.sessions - a.sessions)
  }, [attendanceSessions])
  const attendanceStatusSplit = useMemo(() => {
    const split = { present: 0, excused: 0, absent: 0, unmarked: 0 }
    attendanceSessions.forEach((session) => {
      const attendance = String(session.attendance_status || '').toLowerCase()
      if (!attendance) {
        split.unmarked += 1
      } else if (attendance === 'present') {
        split.present += 1
      } else if (attendance === 'excused') {
        split.excused += 1
      } else if (attendance === 'absent') {
        split.absent += 1
      } else {
        split.unmarked += 1
      }
    })
    return split
  }, [attendanceSessions])
  const attendanceModalRate = useMemo(() => {
    const marked = attendanceStatusSplit.present + attendanceStatusSplit.excused + attendanceStatusSplit.absent
    const present = attendanceStatusSplit.present + attendanceStatusSplit.excused
    return marked ? Math.round((present / marked) * 100) : 0
  }, [attendanceStatusSplit])
  const attendanceAtRisk = useMemo(() => {
    const metrics = new Map<string, { marked: number; present: number }>()
    attendanceSessions.forEach((session) => {
      if (!session.athlete_id) return
      const attendance = String(session.attendance_status || '').toLowerCase()
      if (!attendance) return
      const entry = metrics.get(session.athlete_id) || { marked: 0, present: 0 }
      entry.marked += 1
      if (attendance === 'present' || attendance === 'excused') entry.present += 1
      metrics.set(session.athlete_id, entry)
    })
    return Array.from(metrics.entries())
      .map(([athleteId, entry]) => {
        const rate = entry.marked ? Math.round((entry.present / entry.marked) * 100) : 0
        const athlete = profilesForDisplay[athleteId]
        const teamIds = assigneeTeams.get(athleteId) || []
        const teamLabel = teamIds.length ? teamNameById.get(teamIds[0]) || 'Team' : 'Unassigned'
        return {
          name: athlete?.full_name || athlete?.email || 'Athlete',
          rate,
          team: teamLabel,
        }
      })
      .filter((entry) => entry.rate <= 60)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 5)
  }, [assigneeTeams, attendanceSessions, profilesForDisplay, teamNameById])
  useEffect(() => {
    if (athleteYearFilter !== 'all' && !athleteYearOptions.includes(athleteYearFilter)) {
      setAthleteYearFilter('all')
    }
  }, [athleteYearFilter, athleteYearOptions])
  const coachMetricsById = useMemo(() => {
    const map = new Map<string, {
      recentCount: number
      lastSession: string | null
      attendanceMarked: number
      attendancePresent: number
    }>()
    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(now.getDate() - 30)

    sessionsForDisplay.forEach((session) => {
      if (!session.coach_id) return
      const entry = map.get(session.coach_id) || {
        recentCount: 0,
        lastSession: null,
        attendanceMarked: 0,
        attendancePresent: 0,
      }
      if (session.start_time) {
        const start = new Date(session.start_time)
        if (!Number.isNaN(start.getTime())) {
          if (start >= thirtyDaysAgo && start <= now) entry.recentCount += 1
          if (!entry.lastSession || start > new Date(entry.lastSession)) {
            entry.lastSession = session.start_time
          }
        }
      }
      const attendance = String(session.attendance_status || '').toLowerCase()
      if (attendance) {
        entry.attendanceMarked += 1
        if (attendance === 'present' || attendance === 'excused') {
          entry.attendancePresent += 1
        }
      }
      map.set(session.coach_id, entry)
    })
    return map
  }, [sessionsForDisplay])
  const [exporting, setExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState('')
  const [exportType, setExportType] = useState('billing')
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv')
  const [exportStart, setExportStart] = useState('')
  const [exportEnd, setExportEnd] = useState('')
  const [orgTier, setOrgTier] = useState<'standard' | 'growth' | 'enterprise'>('standard')
  const [planStatus, setPlanStatus] = useState<'trialing' | 'active' | 'past_due' | 'canceled'>('trialing')
  const planActive = isOrgPlanActive(planStatus)
  const growthReportsEnabled = planActive && (orgTier === 'growth' || orgTier === 'enterprise')
  const enterpriseReportsEnabled = planActive && orgTier === 'enterprise'
  const exportFullEnabled = planActive && ORG_FEATURES[orgTier].exportReports
  const exportBasicEnabled = planActive
  const exportPdfEnabled = exportFullEnabled && orgTier === 'enterprise'
  const formatDeltaLabel = (delta: number | null, suffix = '%') => {
    if (!compareEnabled) return 'Compare off'
    if (delta === null) return 'No prior period'
    const sign = delta > 0 ? '+' : ''
    return `${sign}${delta}${suffix} vs last period`
  }
  const scheduleSummary = useMemo(() => {
    if (!scheduleForm.enabled) return 'Not scheduled'
    if (scheduleForm.cadence === 'monthly') {
      return `Monthly on day ${scheduleForm.dayOfMonth} · ${scheduleForm.timeOfDay}`
    }
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dayLabel = dayNames[Number(scheduleForm.dayOfWeek)] || 'Mon'
    return `Weekly on ${dayLabel} · ${scheduleForm.timeOfDay}`
  }, [scheduleForm])
  useEffect(() => {
    if (reportRangePreset === 'custom') return
    const now = new Date()
    let start = new Date(now)
    if (reportRangePreset === '7d') {
      start.setDate(now.getDate() - 6)
    } else if (reportRangePreset === '30d') {
      start.setDate(now.getDate() - 29)
    } else if (reportRangePreset === '90d') {
      start.setDate(now.getDate() - 89)
    } else if (reportRangePreset === 'season') {
      start = new Date(now.getFullYear(), 0, 1)
    }
    const end = reportRangePreset === 'season' ? new Date(now.getFullYear(), 11, 31) : now
    const toInput = (value: Date) => value.toISOString().slice(0, 10)
    const startValue = toInput(start)
    const endValue = toInput(end)
    setReportRangeStart(startValue)
    setReportRangeEnd(endValue)
    setExportStart(startValue)
    setExportEnd(endValue)
  }, [reportRangePreset])

  useEffect(() => {
    const next = cohortTeamFilter === 'all' ? 'all' : cohortTeamFilter
    setRetentionTeamFilter(next)
    setAttendanceTeamFilter(next)
    setRevenueTeamFilter(next)
  }, [cohortTeamFilter, setAttendanceTeamFilter, setRetentionTeamFilter, setRevenueTeamFilter])

  useEffect(() => {
    const next = cohortCoachFilter === 'all' ? 'all' : cohortCoachFilter
    setAttendanceCoachFilter(next)
  }, [cohortCoachFilter, setAttendanceCoachFilter])

  useEffect(() => {
    const next = cohortProgramFilter === 'all' ? 'all' : cohortProgramFilter.toLowerCase()
    setAttendanceSessionTypeFilter(next)
  }, [cohortProgramFilter, setAttendanceSessionTypeFilter])

  useEffect(() => {
    if (!growthReportsEnabled) {
      setRevenueTimeframe('all')
      setRevenueSourceFilter('all')
      setRevenueTeamFilter('all')
      setAttendanceTimeframe('6m')
      setAttendanceTeamFilter('all')
      setAttendanceCoachFilter('all')
      setRetentionTeamFilter('all')
      setRetentionTimeframe('6m')
      setAthleteTeamFilter('all')
      setAthleteStatusFilter('all')
      setAthleteSearch('')
      setCohortTeamFilter('all')
      setCohortCoachFilter('all')
      setCohortProgramFilter('all')
      setCohortSeasonFilter('current')
    }
  }, [
    growthReportsEnabled,
    setAttendanceCoachFilter,
    setAttendanceTeamFilter,
    setAttendanceTimeframe,
    setAthleteSearch,
    setAthleteStatusFilter,
    setAthleteTeamFilter,
    setCohortCoachFilter,
    setCohortProgramFilter,
    setCohortSeasonFilter,
    setCohortTeamFilter,
    setRetentionTeamFilter,
    setRetentionTimeframe,
    setRevenueSourceFilter,
    setRevenueTeamFilter,
    setRevenueTimeframe,
  ])
  useEffect(() => {
    if (!enterpriseReportsEnabled) {
      setAttendanceSessionTypeFilter('all')
      setRetentionLevelFilter('all')
    }
  }, [enterpriseReportsEnabled, setAttendanceSessionTypeFilter, setRetentionLevelFilter])
  useEffect(() => {
    if (!exportFullEnabled && exportFormat !== 'csv') {
      setExportFormat('csv')
      return
    }
    if (!exportPdfEnabled && exportFormat === 'pdf') {
      setExportFormat('csv')
    }
  }, [exportFormat, exportPdfEnabled, exportFullEnabled])
  useEffect(() => {
    let active = true
    const loadSchedule = async () => {
      try {
        const response = await fetch('/api/org/reports/schedule')
        if (!response.ok) return
        const data = await response.json()
        if (!active || !data) return
        setScheduleForm({
          enabled: Boolean(data.enabled),
          cadence: data.cadence || 'weekly',
          dayOfWeek: data.day_of_week ? String(data.day_of_week) : '1',
          dayOfMonth: data.day_of_month ? String(data.day_of_month) : '1',
          timeOfDay: data.time_of_day || '09:00',
          recipients: Array.isArray(data.recipients) ? data.recipients.join(', ') : '',
        })
      } catch (error) {
        console.error(error)
      }
    }
    loadSchedule()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadReports = async () => {
      setLoading(true)
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, start_time, end_time, status, attendance_status, coach_id, athlete_id, duration_minutes')
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      let coachTotal = 0
      let athleteTotal = 0
      let feeRevenue = 0
      let nextOrders: OrderRow[] = []
      let productMap: Record<string, { title: string }> = {}
      let nextTeams: TeamRow[] = []
      let nextTeamMembers: TeamMemberRow[] = []
      let profileMap: Record<string, ProfileRow> = {}
      let orgFees: OrgFeeRow[] = []
      let feeAssignmentRows: FeeAssignmentRow[] = []
      if (userId) {
        const { data: membership } = await supabase
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const membershipRow = (membership || null) as { org_id?: string | null } | null
        if (membershipRow?.org_id) {
          const { data: orgSettings } = await supabase
            .from('org_settings')
            .select('plan, plan_status')
            .eq('org_id', membershipRow.org_id)
            .maybeSingle()
          const orgSettingsRow = (orgSettings || null) as { plan?: string | null; plan_status?: string | null } | null
          if (active && orgSettingsRow?.plan) {
            setOrgTier(normalizeOrgTier(orgSettingsRow.plan))
          }
          if (active && orgSettingsRow?.plan_status) {
            setPlanStatus(normalizeOrgStatus(orgSettingsRow.plan_status))
          }
          const { data: members } = await supabase
            .from('organization_memberships')
            .select('role')
            .eq('org_id', membershipRow.org_id)
          const memberRows = (members || []) as Array<{ role?: string | null }>
          coachTotal = memberRows.filter((row) => ['coach', 'assistant_coach'].includes(String(row.role))).length
          athleteTotal = memberRows.filter((row) => String(row.role) === 'athlete').length

          const { data: orders } = await supabase
            .from('orders')
            .select('id, product_id, coach_id, athlete_id, amount, total, price, created_at')
            .eq('org_id', membershipRow.org_id)
          nextOrders = (orders || []) as OrderRow[]
          const productIds = Array.from(new Set(nextOrders.map((order) => order.product_id).filter(Boolean) as string[]))
          const { data: productRows } = productIds.length
            ? await supabase
                .from('products')
                .select('id, title, name')
                .in('id', productIds)
            : { data: [] }
          const products = (productRows || []) as Array<{ id: string; title?: string | null; name?: string | null }>
          productMap = products.reduce<Record<string, { title: string }>>((acc, row) => {
            acc[row.id] = { title: row.title || row.name || 'Product' }
            return acc
          }, {})

          const { data: feeAssignments } = await supabase
            .from('org_fee_assignments')
            .select('status, fee_id, paid_at, created_at, athlete_id')
          const { data: orgFeeRows } = await supabase
            .from('org_fees')
            .select('id, amount_cents, title, due_date, created_at')
            .eq('org_id', membershipRow.org_id)
          feeAssignmentRows = (feeAssignments || []) as FeeAssignmentRow[]
          const orgFeeList = (orgFeeRows || []) as OrgFeeRow[]
          const orgFeeIds = new Set(orgFeeList.map((fee) => fee.id))
          const scopedAssignments = feeAssignmentRows.filter((row: FeeAssignmentRow) => row.fee_id && orgFeeIds.has(row.fee_id))
          const paidAssignments = scopedAssignments.filter((row: FeeAssignmentRow) => row.status === 'paid')
          const paidCount = paidAssignments.length
          const unpaidCount = scopedAssignments.filter((row: FeeAssignmentRow) => row.status === 'unpaid').length
          const feeAmountMap = new Map(orgFeeList.map((fee) => [fee.id, Number(fee.amount_cents || 0) / 100]))
          feeRevenue = paidAssignments.reduce((sum, row) => sum + (feeAmountMap.get(row.fee_id || '') || 0), 0)
          if (active) {
            setFeePaid(paidCount)
            setFeeUnpaid(unpaidCount)
            setOrgFeeRows(orgFeeList)
            setFeeAssignments(scopedAssignments)
            setOrderRows(nextOrders)
            setProductsById(productMap)
          }
          orgFees = orgFeeList
          feeAssignmentRows = scopedAssignments

          const { data: teamRows } = await supabase
            .from('org_teams')
            .select('id, name, coach_id')
            .eq('org_id', membershipRow.org_id)
            .order('name', { ascending: true })
          nextTeams = (teamRows || []) as TeamRow[]
          const teamIds = nextTeams.map((team) => team.id)
          const { data: teamMemberRows } = teamIds.length
            ? await supabase
                .from('org_team_members')
                .select('team_id, athlete_id')
                .in('team_id', teamIds)
            : { data: [] }
          nextTeamMembers = (teamMemberRows || []) as TeamMemberRow[]
          const coachIds = nextTeams.map((team) => team.coach_id).filter(Boolean) as string[]
          const athleteIds = nextTeamMembers.map((member) => member.athlete_id).filter(Boolean) as string[]
          const assignmentIds = scopedAssignments.map((row) => row.athlete_id).filter(Boolean) as string[]
          const profileIds = Array.from(new Set([...coachIds, ...athleteIds, ...assignmentIds]))
          const { data: profileRows } = profileIds.length
            ? await supabase
                .from('profiles')
                .select('id, full_name, email, role')
                .in('id', profileIds)
            : { data: [] }
          const profiles = (profileRows || []) as ProfileRow[]
          profileMap = profiles.reduce<Record<string, ProfileRow>>((acc, row) => {
            acc[row.id] = row
            return acc
          }, {})
        }
      }
      if (!active) return
      setTeams(nextTeams)
      setTeamMembers(nextTeamMembers)
      setProfiles(profileMap)
      const sessionRows = (sessions || []) as SessionRow[]
      setSessionRows(sessionRows)
      const now = new Date()
      const attendanceEligible = sessionRows.filter((session) => {
        if (session.start_time) {
          const start = new Date(session.start_time)
          if (!Number.isNaN(start.getTime()) && start > now) return false
        }
        const normalizedStatus = String(session.status || '').toLowerCase()
        return normalizedStatus !== 'canceled' && normalizedStatus !== 'cancelled'
      })
      const attendanceMarked = attendanceEligible.filter((session) => Boolean(session.attendance_status))
      const attendancePresent = attendanceMarked.filter((session) =>
        ['present', 'excused'].includes(String(session.attendance_status || '').toLowerCase())
      )
      const attendancePercent = attendanceMarked.length
        ? Math.round((attendancePresent.length / attendanceMarked.length) * 100)
        : 0
      setAttendanceRate(attendancePercent)
      setSessionCount(sessionRows.length)
      const grossOrders = nextOrders.reduce((sum, order: OrderRow) => {
        const value = Number(order.amount ?? order.total ?? order.price ?? 0)
        return sum + (Number.isFinite(value) ? value : 0)
      }, 0)
      setRevenue(grossOrders + feeRevenue)
      const monthMap = new Map<string, RevenueMonth>()
      const ensureMonth = (key: string) => {
        if (!monthMap.has(key)) {
          const date = new Date(`${key}-01T00:00:00Z`)
          const label = Number.isNaN(date.getTime())
            ? key
            : date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          monthMap.set(key, {
            key,
            label,
            total: 0,
            ordersTotal: 0,
            ordersCount: 0,
            feesTotal: 0,
            feesCount: 0,
          })
        }
        return monthMap.get(key) as RevenueMonth
      }
      nextOrders.forEach((order: OrderRow) => {
        if (!order.created_at) return
        const date = new Date(order.created_at)
        if (Number.isNaN(date.getTime())) return
        const key = date.toISOString().slice(0, 7)
        const value = Number(order.amount ?? order.total ?? order.price ?? 0)
        if (!Number.isFinite(value)) return
        const entry = ensureMonth(key)
        entry.ordersTotal += value
        entry.ordersCount += 1
        entry.total += value
      })
      const feeAmountMap = new Map(orgFees.map((fee) => [fee.id, Number(fee.amount_cents || 0) / 100]))
      feeAssignmentRows
        .filter((row: FeeAssignmentRow) => row.status === 'paid' && row.fee_id && feeAmountMap.has(row.fee_id))
        .forEach((row: FeeAssignmentRow) => {
          const dateValue = row.paid_at || row.created_at
          if (!dateValue) return
          const date = new Date(dateValue)
          if (Number.isNaN(date.getTime())) return
          const key = date.toISOString().slice(0, 7)
          const value = feeAmountMap.get(row.fee_id || '') || 0
          const entry = ensureMonth(key)
          entry.feesTotal += value
          entry.feesCount += 1
          entry.total += value
        })
      const months = Array.from(monthMap.values()).sort((a, b) => b.key.localeCompare(a.key))
      setRevenueByMonth(months)
      setCoachCount(coachTotal)
      setAthleteCount(athleteTotal)
      setLoading(false)
    }
    loadReports()
    return () => {
      active = false
    }
  }, [supabase])

  const handleExport = async () => {
    setExporting(false)
    setExportNotice('Exports moved to Settings > Export center.')
    window.location.assign('/org/settings#export-center')
  }
  const handleSaveSchedule = async () => {
    setScheduleSaving(true)
    setScheduleNotice('')
    const recipients = scheduleForm.recipients
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    const payload = {
      enabled: scheduleForm.enabled,
      cadence: scheduleForm.cadence,
      dayOfWeek: Number(scheduleForm.dayOfWeek || 1),
      dayOfMonth: Number(scheduleForm.dayOfMonth || 1),
      timeOfDay: scheduleForm.timeOfDay,
      recipients,
    }
    const response = await fetch('/api/org/reports/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      setScheduleNotice('Unable to save schedule.')
      setScheduleSaving(false)
      return
    }
    setScheduleNotice('Schedule saved.')
    setScheduleSaving(false)
    setShowScheduleModal(false)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Reports</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Monitor attendance, retention, and revenue.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2 rounded-full border border-[#dcdcdc] bg-white px-3 py-2 text-xs text-[#4a4a4a]">
              <span className="text-[10px] uppercase tracking-[0.3em]">Range</span>
              <select
                className="bg-transparent text-xs text-[#191919] focus:outline-none"
                value={reportRangePreset}
                onChange={(event) => setReportRangePreset(event.target.value)}
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="season">This season</option>
                <option value="custom">Custom</option>
              </select>
              <span className="text-[10px] uppercase tracking-[0.3em] text-[#4a4a4a]">From</span>
              <input
                type="date"
                value={reportRangeStart}
                onChange={(event) => {
                  setReportRangePreset('custom')
                  setReportRangeStart(event.target.value)
                  setExportStart(event.target.value)
                }}
                disabled={reportRangePreset !== 'custom'}
                className="bg-transparent text-xs text-[#191919] focus:outline-none"
              />
              <span className="text-[10px] uppercase tracking-[0.3em] text-[#4a4a4a]">To</span>
              <input
                type="date"
                value={reportRangeEnd}
                onChange={(event) => {
                  setReportRangePreset('custom')
                  setReportRangeEnd(event.target.value)
                  setExportEnd(event.target.value)
                }}
                disabled={reportRangePreset !== 'custom'}
                className="bg-transparent text-xs text-[#191919] focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setCompareEnabled((prev) => !prev)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold ${compareEnabled ? 'border-[#b80f0a] text-[#b80f0a]' : 'border-[#dcdcdc] text-[#4a4a4a]'}`}
            >
              Compare {compareEnabled ? 'on' : 'off'}
            </button>
          </div>
        </header>
        {!enterpriseReportsEnabled ? (
          <div className="mt-4 rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
            Upgrade to {growthReportsEnabled ? 'Enterprise' : 'Growth'} to unlock{' '}
            {growthReportsEnabled
              ? 'advanced analytics, session-type breakdowns, scheduled reports, and audit history.'
              : 'filters, drill-downs, CSV exports, and at-risk insights across reports.'}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-xs text-[#4a4a4a]">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#4a4a4a]">Scheduled reports</p>
              <p className="mt-2 text-sm font-semibold text-[#191919]">Automated report delivery</p>
              <p className="mt-1 text-xs text-[#4a4a4a]">{scheduleSummary}</p>
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                className="mt-3 rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
              >
                Configure schedule
              </button>
            </div>
            <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-xs text-[#4a4a4a]">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#4a4a4a]">Audit history</p>
              <p className="mt-2 text-sm font-semibold text-[#191919]">Report access log</p>
              <p className="mt-1 text-xs text-[#4a4a4a]">Track exports, filters, and report views.</p>
              <Link
                href="/org/audit"
                className="mt-3 inline-flex rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
              >
                View audit trail
              </Link>
            </div>
          </div>
        )}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="grid gap-4">
            <div className="rounded-3xl border border-[#e5e5e5] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Cohort filters</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">
                    Apply filters across retention, attendance, and revenue.
                  </p>
                </div>
                <div className="text-xs text-[#4a4a4a]">
                  Range:{' '}
                  <span className="font-semibold text-[#191919]">
                    {reportRangeStart && reportRangeEnd ? `${reportRangeStart} – ${reportRangeEnd}` : 'Set a range'}
                  </span>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <select
                  value={cohortTeamFilter}
                  onChange={(event) => setCohortTeamFilter(event.target.value)}
                  disabled={!growthReportsEnabled}
                  className={`rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919] ${growthReportsEnabled ? '' : 'opacity-60'}`}
                >
                  <option value="all">All teams</option>
                  {teamsForDisplay.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name || 'Team'}
                    </option>
                  ))}
                </select>
                <select
                  value={cohortCoachFilter}
                  onChange={(event) => setCohortCoachFilter(event.target.value)}
                  disabled={!growthReportsEnabled}
                  className={`rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919] ${growthReportsEnabled ? '' : 'opacity-60'}`}
                >
                  <option value="all">All coaches</option>
                  {coachesForFilters.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.full_name || coach.email || 'Coach'}
                    </option>
                  ))}
                </select>
                <select
                  value={cohortProgramFilter}
                  onChange={(event) => setCohortProgramFilter(event.target.value)}
                  disabled={!growthReportsEnabled}
                  className={`rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919] ${growthReportsEnabled ? '' : 'opacity-60'}`}
                >
                  <option value="all">All programs</option>
                  {programOptions.map((program) => (
                    <option key={program} value={program}>
                      {program}
                    </option>
                  ))}
                </select>
                <select
                  value={cohortSeasonFilter}
                  onChange={(event) => setCohortSeasonFilter(event.target.value)}
                  disabled={!growthReportsEnabled}
                  className={`rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919] ${growthReportsEnabled ? '' : 'opacity-60'}`}
                >
                  <option value="current">Current season</option>
                  <option value="fall-2024">Fall 2024</option>
                  <option value="winter-2025">Winter 2025</option>
                  <option value="spring-2025">Spring 2025</option>
                </select>
              </div>
              {!growthReportsEnabled ? (
                <p className="mt-2 text-xs text-[#4a4a4a]">
                  Upgrade to Growth to unlock advanced cohort filters.
                </p>
              ) : null}
              {!hasLiveData && !loading ? (
                <p className="mt-2 text-xs text-[#4a4a4a]">
                  No live data yet. Reports will populate after members, sessions, and fees are added.
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Attendance</p>
                  <button
                    type="button"
                    onClick={() =>
                      setExplainMetric({
                        title: 'Attendance rate',
                        body: 'Attendance is based on marked sessions where athletes were present or excused.',
                      })
                    }
                    className="text-[10px] font-semibold text-[#b80f0a]"
                  >
                    Explain
                  </button>
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">
                  {loading ? '...' : `${attendanceInsight.rate}%`}
                </p>
                <p className="mt-1 text-xs text-[#4a4a4a]">
                  {formatDeltaLabel(compareDeltas?.attendance ?? null)}
                </p>
                <button
                  type="button"
                  onClick={() => setShowAttendanceModal(true)}
                  className="mt-3 text-xs font-semibold text-[#b80f0a]"
                >
                  View details
                </button>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Retention</p>
                  <button
                    type="button"
                    onClick={() =>
                      setExplainMetric({
                        title: 'Retention rate',
                        body: 'Retention tracks active roster members versus total roster for the selected range.',
                      })
                    }
                    className="text-[10px] font-semibold text-[#b80f0a]"
                  >
                    Explain
                  </button>
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{retentionInsight.rate}%</p>
                <p className="mt-1 text-xs text-[#4a4a4a]">
                  {formatDeltaLabel(compareDeltas?.retention ?? null)}
                </p>
                <button
                  type="button"
                  onClick={() => setShowRetentionModal(true)}
                  className="mt-3 text-xs font-semibold text-[#b80f0a]"
                >
                  View details
                </button>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Gross revenue</p>
                  <button
                    type="button"
                    onClick={() =>
                      setExplainMetric({
                        title: 'Gross revenue',
                        body: 'Gross revenue includes marketplace orders and paid fees before platform deductions.',
                      })
                    }
                    className="text-[10px] font-semibold text-[#b80f0a]"
                  >
                    Explain
                  </button>
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">
                  {formatCurrency(revenueInsight.total)}
                </p>
                <p className="mt-1 text-xs text-[#4a4a4a]">
                  {formatDeltaLabel(compareDeltas?.revenue ?? null)}
                </p>
                <button
                  type="button"
                  onClick={() => setShowRevenueModal(true)}
                  className="mt-3 text-xs font-semibold text-[#b80f0a]"
                >
                  View details
                </button>
              </div>
              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">At-risk</p>
                  <button
                    type="button"
                    onClick={() =>
                      setExplainMetric({
                        title: 'At-risk members',
                        body: 'At-risk members are flagged by low attendance, unpaid fees, or inactivity.',
                      })
                    }
                    className="text-[10px] font-semibold text-[#b80f0a]"
                  >
                    Explain
                  </button>
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">
                  {growthReportsEnabled ? atRiskCount : '—'}
                </p>
                <p className="mt-1 text-xs text-[#4a4a4a]">
                  {growthReportsEnabled
                    ? formatDeltaLabel(compareDeltas?.atRisk ?? null, '')
                    : 'Upgrade to Growth to view at-risk members.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (!growthReportsEnabled) return
                    setShowRetentionModal(true)
                  }}
                  className={`mt-3 text-xs font-semibold ${growthReportsEnabled ? 'text-[#b80f0a]' : 'text-[#c4c4c4]'}`}
                  disabled={!growthReportsEnabled}
                >
                  View details
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="rounded-3xl border border-[#e5e5e5] bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Key drivers</p>
                    <p className="mt-1 text-xs text-[#4a4a4a]">Signals influencing retention and revenue.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExplainMetric({
                        title: 'Key drivers',
                        body: 'Drivers highlight the leading indicators most correlated with retention and revenue.',
                      })
                    }
                    className="text-xs font-semibold text-[#b80f0a]"
                  >
                    Explain
                  </button>
                </div>
                {!growthReportsEnabled ? (
                  <p className="mt-3 text-xs text-[#4a4a4a]">
                    Upgrade to Growth to unlock key driver insights.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {keyDrivers.map((driver) => (
                      <div key={driver.label} className="rounded-2xl border border-[#e5e5e5] px-3 py-2">
                        <p className="text-xs text-[#4a4a4a]">{driver.label}</p>
                        <p className="mt-1 text-sm font-semibold text-[#191919]">{driver.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-3xl border border-[#e5e5e5] bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Goals & benchmarks</p>
                    <p className="mt-1 text-xs text-[#4a4a4a]">Track progress against your targets.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExplainMetric({
                        title: 'Goals & benchmarks',
                        body: 'Benchmarks compare current metrics to your internal targets for the season.',
                      })
                    }
                    className="text-xs font-semibold text-[#b80f0a]"
                  >
                    Explain
                  </button>
                </div>
                {!growthReportsEnabled ? (
                  <p className="mt-3 text-xs text-[#4a4a4a]">
                    Upgrade to Growth to set benchmarks and alerts.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3 text-xs text-[#4a4a4a]">
                    {[{
                      label: 'Attendance goal',
                      target: 90,
                      current: attendanceInsight.rate,
                      unit: '%',
                    }, {
                      label: 'Retention target',
                      target: 92,
                      current: retentionInsight.rate,
                      unit: '%',
                    }, {
                      label: 'Fees paid on time',
                      target: 85,
                      current: feePaidRateRange,
                      unit: '%',
                    }].map((goal) => {
                      const onTrack = goal.current >= goal.target
                      return (
                        <div key={goal.label} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-[#191919]">{goal.label}</p>
                            <p className="text-xs text-[#4a4a4a]">Target {goal.target}{goal.unit}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-[#191919]">{goal.current}{goal.unit}</p>
                            <p className={`text-xs font-semibold ${onTrack ? 'text-emerald-600' : 'text-[#b80f0a]'}`}>
                              {onTrack ? 'On track' : 'Behind'}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-[#e5e5e5] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Export center</p>
                  <p className="mt-1 text-xs text-[#4a4a4a]">Download billing, roster, and compliance reports.</p>
                </div>
                <button
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                  onClick={handleExport}
                  disabled={exporting || !exportBasicEnabled}
                >
                  {exporting ? 'Opening...' : 'Go to export center'}
                </button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <select
                  className="rounded-full border border-[#191919] bg-white px-4 py-2 text-sm text-[#191919]"
                  value={exportType}
                  onChange={(event) => setExportType(event.target.value)}
                  disabled={!exportBasicEnabled}
                >
                  <option value="summary">Org summary</option>
                  <option value="billing">Billing report</option>
                  <option value="invoices">Invoices</option>
                  <option value="roster">Roster report</option>
                  <option value="compliance">Compliance report</option>
                </select>
                <select
                  className="rounded-full border border-[#191919] bg-white px-4 py-2 text-sm text-[#191919]"
                  value={exportFormat}
                  onChange={(event) => setExportFormat(event.target.value as 'csv' | 'pdf')}
                  disabled={!exportBasicEnabled}
                >
                  <option value="csv">CSV</option>
                  {exportPdfEnabled ? (
                    <option value="pdf">PDF</option>
                  ) : (
                    <option value="pdf" disabled>PDF (Enterprise)</option>
                  )}
                </select>
                <div className="flex items-center gap-2 rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#4a4a4a]">
                  <span className="text-[10px] uppercase tracking-[0.3em]">Range</span>
                  <span className="text-xs text-[#191919]">
                    {exportStart && exportEnd ? `${exportStart} – ${exportEnd}` : 'Set a range'}
                  </span>
                </div>
              </div>
              {exportNotice ? <p className="mt-2 text-xs text-[#b80f0a]">{exportNotice}</p> : null}
              {!planActive ? (
                <p className="mt-2 text-xs text-[#4a4a4a]">
                  Billing status: {formatTierName(planStatus)}. Activate billing to export reports.
                </p>
              ) : !exportFullEnabled ? (
                <p className="mt-2 text-xs text-[#4a4a4a]">
                  Basic exports are included. Upgrade to Growth for full detail exports. Current plan: {formatTierName(orgTier)}.
                </p>
              ) : !exportPdfEnabled ? (
                <p className="mt-2 text-xs text-[#4a4a4a]">
                  PDF exports are available on Enterprise. Current plan: {formatTierName(orgTier)}.
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <button
                type="button"
                onClick={() => setShowSessionsModal(true)}
                className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Sessions tracked</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{sessionCount}</p>
              </button>
              <button
                type="button"
                onClick={() => setShowCoachesModal(true)}
                className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coaches</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{coachCount}</p>
              </button>
              <button
                type="button"
                onClick={() => setShowAthletesModal(true)}
                className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athletes</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{athleteCount}</p>
              </button>
              <button
                type="button"
                onClick={() => setShowRevenueModal(true)}
                className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Gross revenue</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{formatCurrency(revenue)}</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFeesPaidModal(true)
                  setActiveFeeStatus('paid')
                  setActiveFeeTeam(null)
                }}
                className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Fees paid</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{feePaid}</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFeesUnpaidModal(true)
                  setActiveFeeStatus('unpaid')
                  setActiveFeeTeam(null)
                }}
                className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Fees unpaid</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{feeUnpaid}</p>
              </button>
              <button
                type="button"
                onClick={() => setShowRetentionModal(true)}
                className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Retention rate</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{retentionSummary.rate}%</p>
              </button>
              <button
                type="button"
                onClick={() => setShowAttendanceModal(true)}
                className="glass-card border border-[#191919] bg-white p-5 text-left transition hover:border-[#b80f0a] hover:shadow-xl hover:-translate-y-1 cursor-pointer"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Attendance</p>
                <p className="mt-2 text-2xl font-semibold text-[#191919]">{loading ? '...' : `${attendanceRate}%`}</p>
              </button>
            </div>
          </div>
        </div>
      </div>
      {showSessionsModal && (
        <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-24">
          <div className="w-full max-w-4xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Sessions</p>
                <p className="text-lg font-semibold text-[#191919]">Activity breakdown</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSessionsModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {!growthReportsEnabled ? (
              <div className="mt-4 rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                Upgrade to Growth to unlock coach breakdowns, status splits, and attendance summaries.
              </div>
            ) : !enterpriseReportsEnabled ? (
              <div className="mt-4 rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                Enterprise adds session duration and peak time insights.
              </div>
            ) : null}
            {sessionsForDisplay.length === 0 ? (
              <p className="mt-4 text-xs text-[#4a4a4a]">No sessions tracked yet.</p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Sessions by team</p>
                  <div className="mt-2 space-y-1 text-xs text-[#4a4a4a]">
                    {Array.from(sessionSummary.teamCounts.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([teamId, count]) => (
                        <div key={teamId} className="flex items-center justify-between">
                          <span className="font-semibold text-[#191919]">
                            {teamId === 'unassigned' ? 'Unassigned' : teamNameById.get(teamId) || 'Team'}
                          </span>
                          <span>{count} sessions</span>
                        </div>
                      ))}
                  </div>
                </div>
                {growthReportsEnabled ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Sessions by coach</p>
                    <div className="mt-2 space-y-1 text-xs text-[#4a4a4a]">
                      {sessionSummary.coachCounts.size === 0 ? (
                        <p className="text-xs text-[#4a4a4a]">No coach sessions yet.</p>
                      ) : (
                        Array.from(sessionSummary.coachCounts.entries())
                          .sort((a, b) => b[1] - a[1])
                          .map(([coachId, count]) => {
                            const coach = profilesForDisplay[coachId]
                            const name = coach?.full_name || coach?.email || 'Coach'
                            return (
                              <div key={coachId} className="flex items-center justify-between">
                                <span className="font-semibold text-[#191919]">{name}</span>
                                <span>{count} sessions</span>
                              </div>
                            )
                          })
                      )}
                    </div>
                  </div>
                ) : null}
                {growthReportsEnabled ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Status split</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#4a4a4a]">
                      <span>Completed: {sessionSummary.statusCounts.completed}</span>
                      <span>Upcoming: {sessionSummary.statusCounts.upcoming}</span>
                      <span>Canceled: {sessionSummary.statusCounts.canceled}</span>
                    </div>
                  </div>
                ) : null}
                {growthReportsEnabled ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Attendance summary</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#4a4a4a]">
                      <span>Present: {sessionSummary.attendanceCounts.present}</span>
                      <span>Excused: {sessionSummary.attendanceCounts.excused}</span>
                      <span>Absent: {sessionSummary.attendanceCounts.absent}</span>
                      <span>Unmarked: {sessionSummary.attendanceCounts.unmarked}</span>
                    </div>
                  </div>
                ) : null}
                {enterpriseReportsEnabled ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Average duration</p>
                    <p className="mt-2 text-lg font-semibold text-[#191919]">
                      {sessionSummary.averageDuration ? `${sessionSummary.averageDuration} min` : '—'}
                    </p>
                  </div>
                ) : null}
                {enterpriseReportsEnabled ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Peak day & time</p>
                    <p className="mt-2 text-lg font-semibold text-[#191919]">{sessionSummary.peakLabel}</p>
                  </div>
                ) : null}
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3 md:col-span-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Recent sessions</p>
                  <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                    {sessionSummary.recentSessions.length === 0 ? (
                      <p className="text-xs text-[#4a4a4a]">No recent sessions.</p>
                    ) : (
                      sessionSummary.recentSessions.map((session) => {
                        const athleteTeams = session.athlete_id ? assigneeTeams.get(session.athlete_id) || [] : []
                        const coachTeams = session.coach_id ? assigneeTeams.get(session.coach_id) || [] : []
                        const teamId = athleteTeams[0] || coachTeams[0]
                        const teamLabel = teamId ? teamNameById.get(teamId) || 'Team' : 'Unassigned'
                        const normalizedStatus = String(session.status || '').toLowerCase()
                        let statusLabel = 'Completed'
                        if (normalizedStatus === 'canceled' || normalizedStatus === 'cancelled') {
                          statusLabel = 'Canceled'
                        } else if (session.start_time) {
                          const start = new Date(session.start_time)
                          if (!Number.isNaN(start.getTime()) && start > new Date()) {
                            statusLabel = 'Upcoming'
                          }
                        }
                        return (
                          <div key={session.id} className="flex items-center justify-between rounded-xl border border-[#f0f0f0] px-3 py-2">
                            <div>
                              <p className="text-sm font-semibold text-[#191919]">{teamLabel}</p>
                              <p className="text-xs text-[#4a4a4a]">{formatSessionDateTime(session.start_time)}</p>
                            </div>
                            <span className="text-xs font-semibold text-[#4a4a4a]">{statusLabel}</span>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showRetentionModal && (
        <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-24">
          <div className="w-full max-w-4xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Retention</p>
                <p className="text-lg font-semibold text-[#191919]">Member retention overview</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRetentionModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {!growthReportsEnabled ? (
                <div className="rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                  Upgrade to Growth to unlock filters, cohort trends, and at-risk insights.
                </div>
              ) : !enterpriseReportsEnabled ? (
                <div className="rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                  Enterprise adds churn drivers, re-engagement tracking, and custom segments.
                </div>
              ) : null}
              {growthReportsEnabled ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={retentionTimeframe}
                    onChange={(event) => setRetentionTimeframe(event.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    <option value="3m">Last 3 months</option>
                    <option value="6m">Last 6 months</option>
                    <option value="12m">Last 12 months</option>
                    <option value="all">All time</option>
                  </select>
                  <select
                    value={retentionTeamFilter}
                    onChange={(event) => setRetentionTeamFilter(event.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    <option value="all">All teams</option>
                    {teamsForDisplay.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name || 'Team'}
                      </option>
                    ))}
                  </select>
                  {enterpriseReportsEnabled ? (
                    <select
                      value={retentionLevelFilter}
                      onChange={(event) => setRetentionLevelFilter(event.target.value)}
                      className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                    >
                      <option value="all">All levels/ages</option>
                      {athleteYearOptions.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Current rate</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{retentionSummary.rate}%</p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Prior period</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{retentionSummary.prevRate}%</p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Change</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">
                    {retentionSummary.change > 0 ? '+' : ''}{retentionSummary.change}%
                  </p>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {growthReportsEnabled ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Cohort breakdown</p>
                    {retentionCohorts.length === 0 ? (
                      <p className="mt-2 text-xs text-[#4a4a4a]">No cohort data yet.</p>
                    ) : (
                      <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                        {retentionCohorts
                          .slice(0, enterpriseReportsEnabled ? retentionCohorts.length : 2)
                          .map((cohort) => {
                            const rate = cohort.total ? Math.round((cohort.retained / cohort.total) * 100) : 0
                            return (
                              <div key={cohort.key} className="flex items-center justify-between">
                                <span className="font-semibold text-[#191919]">{cohort.label}</span>
                                <span>{rate}% ({cohort.retained}/{cohort.total})</span>
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Segment breakdown</p>
                  {retentionSegments.length === 0 ? (
                    <p className="mt-2 text-xs text-[#4a4a4a]">No segment data yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                      {retentionSegments
                        .filter((segment) => retentionTeamFilter === 'all' || segment.id === retentionTeamFilter)
                        .map((segment) => {
                          const rate = segment.total ? Math.round((segment.retained / segment.total) * 100) : 0
                          return (
                            <div key={segment.id} className="flex items-center justify-between">
                              <span className="font-semibold text-[#191919]">{segment.label}</span>
                              <span>{rate}% ({segment.retained}/{segment.total})</span>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
                {enterpriseReportsEnabled ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Churn reasons</p>
                    {retentionChurn.length === 0 ? (
                      <p className="mt-2 text-xs text-[#4a4a4a]">No churn data yet.</p>
                    ) : (
                      <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                        {retentionChurn.map((reason) => (
                          <div key={reason.label} className="flex items-center justify-between">
                            <span className="font-semibold text-[#191919]">{reason.label}</span>
                            <span>{reason.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
                {enterpriseReportsEnabled ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Retention drivers</p>
                    {retentionDrivers.length === 0 ? (
                      <p className="mt-2 text-xs text-[#4a4a4a]">No driver data yet.</p>
                    ) : (
                      <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                        {retentionDrivers.map((driver) => (
                          <div key={driver.label} className="flex items-center justify-between">
                            <span className="font-semibold text-[#191919]">{driver.label}</span>
                            <span>{driver.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {enterpriseReportsEnabled ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Re-engagement</p>
                    {retentionReengaged.length === 0 ? (
                      <p className="mt-2 text-xs text-[#4a4a4a]">No re-engagements yet.</p>
                    ) : (
                      <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                        {retentionReengaged.map((member) => (
                          <div key={member.name} className="flex items-center justify-between">
                            <span className="font-semibold text-[#191919]">{member.name}</span>
                            <span>{member.detail} · {member.team}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
                {growthReportsEnabled ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">At-risk list</p>
                    {retentionAtRisk.length === 0 ? (
                      <p className="mt-2 text-xs text-[#4a4a4a]">No at-risk members flagged.</p>
                    ) : (
                      <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                        {retentionAtRisk.map((member) => (
                          <div key={member.name} className="flex items-center justify-between">
                            <span className="font-semibold text-[#191919]">{member.name}</span>
                            <span>{member.reason} · {member.team}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              {growthReportsEnabled ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={exportRetentionCsv}
                    disabled={!exportFullEnabled}
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] disabled:opacity-50"
                  >
                    Go to export center
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {showAttendanceModal && (
        <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-24">
          <div className="w-full max-w-4xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Attendance</p>
                <p className="text-lg font-semibold text-[#191919]">Attendance overview</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAttendanceModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {!growthReportsEnabled ? (
                <div className="rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                  Upgrade to Growth to unlock attendance filters, team/coach breakdowns, and CSV exports.
                </div>
              ) : !enterpriseReportsEnabled ? (
                <div className="rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                  Enterprise adds session-type breakdowns and advanced attendance insights.
                </div>
              ) : null}
              {growthReportsEnabled ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={attendanceTimeframe}
                    onChange={(event) => setAttendanceTimeframe(event.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    <option value="3m">Last 3 months</option>
                    <option value="6m">Last 6 months</option>
                    <option value="12m">Last 12 months</option>
                    <option value="all">All time</option>
                  </select>
                  <select
                    value={attendanceTeamFilter}
                    onChange={(event) => setAttendanceTeamFilter(event.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    <option value="all">All teams</option>
                    {teamsForDisplay.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name || 'Team'}
                      </option>
                    ))}
                  </select>
                  <select
                    value={attendanceCoachFilter}
                    onChange={(event) => setAttendanceCoachFilter(event.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    <option value="all">All coaches</option>
                    {Array.from(coachByTeam.values())
                      .filter(Boolean)
                      .map((coach) => (
                        <option key={coach?.id} value={coach?.id}>
                          {coach?.full_name || coach?.email || 'Coach'}
                        </option>
                      ))}
                  </select>
                  {enterpriseReportsEnabled ? (
                    <select
                      value={attendanceSessionTypeFilter}
                      onChange={(event) => setAttendanceSessionTypeFilter(event.target.value)}
                      className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                    >
                      <option value="all">All session types</option>
                      <option value="practice">Practice</option>
                      <option value="game">Game</option>
                      <option value="conditioning">Conditioning</option>
                    </select>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Attendance rate</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{attendanceModalRate}%</p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Sessions tracked</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{attendanceSessions.length}</p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Marked attendance</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">
                    {attendanceStatusSplit.present + attendanceStatusSplit.excused + attendanceStatusSplit.absent}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Unmarked</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{attendanceStatusSplit.unmarked}</p>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Attendance trend</p>
                  {attendanceTrend.length === 0 ? (
                    <p className="mt-2 text-xs text-[#4a4a4a]">No attendance data yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                      {attendanceTrend.map((item) => (
                        <div key={item.key} className="flex items-center justify-between">
                          <span className="font-semibold text-[#191919]">{item.label}</span>
                          <span>{item.rate}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Status split</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#4a4a4a]">
                    <span>Present: {attendanceStatusSplit.present}</span>
                    <span>Excused: {attendanceStatusSplit.excused}</span>
                    <span>Absent: {attendanceStatusSplit.absent}</span>
                    <span>Unmarked: {attendanceStatusSplit.unmarked}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">By team</p>
                  <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                    {attendanceByTeam
                      .filter((team) => attendanceTeamFilter === 'all' || team.id === attendanceTeamFilter)
                      .map((team) => (
                        <div key={team.id} className="flex items-center justify-between">
                          <span className="font-semibold text-[#191919]">{team.label}</span>
                          <span>{team.rate}% · {team.sessions} sessions</span>
                        </div>
                      ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">By coach</p>
                  <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                    {attendanceByCoach
                      .filter((coach) => attendanceCoachFilter === 'all' || coach.id === attendanceCoachFilter)
                      .map((coach) => (
                        <div key={coach.id} className="flex items-center justify-between">
                          <span className="font-semibold text-[#191919]">{coach.label}</span>
                          <span>{coach.rate}% · {coach.sessions} sessions</span>
                        </div>
                      ))}
                  </div>
                </div>
                {enterpriseReportsEnabled ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">By session type</p>
                    <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                      {attendanceBySessionType.length === 0 ? (
                        <p className="text-xs text-[#4a4a4a]">No session types tracked yet.</p>
                      ) : (
                        attendanceBySessionType.map((item) => (
                          <div key={item.label} className="flex items-center justify-between">
                            <span className="font-semibold text-[#191919]">{item.label}</span>
                            <span>{item.rate}% · {item.sessions} sessions</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              {growthReportsEnabled ? (
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">At-risk athletes</p>
                  {attendanceAtRisk.length === 0 ? (
                    <p className="mt-2 text-xs text-[#4a4a4a]">No at-risk athletes found.</p>
                  ) : (
                    <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                      {attendanceAtRisk.map((athlete) => (
                        <div key={athlete.name} className="flex items-center justify-between">
                          <span className="font-semibold text-[#191919]">{athlete.name}</span>
                          <span>{athlete.rate}% · {athlete.team}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
              {growthReportsEnabled ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setToast('Reminders queued')}
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  >
                    Send reminders
                  </button>
                  <button
                    type="button"
                    onClick={() => setToast('Attendance review opened')}
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  >
                    Mark attendance
                  </button>
                  <button
                    type="button"
                    onClick={exportAttendanceCsv}
                    disabled={!exportFullEnabled}
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] disabled:opacity-50"
                  >
                    Go to export center
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {showFeesPaidModal && (
        <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-24">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Fees paid</p>
                <p className="text-lg font-semibold text-[#191919]">Teams and totals</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowFeesPaidModal(false)
                  setActiveFeeTeam(null)
                  setActiveFeeStatus(null)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {!growthReportsEnabled ? (
              <div className="mt-4 rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                Upgrade to Growth to drill into fee assignments and export CSVs.
              </div>
            ) : null}
            <div className="mt-4 space-y-2">
              {(() => {
                const assignmentsByTeam = feeAssignmentsByStatus.paid
                const teamsWithFees = teamsForDisplay.filter((team) => (assignmentsByTeam.get(team.id) || []).length > 0)
                const unassignedCount = assignmentsByTeam.get('unassigned')?.length || 0
                if (teamsWithFees.length === 0 && unassignedCount === 0) {
                  return <p className="text-xs text-[#4a4a4a]">No paid fees yet.</p>
                }
                return (
                  <>
                    {teamsWithFees.map((team) => {
                      const count = assignmentsByTeam.get(team.id)?.length || 0
                      return (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => {
                            if (!growthReportsEnabled) return
                            setActiveFeeTeam(team)
                            setActiveFeeStatus('paid')
                          }}
                          className={`flex w-full items-center justify-between rounded-2xl border border-[#e5e5e5] px-4 py-3 text-left text-sm ${growthReportsEnabled ? '' : 'cursor-not-allowed'}`}
                        >
                          <span className="font-semibold text-[#191919]">{team.name || 'Team'}</span>
                          <span className="text-xs text-[#4a4a4a]">{count} fees</span>
                        </button>
                      )
                    })}
                    {unassignedCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!growthReportsEnabled) return
                          setActiveFeeTeam({ id: 'unassigned', name: 'Unassigned' })
                          setActiveFeeStatus('paid')
                        }}
                        className={`flex w-full items-center justify-between rounded-2xl border border-[#e5e5e5] px-4 py-3 text-left text-sm ${growthReportsEnabled ? '' : 'cursor-not-allowed'}`}
                      >
                        <span className="font-semibold text-[#191919]">Unassigned</span>
                        <span className="text-xs text-[#4a4a4a]">{unassignedCount} fees</span>
                      </button>
                    ) : null}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}
      {showFeesUnpaidModal && (
        <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-24">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Fees unpaid</p>
                <p className="text-lg font-semibold text-[#191919]">Teams and totals</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowFeesUnpaidModal(false)
                  setActiveFeeTeam(null)
                  setActiveFeeStatus(null)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {!growthReportsEnabled ? (
              <div className="mt-4 rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                Upgrade to Growth to drill into fee assignments and export CSVs.
              </div>
            ) : null}
            <div className="mt-4 space-y-2">
              {(() => {
                const assignmentsByTeam = feeAssignmentsByStatus.unpaid
                const teamsWithFees = teamsForDisplay.filter((team) => (assignmentsByTeam.get(team.id) || []).length > 0)
                const unassignedCount = assignmentsByTeam.get('unassigned')?.length || 0
                if (teamsWithFees.length === 0 && unassignedCount === 0) {
                  return <p className="text-xs text-[#4a4a4a]">No unpaid fees yet.</p>
                }
                return (
                  <>
                    {teamsWithFees.map((team) => {
                      const count = assignmentsByTeam.get(team.id)?.length || 0
                      return (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => {
                            if (!growthReportsEnabled) return
                            setActiveFeeTeam(team)
                            setActiveFeeStatus('unpaid')
                          }}
                          className={`flex w-full items-center justify-between rounded-2xl border border-[#e5e5e5] px-4 py-3 text-left text-sm ${growthReportsEnabled ? '' : 'cursor-not-allowed'}`}
                        >
                          <span className="font-semibold text-[#191919]">{team.name || 'Team'}</span>
                          <span className="text-xs text-[#4a4a4a]">{count} fees</span>
                        </button>
                      )
                    })}
                    {unassignedCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!growthReportsEnabled) return
                          setActiveFeeTeam({ id: 'unassigned', name: 'Unassigned' })
                          setActiveFeeStatus('unpaid')
                        }}
                        className={`flex w-full items-center justify-between rounded-2xl border border-[#e5e5e5] px-4 py-3 text-left text-sm ${growthReportsEnabled ? '' : 'cursor-not-allowed'}`}
                      >
                        <span className="font-semibold text-[#191919]">Unassigned</span>
                        <span className="text-xs text-[#4a4a4a]">{unassignedCount} fees</span>
                      </button>
                    ) : null}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}
      {activeFeeTeam && activeFeeStatus && growthReportsEnabled && (
        <div className="fixed inset-0 z-[310] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-24">
          <div className="w-full max-w-4xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">
                  {activeFeeStatus === 'paid' ? 'Fees paid' : 'Fees unpaid'}
                </p>
                <p className="text-lg font-semibold text-[#191919]">{activeFeeTeam.name || 'Team'}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveFeeTeam(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Total</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(feeSummary.total)}</p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Assignments</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{feeSummary.count}</p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Avg fee</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">
                    {feeSummary.count ? formatCurrency(feeSummary.avg) : '—'}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Last payment</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">
                    {feeSummary.lastPayment ? formatSessionDateTime(feeSummary.lastPayment) : '—'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={feeSearch}
                  onChange={(event) => setFeeSearch(event.target.value)}
                  placeholder="Search name or fee"
                  className="w-full rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919] md:w-[200px]"
                />
                <select
                  value={feeTeamFilter}
                  onChange={(event) => setFeeTeamFilter(event.target.value)}
                  className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                >
                  <option value="all">All teams</option>
                  {teamsForDisplay.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name || 'Team'}
                    </option>
                  ))}
                  <option value="unassigned">Unassigned</option>
                </select>
                <select
                  value={feeTypeFilter}
                  onChange={(event) => setFeeTypeFilter(event.target.value)}
                  className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                >
                  <option value="all">All fee types</option>
                  {feeTypeOptions.map((feeType) => (
                    <option key={feeType} value={feeType}>
                      {feeType}
                    </option>
                  ))}
                </select>
                <select
                  value={feeDueMonthFilter}
                  onChange={(event) => setFeeDueMonthFilter(event.target.value)}
                  className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                >
                  <option value="all">All due months</option>
                  {feeDueMonthOptions.map((month) => (
                    <option key={month.key} value={month.key}>
                      {month.label}
                    </option>
                  ))}
                </select>
                <select
                  value={feeStatusFilter}
                  onChange={(event) => setFeeStatusFilter(event.target.value as 'all' | 'paid' | 'unpaid')}
                  className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                >
                  <option value="all">All statuses</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>
                <select
                  value={feeSort}
                  onChange={(event) => setFeeSort(event.target.value)}
                  className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                >
                  <option value="amount-desc">Amount (high to low)</option>
                  <option value="amount-asc">Amount (low to high)</option>
                  <option value="due-date">Due date</option>
                  <option value="name">Name</option>
                  <option value="fee">Fee name</option>
                </select>
                <button
                  type="button"
                  onClick={exportFeeView}
                  disabled={!exportFullEnabled}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] disabled:opacity-50"
                >
                  Go to export center
                </button>
              </div>
              {(feeStatusFilter === 'unpaid' || (feeStatusFilter === 'all' && activeFeeStatus === 'unpaid')) ? (
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Aging (days overdue)</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#4a4a4a]">
                    <span>0-30: {unpaidAging.days0to30}</span>
                    <span>31-60: {unpaidAging.days31to60}</span>
                    <span>61-90: {unpaidAging.days61to90}</span>
                    <span>90+: {unpaidAging.days90plus}</span>
                  </div>
                </div>
              ) : null}
              <div className="space-y-3">
                {feeGroups.length === 0 ? (
                  <p className="text-xs text-[#4a4a4a]">No fee assignments found.</p>
                ) : (
                  feeGroups.map((group) => {
                    const isExpanded = expandedFeeGroups[group.key] ?? true
                    return (
                      <div key={group.key} className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedFeeGroups((prev) => ({
                              ...prev,
                              [group.key]: !(prev[group.key] ?? true),
                            }))
                          }
                          className="flex w-full items-center justify-between text-left"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[#191919]">{group.title}</p>
                            <p className="text-xs text-[#4a4a4a]">
                              {group.count} assignments · {formatCurrency(group.total)}
                              {group.dueLabel ? ` · Due ${group.dueLabel}` : ''}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-[#4a4a4a]">{isExpanded ? '-' : '+'}</span>
                        </button>
                        {isExpanded ? (
                          <div className="mt-3 space-y-3">
                            {group.items.map((item, index) => {
                              const role = String(item.assignee?.role || '').toLowerCase()
                              const assigneeLabel = role === 'assistant_coach'
                                ? 'Assistant coach'
                                : role === 'coach'
                                  ? 'Coach'
                                  : role === 'athlete'
                                    ? 'Athlete'
                                    : 'Member'
                              const issuedLabel = formatMonthLabel(item.assignment.created_at || item.fee?.created_at)
                              const dueLabel = formatMonthLabel(item.fee?.due_date || item.assignment.created_at)
                              const paidLabel = formatMonthLabel(item.assignment.paid_at)
                              const status = String(item.assignment.status || '').toLowerCase()
                              const isOverdue = status === 'unpaid' && item.dueDateValue
                                ? new Date(item.dueDateValue) < new Date()
                                : false
                              return (
                                <div
                                  key={`${group.key}-${item.assignment.athlete_id || index}`}
                                  className="rounded-2xl border border-[#f0f0f0] px-4 py-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-[#191919]">
                                        {assigneeLabel}: {item.assigneeName}
                                      </p>
                                      <p className="text-xs text-[#4a4a4a]">
                                        {item.assignee?.email || 'No email listed'}
                                      </p>
                                    </div>
                                    <span className="text-sm font-semibold text-[#191919]">
                                      {formatCurrency(item.feeAmount)}
                                    </span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">
                                    <span className="rounded-full border border-[#e5e5e5] px-2 py-0.5">
                                      Issued {issuedLabel}
                                    </span>
                                    <span className="rounded-full border border-[#e5e5e5] px-2 py-0.5">
                                      {status === 'paid' ? `Paid ${paidLabel}` : `Due ${dueLabel}`}
                                    </span>
                                    {isOverdue ? (
                                      <span className="rounded-full border border-[#b80f0a] px-2 py-0.5 text-[#b80f0a]">
                                        Overdue
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {status === 'unpaid' ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => setToast('Reminder sent')}
                                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                                        >
                                          Send reminder
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setToast('Marked as paid')}
                                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                                        >
                                          Mark paid
                                        </button>
                                      </>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => setToast('Fee details opened')}
                                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                                    >
                                      View fee details
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {showCoachesModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coaches</p>
                <p className="text-lg font-semibold text-[#191919]">Teams and coaches</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCoachesModal(false)
                  setActiveCoachTeam(null)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {!growthReportsEnabled ? (
              <div className="mt-4 rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                Upgrade to Growth to drill into coach assignments by team.
              </div>
            ) : !enterpriseReportsEnabled ? (
              <div className="mt-4 rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                Enterprise adds availability, compliance, and performance insights.
              </div>
            ) : null}
            <div className="mt-4 space-y-2">
              {teamsForDisplay.length === 0 ? (
                <p className="text-xs text-[#4a4a4a]">No teams yet.</p>
              ) : (
                teamsForDisplay.map((team) => {
                  const coach = coachByTeam.get(team.id)
                  const assistants = assistantCoachesByTeam.get(team.id) || []
                  const coachCount = (coach ? 1 : 0) + assistants.length
                  const coachNames = [coach, ...assistants]
                    .filter(Boolean)
                    .map((person) => person?.full_name || person?.email || 'Coach')
                    .join(', ')
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => {
                        if (!growthReportsEnabled) return
                        setActiveCoachTeam(team)
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl border border-[#e5e5e5] px-4 py-3 text-left text-sm ${growthReportsEnabled ? '' : 'cursor-not-allowed'}`}
                    >
                      <div>
                        <span className="font-semibold text-[#191919]">{team.name || 'Team'}</span>
                        {!growthReportsEnabled ? (
                          <p className="mt-1 text-xs text-[#4a4a4a]">{coachNames || 'No coaches assigned'}</p>
                        ) : null}
                      </div>
                      <span className="text-xs text-[#4a4a4a]">
                        {coachCount} {coachCount === 1 ? 'coach' : 'coaches'}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
      {activeCoachTeam && growthReportsEnabled && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coaches</p>
                <p className="text-lg font-semibold text-[#191919]">{activeCoachTeam.name || 'Team'}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveCoachTeam(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {(() => {
                const coach = coachByTeam.get(activeCoachTeam.id)
                const assistants = assistantCoachesByTeam.get(activeCoachTeam.id) || []
                if (!coach && assistants.length === 0) {
                  return <p className="text-xs text-[#4a4a4a]">No coaches assigned.</p>
                }
                const roleLabel = String(coach?.role || '').toLowerCase() === 'assistant_coach'
                  ? 'Assistant coach'
                  : 'Head coach'
                const resolveCoachMetrics = (coachId?: string | null) => {
                  if (!coachId) {
                    return {
                      recentCount: 0,
                      lastSession: null as string | null,
                      attendanceRate: null as number | null,
                      teamsLabel: 'No teams assigned',
                      availability: 'Not set',
                      compliance: 'Not tracked',
                      performance: 'Not set',
                    }
                  }
                  const metrics = coachMetricsById.get(coachId)
                  const attendanceRate = metrics?.attendanceMarked
                    ? Math.round((metrics.attendancePresent / metrics.attendanceMarked) * 100)
                    : null
                  const teams = coachTeamsById.get(coachId) || []
                  const teamsLabel = teams.length
                    ? teams
                        .map((team) => {
                          const rosterCount = (athletesByTeam.get(team.id) || []).length
                          return `${team.name || 'Team'} (${rosterCount})`
                        })
                        .join(', ')
                    : 'No teams assigned'
                  return {
                    recentCount: metrics?.recentCount || 0,
                    lastSession: metrics?.lastSession || null,
                    attendanceRate,
                    teamsLabel,
                    availability: 'Not set',
                    compliance: 'Not tracked',
                    performance: 'Not set',
                  }
                }
                const renderCoachCard = (person: ProfileRow, label: string) => {
                  const details = resolveCoachMetrics(person.id)
                  return (
                    <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                      <p className="text-sm font-semibold text-[#191919]">
                        {person.full_name || person.email || 'Coach'}{' '}
                        <span className="text-xs font-semibold text-[#4a4a4a]">· {label}</span>
                      </p>
                      <p className="text-xs text-[#4a4a4a]">{person.email || 'No email listed'}</p>
                      <p className="mt-2 text-xs text-[#4a4a4a]">
                        Activity: {details.recentCount} sessions (30d) · Last:{' '}
                        {details.lastSession ? formatSessionDateTime(details.lastSession) : '—'}
                      </p>
                      <p className="text-xs text-[#4a4a4a]">Team coverage: {details.teamsLabel}</p>
                      <p className="text-xs text-[#4a4a4a]">
                        Attendance avg: {details.attendanceRate !== null ? `${details.attendanceRate}%` : '—'}
                      </p>
                      {enterpriseReportsEnabled ? (
                        <>
                          <p className="text-xs text-[#4a4a4a]">Availability: {details.availability}</p>
                          <p className="text-xs text-[#4a4a4a]">Compliance: {details.compliance}</p>
                          <p className="text-xs text-[#4a4a4a]">Performance: {details.performance}</p>
                        </>
                      ) : null}
                    </div>
                  )
                }
                return (
                  <div className="space-y-2">
                    {coach ? renderCoachCard(coach, roleLabel) : null}
                    {assistants.length > 0
                      ? assistants.map((assistant) => renderCoachCard(assistant, 'Assistant coach'))
                      : <p className="text-xs text-[#4a4a4a]">No assistant coaches assigned.</p>}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
      {showAthletesModal && (
        <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-24">
          <div className="w-full max-w-3xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athletes</p>
                <p className="text-lg font-semibold text-[#191919]">Teams and rosters</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAthletesModal(false)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Roster summary</p>
                <p className="mt-2 text-sm text-[#4a4a4a]">
                  {athleteRosterSummary.total} athletes · {athleteRosterSummary.active} active ·{' '}
                  {athleteRosterSummary.withDues} with dues
                </p>
              </div>
              {!growthReportsEnabled ? (
                <div className="rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                  Upgrade to Growth to unlock athlete filters, search, and roster insights.
                </div>
              ) : null}
              {growthReportsEnabled ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={athleteSearch}
                    onChange={(event) => setAthleteSearch(event.target.value)}
                    placeholder="Search athletes"
                    className="w-full rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919] md:w-[200px]"
                  />
                  <select
                    value={athleteTeamFilter}
                    onChange={(event) => setAthleteTeamFilter(event.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    <option value="all">All teams</option>
                    {teamsForDisplay.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name || 'Team'}
                      </option>
                    ))}
                  </select>
                  <select
                    value={athleteStatusFilter}
                    onChange={(event) => setAthleteStatusFilter(event.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <select
                    value={athleteYearFilter}
                    onChange={(event) => setAthleteYearFilter(event.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    <option value="all">Levels (based on roster)</option>
                    {athleteYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="space-y-3">
                {teamsForDisplay.length === 0 ? (
                  <p className="text-xs text-[#4a4a4a]">No teams yet.</p>
                ) : (
                  teamsForDisplay
                    .filter((team) => athleteTeamFilter === 'all' || team.id === athleteTeamFilter)
                    .map((team) => {
                      const athletes = athletesByTeam.get(team.id) || []
                      const filteredAthletes = athletes.filter((athleteId) => {
                        const profile = profilesForDisplay[athleteId]
                        const metrics = athleteMetricsById.get(athleteId)
                        const searchValue = athleteSearch.trim().toLowerCase()
                        if (searchValue) {
                          const name = `${profile?.full_name || ''} ${profile?.email || ''}`.toLowerCase()
                          if (!name.includes(searchValue)) return false
                        }
                        if (athleteStatusFilter !== 'all') {
                          const isActive = Boolean(metrics?.active)
                          if (athleteStatusFilter === 'active' && !isActive) return false
                          if (athleteStatusFilter === 'inactive' && isActive) return false
                        }
                        if (athleteYearFilter !== 'all') {
                          if (!metrics?.year || metrics.year !== athleteYearFilter) return false
                        }
                        return true
                      })
                      if (filteredAthletes.length === 0) return null
                      const isExpanded = expandedTeams[team.id] ?? true
                      return (
                        <div key={team.id} className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTeams((prev) => ({
                                ...prev,
                                [team.id]: !(prev[team.id] ?? true),
                              }))
                            }
                            className="flex w-full items-center justify-between text-left"
                          >
                            <div>
                              <p className="text-sm font-semibold text-[#191919]">{team.name || 'Team'}</p>
                              <p className="text-xs text-[#4a4a4a]">{filteredAthletes.length} athletes</p>
                            </div>
                            <span className="text-sm font-semibold text-[#4a4a4a]">{isExpanded ? '-' : '+'}</span>
                          </button>
                          {isExpanded ? (
                            <div className="mt-3 space-y-3">
                              {filteredAthletes.map((athleteId) => {
                                const athlete = profilesForDisplay[athleteId]
                                const metrics = athleteMetricsById.get(athleteId)
                                const name = athlete?.full_name || athlete?.email || 'Athlete'
                                const slug = slugify(name.trim() || 'athlete')
                                const statusLabel = metrics?.active ? 'Active' : 'Inactive'
                                const attendanceLabel = metrics?.attendanceRate !== null && metrics?.attendanceRate !== undefined
                                  ? `Attendance ${metrics.attendanceRate}%`
                                  : 'Attendance —'
                                const duesLabel = metrics?.duesOwed
                                  ? `${metrics.duesOwed} dues`
                                  : 'No dues'
                                const yearLabel = metrics?.year || ''
                                return (
                                  <div
                                    key={athleteId}
                                    className="rounded-2xl border border-[#f0f0f0] px-4 py-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-[#191919]">{name}</p>
                                      <p className="text-xs text-[#4a4a4a]">{athlete?.email || 'No email listed'}</p>
                                      {!growthReportsEnabled ? (
                                        <p className="text-xs text-[#4a4a4a]">{statusLabel}</p>
                                      ) : null}
                                    </div>
                                    {growthReportsEnabled ? (
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full border border-[#e5e5e5] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">
                                          {statusLabel}
                                        </span>
                                        <span className="rounded-full border border-[#e5e5e5] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">
                                          {duesLabel}
                                        </span>
                                        <span className="rounded-full border border-[#e5e5e5] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">
                                          {attendanceLabel}
                                        </span>
                                        {yearLabel ? (
                                          <span className="rounded-full border border-[#e5e5e5] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">
                                            {yearLabel}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                  {growthReportsEnabled ? (
                                    <p className="mt-2 text-xs text-[#4a4a4a]">
                                      Last session: {metrics?.lastSession ? formatSessionDateTime(metrics.lastSession) : '—'} · Next
                                      session: {metrics?.nextSession ? formatSessionDateTime(metrics.nextSession) : '—'}
                                    </p>
                                  ) : null}
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <Link
                                      href={`/athlete/profiles/${slug}?${new URLSearchParams({ id: athleteId || '', name: name || '' }).toString()}`}
                                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                                    >
                                      View profile
                                    </Link>
                                    {growthReportsEnabled ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => setToast('Message composer opened')}
                                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                                        >
                                          Message
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setToast('Note added')}
                                          className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                                        >
                                          Add note
                                        </button>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              )
                            })}
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {activeAthleteTeam && growthReportsEnabled && (
        <div className="fixed inset-0 z-[310] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-24">
          <div className="w-full max-w-2xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athletes</p>
                <p className="text-lg font-semibold text-[#191919]">{activeAthleteTeam.name || 'Team'}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveAthleteTeam(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {(() => {
                const athleteIds = athletesByTeam.get(activeAthleteTeam.id) || []
                if (athleteIds.length === 0) {
                  return <p className="text-xs text-[#4a4a4a]">No athletes assigned.</p>
                }
                return athleteIds.map((athleteId) => {
                  const athlete = profilesForDisplay[athleteId]
                  const name = athlete?.full_name || athlete?.email || 'Athlete'
                  const slug = slugify(name.trim() || 'athlete')
                  return (
                    <div
                      key={athleteId}
                      className="flex items-center justify-between rounded-2xl border border-[#e5e5e5] px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#191919]">{name}</p>
                        <p className="text-xs text-[#4a4a4a]">{athlete?.email || 'No email listed'}</p>
                      </div>
                      <Link
                        href={`/athlete/profiles/${slug}?${new URLSearchParams({ id: athleteId || '', name: name || '' }).toString()}`}
                        className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      >
                        View profile
                      </Link>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}
      {showRevenueModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Gross revenue</p>
                <p className="text-lg font-semibold text-[#191919]">Monthly breakdown</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRevenueModal(false)
                  setActiveRevenueMonth(null)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {!growthReportsEnabled ? (
                <div className="rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                  Upgrade to Growth to unlock filters, drill-downs, and revenue source detail.
                </div>
              ) : !enterpriseReportsEnabled ? (
                <div className="rounded-2xl border border-[#f2d2d2] bg-[#fff5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                  Enterprise adds revenue attribution, payout estimates, and trend sparklines.
                </div>
              ) : null}
              {growthReportsEnabled ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={revenueTimeframe}
                    onChange={(event) => setRevenueTimeframe(event.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    <option value="3m">Last 3 months</option>
                    <option value="6m">Last 6 months</option>
                    <option value="12m">Last 12 months</option>
                    <option value="all">All time</option>
                  </select>
                  <select
                    value={revenueSourceFilter}
                    onChange={(event) => setRevenueSourceFilter(event.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    <option value="all">All sources</option>
                    <option value="orders">Marketplace orders</option>
                    <option value="fees">Org fees</option>
                  </select>
                  <select
                    value={revenueTeamFilter}
                    onChange={(event) => setRevenueTeamFilter(event.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    <option value="all">All teams</option>
                    {teamsForDisplay.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name || 'Team'}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Total</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(revenueSummary.total)}</p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Orders</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(revenueSummary.ordersTotal)}</p>
                  <p className="text-xs text-[#4a4a4a]">{revenueSummary.ordersCount} orders</p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Fees</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">{formatCurrency(revenueSummary.feesTotal)}</p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Avg order value</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">
                    {revenueSummary.ordersCount ? formatCurrency(revenueSummary.avgOrderValue) : '—'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {revenueMonthsFiltered.length === 0 ? (
                  <p className="text-xs text-[#4a4a4a]">No revenue recorded yet.</p>
                ) : (
                  revenueMonthsFiltered.map((month, index) => {
                    const monthValue = revenueValueByKey.get(month.key) || 0
                    const prevMonth = revenueMonthsFiltered[index + 1]
                    const prevValue = prevMonth ? revenueValueByKey.get(prevMonth.key) || 0 : 0
                    const change = prevValue ? ((monthValue - prevValue) / prevValue) * 100 : null
                    const changeLabel = change !== null ? `${change > 0 ? '+' : ''}${Math.round(change)}%` : '—'
                    const chronoIndex = revenueMonthsChrono.findIndex((item) => item.key === month.key)
                    const slice = chronoIndex === -1
                      ? [monthValue]
                      : revenueMonthsChrono
                          .slice(Math.max(0, chronoIndex - 5), chronoIndex + 1)
                          .map((item) => revenueValueByKey.get(item.key) || 0)
                    const sparklinePoints = buildSparklinePoints(slice)
                    const monthContent = (
                      <>
                        <div>
                          <span className="font-semibold text-[#191919]">{month.label}</span>
                          <p className="text-xs text-[#4a4a4a]">{formatCurrency(monthValue)}</p>
                          {!enterpriseReportsEnabled && growthReportsEnabled ? (
                            <p className="text-xs text-[#4a4a4a]">
                              Orders {month.ordersCount} · Fees {month.feesCount}
                            </p>
                          ) : null}
                        </div>
                        {enterpriseReportsEnabled ? (
                          <div className="flex items-center gap-3 text-xs text-[#4a4a4a]">
                            <span>{changeLabel} vs prior</span>
                            <svg width="60" height="20" viewBox="0 0 60 20" aria-hidden="true">
                              <polyline
                                points={sparklinePoints}
                                fill="none"
                                stroke="#b80f0a"
                                strokeWidth="2"
                              />
                            </svg>
                          </div>
                        ) : null}
                      </>
                    )
                    return growthReportsEnabled ? (
                      <button
                        key={month.key}
                        type="button"
                        onClick={() => setActiveRevenueMonth(month)}
                        className="flex w-full items-center justify-between rounded-2xl border border-[#e5e5e5] px-4 py-3 text-left text-sm"
                      >
                        {monthContent}
                      </button>
                    ) : (
                      <div
                        key={month.key}
                        className="flex w-full items-center justify-between rounded-2xl border border-[#e5e5e5] px-4 py-3 text-left text-sm"
                      >
                        {monthContent}
                      </div>
                    )
                  })
                )}
              </div>
              {growthReportsEnabled ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={exportRevenueCsv}
                    disabled={!exportFullEnabled}
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] disabled:opacity-50"
                  >
                    Go to export center
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {activeRevenueMonth && growthReportsEnabled && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Revenue sources</p>
                <p className="text-lg font-semibold text-[#191919]">{activeRevenueMonth.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveRevenueMonth(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#191919] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Gross</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">
                    {formatCurrency(
                      activeRevenueDetails
                        ? activeRevenueDetails.ordersTotal + activeRevenueDetails.feesTotal
                        : activeRevenueMonth.total,
                    )}
                  </p>
                </div>
                {enterpriseReportsEnabled ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Estimated payout</p>
                    <p className="mt-2 text-lg font-semibold text-[#191919]">
                      {activeRevenueDetails
                        ? formatCurrency(activeRevenueDetails.payout)
                        : formatCurrency(activeRevenueMonth.total)}
                    </p>
                    {activeRevenueDetails ? (
                      <p className="text-xs text-[#4a4a4a]">
                        Processing est. {formatCurrency(activeRevenueDetails.processingFee)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Marketplace orders</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">
                    {formatCurrency(activeRevenueDetails?.ordersTotal ?? activeRevenueMonth.ordersTotal)}
                  </p>
                  <p className="text-xs text-[#4a4a4a]">{activeRevenueMonth.ordersCount} orders</p>
                </div>
                <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Org fees</p>
                  <p className="mt-2 text-lg font-semibold text-[#191919]">
                    {formatCurrency(activeRevenueDetails?.feesTotal ?? activeRevenueMonth.feesTotal)}
                  </p>
                  <p className="text-xs text-[#4a4a4a]">{activeRevenueMonth.feesCount} payments</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {enterpriseReportsEnabled && revenueSourceFilter !== 'fees' ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Top products</p>
                    {activeRevenueDetails?.topProducts.length ? (
                      <div className="mt-2 space-y-1 text-xs text-[#4a4a4a]">
                        {activeRevenueDetails.topProducts.map((product) => (
                          <div key={product.title} className="flex items-center justify-between">
                            <span className="font-semibold text-[#191919]">{product.title}</span>
                            <span>{formatCurrency(product.total)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[#4a4a4a]">No product sales yet.</p>
                    )}
                  </div>
                ) : null}
                {enterpriseReportsEnabled && revenueSourceFilter !== 'orders' ? (
                  <div className="rounded-2xl border border-[#e5e5e5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Top fees</p>
                    {activeRevenueDetails?.topFees.length ? (
                      <div className="mt-2 space-y-1 text-xs text-[#4a4a4a]">
                        {activeRevenueDetails.topFees.map((fee) => (
                          <div key={fee.title} className="flex items-center justify-between">
                            <span className="font-semibold text-[#191919]">{fee.title}</span>
                            <span>{formatCurrency(fee.total)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[#4a4a4a]">No fee payments yet.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setShowRevenueDetailsDrawer((prev) => !prev)}
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
              >
                {showRevenueDetailsDrawer ? 'Hide details' : 'View details'}
              </button>
              {showRevenueDetailsDrawer && activeRevenueDetails ? (
                <div className="space-y-3 rounded-2xl border border-[#e5e5e5] px-4 py-3">
                  {revenueSourceFilter !== 'fees' ? (
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Orders</p>
                      {activeRevenueDetails.ordersForMonth.length === 0 ? (
                        <p className="mt-2 text-xs text-[#4a4a4a]">No orders recorded.</p>
                      ) : (
                        <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                          {activeRevenueDetails.ordersForMonth.map((order) => {
                            const value = Number(order.amount ?? order.total ?? order.price ?? 0)
                            const name = order.product_id
                              ? productsByIdForDisplay[order.product_id]?.title || 'Product'
                              : 'Product'
                            return (
                              <div key={order.id || `${name}-${order.created_at}`} className="flex items-center justify-between">
                                <span className="font-semibold text-[#191919]">{name}</span>
                                <span>
                                  {formatCurrency(Number.isFinite(value) ? value : 0)} · {formatSessionDateTime(order.created_at)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                  {revenueSourceFilter !== 'orders' ? (
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Fee payments</p>
                      {activeRevenueDetails.feePaymentsForMonth.length === 0 ? (
                        <p className="mt-2 text-xs text-[#4a4a4a]">No fee payments recorded.</p>
                      ) : (
                        <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                          {activeRevenueDetails.feePaymentsForMonth.map((assignment, index) => {
                            const fee = assignment.fee_id ? feeById.get(assignment.fee_id) : null
                            const amount = fee ? Number(fee.amount_cents || 0) / 100 : 0
                            const payer = assignment.athlete_id ? profilesForDisplay[assignment.athlete_id] : null
                            const name = payer?.full_name || payer?.email || 'Member'
                            return (
                              <div key={`${assignment.fee_id || 'fee'}-${index}`} className="flex items-center justify-between">
                                <span className="font-semibold text-[#191919]">
                                  {fee?.title || 'Fee'} · {name}
                                </span>
                                <span>
                                  {formatCurrency(amount)} · {formatSessionDateTime(assignment.paid_at || assignment.created_at)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {showScheduleModal && (
        <div
          className="fixed inset-0 z-[310] flex items-center justify-center bg-black/40 px-4 py-24"
          onClick={() => setShowScheduleModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Scheduled reports</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">Configure delivery</p>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-3 rounded-2xl border border-[#e5e5e5] px-4 py-3 text-xs">
                <input
                  type="checkbox"
                  checked={scheduleForm.enabled}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                />
                <span className="text-sm font-semibold text-[#191919]">Enable scheduled reports</span>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={scheduleForm.cadence}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, cadence: event.target.value }))}
                  className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                {scheduleForm.cadence === 'weekly' ? (
                  <select
                    value={scheduleForm.dayOfWeek}
                    onChange={(event) => setScheduleForm((prev) => ({ ...prev, dayOfWeek: event.target.value }))}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    <option value="0">Sunday</option>
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                  </select>
                ) : (
                  <select
                    value={scheduleForm.dayOfMonth}
                    onChange={(event) => setScheduleForm((prev) => ({ ...prev, dayOfMonth: event.target.value }))}
                    className="rounded-full border border-[#dcdcdc] bg-white px-4 py-2 text-xs text-[#191919]"
                  >
                    {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                      <option key={day} value={day}>{`Day ${day}`}</option>
                    ))}
                  </select>
                )}
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-[#e5e5e5] px-4 py-3 text-xs">
                <span className="text-[10px] uppercase tracking-[0.3em] text-[#4a4a4a]">Send at</span>
                <input
                  type="time"
                  value={scheduleForm.timeOfDay}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, timeOfDay: event.target.value }))}
                  className="text-xs text-[#191919] focus:outline-none"
                />
              </label>
              <label className="block rounded-2xl border border-[#e5e5e5] px-4 py-3 text-xs text-[#4a4a4a]">
                <span className="text-[10px] uppercase tracking-[0.3em]">Recipients</span>
                <input
                  type="text"
                  value={scheduleForm.recipients}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, recipients: event.target.value }))}
                  placeholder="director@org.com, ops@org.com"
                  className="mt-2 w-full text-sm text-[#191919] focus:outline-none"
                />
              </label>
              {scheduleNotice ? <p className="text-xs text-[#b80f0a]">{scheduleNotice}</p> : null}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="rounded-full border border-[#dcdcdc] px-4 py-2 text-xs font-semibold text-[#4a4a4a]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  disabled={scheduleSaving}
                  className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                >
                  {scheduleSaving ? 'Saving...' : 'Save schedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {explainMetric && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 px-4 py-24"
          onClick={() => setExplainMetric(null)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Explain</p>
                <p className="mt-2 text-lg font-semibold text-[#191919]">{explainMetric.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setExplainMetric(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="mt-4 text-sm text-[#4a4a4a]">{explainMetric.body}</p>
          </div>
        </div>
      )}
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
