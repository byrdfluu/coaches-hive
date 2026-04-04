import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ORG_FEATURES, isOrgPlanActive, normalizeOrgTier, normalizeOrgStatus } from '@/lib/planRules'
export const dynamic = 'force-dynamic'


const csvEscape = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return ''
  const raw = String(value)
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

const toCsv = (rows: Array<Array<string | number | null | undefined>>) =>
  rows.map((row) => row.map(csvEscape).join(',')).join('\n')

export async function GET(request: Request) {
  const { session, error } = await getSessionRole([
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
  ])
  if (error || !session) return error

  const { searchParams } = new URL(request.url)
  const reportType = String(searchParams.get('type') || 'billing').toLowerCase()
  const rangeStart = searchParams.get('start')
  const rangeEnd = searchParams.get('end')

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!membership?.org_id) {
    return jsonError('Organization not found', 404)
  }

  const orgId = membership.org_id

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('plan, plan_status')
    .eq('org_id', orgId)
    .maybeSingle()

  const orgTier = normalizeOrgTier(orgSettings?.plan)
  const planStatus = normalizeOrgStatus(orgSettings?.plan_status)
  if (!isOrgPlanActive(planStatus)) {
    return jsonError('Billing inactive. Activate your subscription to export reports.', 403)
  }
  const fullExportsEnabled = ORG_FEATURES[orgTier].exportReports

  if (reportType === 'roster') {
    const { data: teams } = await supabaseAdmin
      .from('org_teams')
      .select('id, name, coach_id')
      .eq('org_id', orgId)

    const teamIds = (teams || []).map((team) => team.id)
    const { data: teamMembers } = teamIds.length
      ? await supabaseAdmin
          .from('org_team_members')
          .select('team_id, athlete_id')
          .in('team_id', teamIds)
      : { data: [] }

    const coachIds = (teams || []).map((team) => team.coach_id).filter(Boolean) as string[]
    const athleteIds = (teamMembers || []).map((row: any) => row.athlete_id).filter(Boolean) as string[]
    const profileIds = Array.from(new Set([...coachIds, ...athleteIds]))

    const { data: profiles } = profileIds.length
      ? await supabaseAdmin
          .from('profiles')
          .select('id, full_name, email')
          .in('id', profileIds)
      : { data: [] }

    const profileMap = new Map<string, { name: string; email: string }>()
    ;(profiles || []).forEach((profile: any) => {
      profileMap.set(profile.id, {
        name: profile.full_name || profile.email || 'Member',
        email: profile.email || '',
      })
    })

    const memberRows = (teamMembers || []).map((row: any) => {
      const team = (teams || []).find((t: any) => t.id === row.team_id)
      const coach = team?.coach_id ? profileMap.get(team.coach_id) : null
      const athlete = row.athlete_id ? profileMap.get(row.athlete_id) : null
      return [
        team?.name || 'Team',
        coach?.name || 'Unassigned',
        coach?.email || '',
        athlete?.name || 'Athlete',
        athlete?.email || '',
      ]
    })
    const basicRows = memberRows.reduce<Record<string, { coach: string; count: number }>>((acc, row) => {
      const teamName = String(row[0] || 'Team')
      const coachName = String(row[1] || 'Unassigned')
      if (!acc[teamName]) acc[teamName] = { coach: coachName, count: 0 }
      acc[teamName].count += 1
      return acc
    }, {})

    const rows = fullExportsEnabled
      ? [
          ['Team', 'Coach', 'Coach email', 'Athlete', 'Athlete email'],
          ...memberRows,
        ]
      : [
          ['Team', 'Coach', 'Athlete count'],
          ...Object.entries(basicRows).map(([teamName, data]) => [
            teamName,
            data.coach,
            data.count,
          ]),
          [''],
          ['Upgrade', 'Upgrade to Growth for athlete-level exports.'],
        ]

    const csv = toCsv(rows)
    const today = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="org-roster-${today}.csv"`,
      },
    })
  }

  if (reportType === 'compliance') {
    const { data: orgSettings } = await supabaseAdmin
      .from('org_settings')
      .select('org_name, org_type, guardian_consent, eligibility_tracking, medical_clearance, communication_limits, season_start, season_end, policy_notes, billing_contact, tax_id')
      .eq('org_id', orgId)
      .maybeSingle()

    const rows = fullExportsEnabled
      ? [
          ['Field', 'Value'],
          ['Org name', orgSettings?.org_name || 'Organization'],
          ['Org type', orgSettings?.org_type || 'Not set'],
          ['Guardian consent', orgSettings?.guardian_consent || 'Not set'],
          ['Eligibility tracking', orgSettings?.eligibility_tracking || 'Not set'],
          ['Medical clearance', orgSettings?.medical_clearance || 'Not set'],
          ['Communication limits', orgSettings?.communication_limits || 'Not set'],
          ['Season start', orgSettings?.season_start || 'Not set'],
          ['Season end', orgSettings?.season_end || 'Not set'],
          ['Policy notes', orgSettings?.policy_notes || 'Not set'],
          ['Billing contact', orgSettings?.billing_contact || 'Not set'],
          ['Tax ID', orgSettings?.tax_id || 'Not set'],
          ['Uploads', 'Stored in attachments bucket (export not linked)'],
        ]
      : [
          ['Field', 'Value'],
          ['Org name', orgSettings?.org_name || 'Organization'],
          ['Org type', orgSettings?.org_type || 'Not set'],
          ['Season start', orgSettings?.season_start || 'Not set'],
          ['Season end', orgSettings?.season_end || 'Not set'],
          ['Guardian consent', orgSettings?.guardian_consent || 'Not set'],
          ['Eligibility tracking', orgSettings?.eligibility_tracking || 'Not set'],
          ['Upgrade', 'Upgrade to Growth for full compliance export.'],
        ]

    const csv = toCsv(rows)
    const today = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="org-compliance-${today}.csv"`,
      },
    })
  }

  if (reportType === 'invoices') {
    let receiptQuery = supabaseAdmin
      .from('payment_receipts')
      .select('id, payer_id, payee_id, amount, currency, status, order_id, session_payment_id, fee_assignment_id, receipt_url, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (rangeStart) {
      receiptQuery = receiptQuery.gte('created_at', `${rangeStart}T00:00:00Z`)
    }
    if (rangeEnd) {
      receiptQuery = receiptQuery.lte('created_at', `${rangeEnd}T23:59:59Z`)
    }

    const { data: receipts } = await receiptQuery
    const payerIds = Array.from(new Set((receipts || []).map((row) => row.payer_id).filter(Boolean) as string[]))
    const payeeIds = Array.from(new Set((receipts || []).map((row) => row.payee_id).filter(Boolean) as string[]))
    const profileIds = Array.from(new Set([...payerIds, ...payeeIds]))

    const { data: profiles } = profileIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', profileIds)
      : { data: [] }

    const profileMap = new Map((profiles || []).map((row: any) => [row.id, row]))

    if (!fullExportsEnabled) {
      const totalsByMonth = (receipts || []).reduce<Record<string, { count: number; total: number }>>((acc, row: any) => {
        const dateValue = row.created_at ? new Date(row.created_at) : null
        if (!dateValue || Number.isNaN(dateValue.getTime())) return acc
        const key = dateValue.toISOString().slice(0, 7)
        if (!acc[key]) acc[key] = { count: 0, total: 0 }
        acc[key].count += 1
        acc[key].total += Number(row.amount || 0)
        return acc
      }, {})

      const rows = [
        ['Month', 'Receipts', 'Total amount'],
        ...Object.entries(totalsByMonth).map(([month, data]) => [
          month,
          data.count,
          data.total.toFixed(2),
        ]),
        [''],
        ['Upgrade', 'Upgrade to Growth for line-item invoices.'],
      ]

      const csv = toCsv(rows)
      const today = new Date().toISOString().slice(0, 10)
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="org-invoices-${today}.csv"`,
        },
      })
    }

    const rows = [
      ['Receipt ID', 'Payer', 'Payee', 'Amount', 'Currency', 'Status', 'Order ID', 'Session Payment ID', 'Fee Assignment ID', 'Created', 'Receipt URL'],
      ...(receipts || []).map((row: any) => {
        const payer = row.payer_id ? profileMap.get(row.payer_id) : null
        const payee = row.payee_id ? profileMap.get(row.payee_id) : null
        return [
          row.id,
          payer?.full_name || payer?.email || '',
          payee?.full_name || payee?.email || '',
          row.amount ?? '',
          row.currency || '',
          row.status || '',
          row.order_id || '',
          row.session_payment_id || '',
          row.fee_assignment_id || '',
          row.created_at || '',
          row.receipt_url || '',
        ]
      }),
    ]

    const csv = toCsv(rows)
    const today = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="org-invoices-${today}.csv"`,
      },
    })
  }

  const { data: members } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId)

  const memberIds = (members || []).map((row) => row.user_id)
  const memberList = memberIds.join(',')

  const { data: sessions } = memberIds.length
    ? await supabaseAdmin
        .from('sessions')
        .select('id, coach_id, athlete_id, start_time, end_time, status, duration_minutes')
        .or(`coach_id.in.(${memberList}),athlete_id.in.(${memberList})`)
    : { data: [] }

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, coach_id, athlete_id, amount, total, price, status, refund_status, created_at')
    .eq('org_id', orgId)

  const { data: fees } = await supabaseAdmin
    .from('org_fees')
    .select('id, title, amount_cents, due_date, audience_type, created_at')
    .eq('org_id', orgId)

  const feeIds = (fees || []).map((fee) => fee.id)
  const { data: assignments } = feeIds.length
    ? await supabaseAdmin
        .from('org_fee_assignments')
        .select('fee_id, athlete_id, status, paid_at')
        .in('fee_id', feeIds)
    : { data: [] }

  const sessionRows = sessions || []
  const orderRows = orders || []
  const feeRows = fees || []
  const assignmentRows = assignments || []

  const summaryRows = [
    ['Metric', 'Value'],
    ['Sessions', sessionRows.length],
    ['Marketplace orders', orderRows.length],
    ['Fees issued', feeRows.length],
    ['Fee assignments', assignmentRows.length],
  ]

  const sessionTable = [
    ['Session ID', 'Coach ID', 'Athlete ID', 'Start', 'End', 'Status', 'Duration (min)'],
    ...sessionRows.map((row: any) => [
      row.id,
      row.coach_id,
      row.athlete_id,
      row.start_time,
      row.end_time,
      row.status,
      row.duration_minutes,
    ]),
  ]

  const orderTable = [
    ['Order ID', 'Coach ID', 'Athlete ID', 'Amount', 'Status', 'Refund Status', 'Created'],
    ...orderRows.map((row: any) => [
      row.id,
      row.coach_id,
      row.athlete_id,
      row.amount ?? row.total ?? row.price ?? 0,
      row.status,
      row.refund_status,
      row.created_at,
    ]),
  ]

  const feeTable = [
    ['Fee ID', 'Title', 'Amount (cents)', 'Due date', 'Audience', 'Created'],
    ...feeRows.map((row: any) => [
      row.id,
      row.title,
      row.amount_cents,
      row.due_date,
      row.audience_type,
      row.created_at,
    ]),
  ]

  const assignmentTable = [
    ['Fee ID', 'Athlete ID', 'Status', 'Paid at'],
    ...assignmentRows.map((row: any) => [
      row.fee_id,
      row.athlete_id,
      row.status,
      row.paid_at,
    ]),
  ]

  const sections = fullExportsEnabled
    ? [
        ['Summary'],
        ...summaryRows,
        [''],
        ['Sessions'],
        ...sessionTable,
        [''],
        ['Orders'],
        ...orderTable,
        [''],
        ['Fees'],
        ...feeTable,
        [''],
        ['Fee assignments'],
        ...assignmentTable,
      ]
    : [
        ['Summary'],
        ...summaryRows,
        [''],
        ['Upgrade'],
        ['Upgrade to Growth for detailed session, order, and fee exports.'],
      ]

  const csv = toCsv(sections)
  const today = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="org-report-${today}.csv"`,
    },
  })
}
