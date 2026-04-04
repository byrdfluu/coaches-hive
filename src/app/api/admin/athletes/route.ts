import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAdminAccess } from '@/lib/adminRoles'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const requireAdmin = async () => {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { error: jsonError('Unauthorized', 401), session: null as any }
  }

  if (!resolveAdminAccess(session.user.user_metadata).isAdmin) {
    return { error: jsonError('Forbidden', 403), session: null as any }
  }

  return { error: null, session }
}

const toMap = <T extends { id: string }>(rows: T[] = []) =>
  rows.reduce<Record<string, T>>((acc, row) => {
    acc[row.id] = row
    return acc
  }, {})

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const { data: athleteProfiles, error: athleteError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, guardian_name, guardian_email, guardian_phone, role, created_at')
    .eq('role', 'athlete')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (athleteError) {
    return jsonError(athleteError.message, 500)
  }

  const athletes = athleteProfiles || []
  const athleteIds = athletes.map((row) => row.id)

  const { data: usersData } = await supabaseAdmin.auth.admin.listUsers()
  const userMap = toMap(
    (usersData?.users || []).map((user) => ({
      id: user.id,
      suspended: Boolean(user.user_metadata?.suspended),
    })),
  )

  const { data: guardianLinksRows } = athleteIds.length
    ? await supabaseAdmin
        .from('guardian_athlete_links')
        .select('id, guardian_user_id, athlete_id, relationship, status, updated_at')
        .in('athlete_id', athleteIds)
        .eq('status', 'active')
    : { data: [] }

  const guardianUserIds = Array.from(new Set((guardianLinksRows || []).map((row) => row.guardian_user_id).filter(Boolean)))
  const { data: guardianProfiles } = guardianUserIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', guardianUserIds)
    : { data: [] }

  const guardianProfileMap = toMap((guardianProfiles || []) as Array<{ id: string; full_name?: string | null; email?: string | null }>)

  const linksByAthlete = new Map<string, Array<any>>()
  ;(guardianLinksRows || []).forEach((link) => {
    const existing = linksByAthlete.get(link.athlete_id) || []
    existing.push(link)
    linksByAthlete.set(link.athlete_id, existing)
  })

  const { data: approvalRows } = athleteIds.length
    ? await supabaseAdmin
        .from('guardian_approvals')
        .select('id, athlete_id, status, scope, target_type, target_label, created_at')
        .in('athlete_id', athleteIds)
        .order('created_at', { ascending: false })
        .limit(10000)
    : { data: [] }

  const approvalsByAthlete = new Map<string, Array<any>>()
  ;(approvalRows || []).forEach((row) => {
    const existing = approvalsByAthlete.get(row.athlete_id) || []
    existing.push(row)
    approvalsByAthlete.set(row.athlete_id, existing)
  })

  const { data: sessionRows } = athleteIds.length
    ? await supabaseAdmin
        .from('sessions')
        .select('athlete_id, start_time, attendance_status')
        .in('athlete_id', athleteIds)
        .limit(20000)
    : { data: [] }

  const sessionsByAthlete = new Map<string, Array<any>>()
  ;(sessionRows || []).forEach((row) => {
    const existing = sessionsByAthlete.get(row.athlete_id) || []
    existing.push(row)
    sessionsByAthlete.set(row.athlete_id, existing)
  })

  const { data: sessionPaymentRows } = athleteIds.length
    ? await supabaseAdmin
        .from('session_payments')
        .select('athlete_id, amount, status, paid_at, created_at')
        .in('athlete_id', athleteIds)
        .limit(20000)
    : { data: [] }

  const feeAssignmentRows = athleteIds.length
    ? await supabaseAdmin
        .from('org_fee_assignments')
        .select('athlete_id, fee_id, status, paid_at, created_at')
        .in('athlete_id', athleteIds)
        .eq('status', 'paid')
        .limit(10000)
    : { data: [] as any[] }

  const feeIds = Array.from(new Set((feeAssignmentRows.data || []).map((row) => row.fee_id).filter(Boolean)))
  const { data: feeRows } = feeIds.length
    ? await supabaseAdmin.from('org_fees').select('id, amount_cents').in('id', feeIds)
    : { data: [] }
  const feeMap = toMap((feeRows || []) as Array<{ id: string; amount_cents?: number | null }>)

  const paymentsByAthlete = new Map<string, Array<{ amount: number; paid_at?: string | null; created_at?: string | null }>>()
  ;(sessionPaymentRows || []).forEach((row) => {
    if (String(row.status || '').toLowerCase() !== 'paid') return
    const existing = paymentsByAthlete.get(row.athlete_id) || []
    existing.push({
      amount: Number(row.amount || 0),
      paid_at: row.paid_at || null,
      created_at: row.created_at || null,
    })
    paymentsByAthlete.set(row.athlete_id, existing)
  })
  ;(feeAssignmentRows.data || []).forEach((row) => {
    const feeAmount = Number((feeMap[row.fee_id]?.amount_cents || 0) / 100)
    const existing = paymentsByAthlete.get(row.athlete_id) || []
    existing.push({
      amount: feeAmount,
      paid_at: row.paid_at || null,
      created_at: row.created_at || null,
    })
    paymentsByAthlete.set(row.athlete_id, existing)
  })

  const { data: membershipRows } = athleteIds.length
    ? await supabaseAdmin
        .from('organization_memberships')
        .select('user_id, org_id, role')
        .in('user_id', athleteIds)
    : { data: [] }

  const { data: teamRows } = athleteIds.length
    ? await supabaseAdmin
        .from('org_team_members')
        .select('athlete_id, team_id')
        .in('athlete_id', athleteIds)
    : { data: [] }

  const orgsByAthlete = new Map<string, Set<string>>()
  ;(membershipRows || []).forEach((row) => {
    if (row.role !== 'athlete') return
    const set = orgsByAthlete.get(row.user_id) || new Set<string>()
    if (row.org_id) set.add(row.org_id)
    orgsByAthlete.set(row.user_id, set)
  })

  const teamsByAthlete = new Map<string, Set<string>>()
  ;(teamRows || []).forEach((row) => {
    const set = teamsByAthlete.get(row.athlete_id) || new Set<string>()
    if (row.team_id) set.add(row.team_id)
    teamsByAthlete.set(row.athlete_id, set)
  })

  const { data: participantRows } = athleteIds.length
    ? await supabaseAdmin
        .from('thread_participants')
        .select('thread_id, user_id')
        .in('user_id', athleteIds)
        .limit(20000)
    : { data: [] }

  const threadToAthlete = new Map<string, string[]>()
  ;(participantRows || []).forEach((row) => {
    const existing = threadToAthlete.get(row.thread_id) || []
    existing.push(row.user_id)
    threadToAthlete.set(row.thread_id, existing)
  })

  const threadIds = Array.from(threadToAthlete.keys())
  const { data: messageRows } = threadIds.length
    ? await supabaseAdmin
        .from('messages')
        .select('thread_id, created_at')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: false })
        .limit(20000)
    : { data: [] }

  const lastMessageByAthlete = new Map<string, string>()
  ;(messageRows || []).forEach((row) => {
    const athletesForThread = threadToAthlete.get(row.thread_id) || []
    athletesForThread.forEach((athleteId) => {
      const existing = lastMessageByAthlete.get(athleteId)
      if (!existing || new Date(row.created_at).getTime() > new Date(existing).getTime()) {
        lastMessageByAthlete.set(athleteId, row.created_at)
      }
    })
  })

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const athleteRows = athletes.map((athlete) => {
    const athleteLinks = linksByAthlete.get(athlete.id) || []
    const athleteApprovals = approvalsByAthlete.get(athlete.id) || []
    const athleteSessions = sessionsByAthlete.get(athlete.id) || []
    const athletePayments = paymentsByAthlete.get(athlete.id) || []

    const attendanceMarked = athleteSessions.filter((row) => String(row.attendance_status || '').trim() !== '').length
    const attendancePresent = athleteSessions.filter((row) => String(row.attendance_status || '').toLowerCase() === 'present').length

    const sessionsThisMonth = athleteSessions.filter((row) => {
      const date = row.start_time ? new Date(row.start_time) : null
      if (!date || Number.isNaN(date.getTime())) return false
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear
    }).length

    const lifetimeSpend = athletePayments.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const lastPaymentAt = athletePayments
      .map((row) => row.paid_at || row.created_at)
      .filter(Boolean)
      .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0] || null

    const lastApproval = athleteApprovals[0] || null

    return {
      id: athlete.id,
      name: athlete.full_name || athlete.email || 'Athlete',
      email: athlete.email || '',
      status: userMap[athlete.id]?.suspended ? 'Suspended' : 'Active',
      guardian: {
        profile_name: athlete.guardian_name || null,
        profile_email: athlete.guardian_email || null,
        profile_phone: athlete.guardian_phone || null,
        linked_guardians: athleteLinks.map((link) => {
          const profile = guardianProfileMap[link.guardian_user_id] || null
          return {
            id: link.id,
            guardian_user_id: link.guardian_user_id,
            name: profile?.full_name || null,
            email: profile?.email || null,
            relationship: link.relationship || 'parent',
            status: link.status,
            updated_at: link.updated_at,
          }
        }),
      },
      approvals: {
        pending: athleteApprovals.filter((row) => row.status === 'pending').length,
        approved: athleteApprovals.filter((row) => row.status === 'approved').length,
        denied: athleteApprovals.filter((row) => row.status === 'denied').length,
        expired: athleteApprovals.filter((row) => row.status === 'expired').length,
        last_status: lastApproval?.status || null,
        last_scope: lastApproval?.scope || null,
        last_target_type: lastApproval?.target_type || null,
        last_target_label: lastApproval?.target_label || null,
        last_created_at: lastApproval?.created_at || null,
      },
      payments: {
        lifetime_spend: Math.round(lifetimeSpend * 100) / 100,
        last_payment_at: lastPaymentAt,
      },
      sessions: {
        this_month: sessionsThisMonth,
        total: athleteSessions.length,
        attendance_rate: attendanceMarked ? Math.round((attendancePresent / attendanceMarked) * 1000) / 10 : 0,
      },
      messaging: {
        last_message_at: lastMessageByAthlete.get(athlete.id) || null,
      },
      memberships: {
        org_count: (orgsByAthlete.get(athlete.id) || new Set()).size,
        team_count: (teamsByAthlete.get(athlete.id) || new Set()).size,
      },
    }
  })

  return NextResponse.json({ athletes: athleteRows })
}
