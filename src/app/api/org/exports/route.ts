import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildExportResponse, normalizeExportFormat } from '@/lib/exportUtils'
import { ORG_FEATURES, formatTierName, isOrgPlanActive, normalizeOrgStatus, normalizeOrgTier } from '@/lib/planRules'
export const dynamic = 'force-dynamic'


export const runtime = 'nodejs'

const formatDate = (value?: string | null) => (value ? value.slice(0, 10) : '')
const normalizeRangeValue = (value: string | null, endOfDay: boolean) => {
  if (!value) return null
  if (value.includes('T')) return value
  return `${value}T${endOfDay ? '23:59:59.999Z' : '00:00:00.000Z'}`
}
const getDateRange = (searchParams: URLSearchParams) => ({
  start: normalizeRangeValue(searchParams.get('start'), false),
  end: normalizeRangeValue(searchParams.get('end'), true),
})

const resolveOrgId = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.org_id || null
}

const requireExportAccess = async (orgId: string) => {
  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('plan, plan_status')
    .eq('org_id', orgId)
    .maybeSingle()

  const orgTier = normalizeOrgTier(orgSettings?.plan)
  const planStatus = normalizeOrgStatus(orgSettings?.plan_status)

  if (!isOrgPlanActive(planStatus)) {
    return { error: jsonError('Billing inactive. Activate your subscription to export reports.', 403) }
  }
  if (!ORG_FEATURES[orgTier].exportReports) {
    return { error: jsonError(`Upgrade to ${formatTierName('growth')} or Enterprise to export reports.`, 403) }
  }

  return { orgTier, planStatus, error: null }
}

export async function GET(request: Request) {
  const { session, error } = await getSessionRole([
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
    'admin',
  ])
  if (error || !session) return error

  const { searchParams } = new URL(request.url)
  const type = String(searchParams.get('type') || 'roster').toLowerCase()
  const format = normalizeExportFormat(searchParams.get('format'))
  const range = getDateRange(searchParams)

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const access = await requireExportAccess(orgId)
  if (access.error) return access.error

  if (type === 'roster') {
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
      ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', profileIds)
      : { data: [] }

    const profileMap = new Map(
      (profiles || []).map((profile: { id: string; full_name?: string | null; email?: string | null }) => [
        profile.id,
        { name: profile.full_name || profile.email || 'Member', email: profile.email || '' },
      ])
    )

    const rows = [
      ['Team', 'Member', 'Role', 'Email', 'Coach'],
      ...(teams || []).flatMap((team: any) => {
        const coach = team.coach_id ? profileMap.get(team.coach_id) : null
        const roster = (teamMembers || []).filter((member: any) => member.team_id === team.id)
        const coachRow = coach ? [[team.name || 'Team', coach.name, 'coach', coach.email, coach.name]] : []
        const athleteRows = roster.map((member: any) => {
          const athlete = member.athlete_id ? profileMap.get(member.athlete_id) : null
          return [
            team.name || 'Team',
            athlete?.name || 'Athlete',
            'athlete',
            athlete?.email || '',
            coach?.name || 'Unassigned',
          ]
        })
        return [...coachRow, ...athleteRows]
      }),
    ]

    return buildExportResponse(format, 'org-roster', 'Organization roster', rows)
  }

  if (type === 'fees' || type === 'charges' || type === 'billing') {
    let feeQuery = supabaseAdmin
      .from('org_fees')
      .select('id, title, amount_cents, due_date, audience_type, created_at')
      .eq('org_id', orgId)
    if (range.start) feeQuery = feeQuery.gte('created_at', range.start)
    if (range.end) feeQuery = feeQuery.lte('created_at', range.end)
    const { data: fees } = await feeQuery.order('created_at', { ascending: false })

    const feeIds = (fees || []).map((fee) => fee.id)
    let assignments: any[] | null = []
    if (feeIds.length) {
      let scoped = supabaseAdmin
        .from('org_fee_assignments')
        .select('fee_id, status, paid_at, created_at')
        .in('fee_id', feeIds)
      if (range.start) scoped = scoped.gte('created_at', range.start)
      if (range.end) scoped = scoped.lte('created_at', range.end)
      const { data } = await scoped
      assignments = data
    }

    let reminders: any[] | null = []
    if (feeIds.length) {
      let scoped = supabaseAdmin
        .from('org_fee_reminders')
        .select('fee_id, created_at')
        .in('fee_id', feeIds)
      if (range.start) scoped = scoped.gte('created_at', range.start)
      if (range.end) scoped = scoped.lte('created_at', range.end)
      const { data } = await scoped
      reminders = data
    }

    const remindersByFee = new Map<string, any[]>()
    ;(reminders || []).forEach((reminder: any) => {
      const list = remindersByFee.get(reminder.fee_id) || []
      list.push(reminder)
      remindersByFee.set(reminder.fee_id, list)
    })

    const rows = [
      ['Fee', 'Amount (cents)', 'Due date', 'Status', 'Audience', 'Assignments', 'Paid', 'Reminders', 'Last reminder'],
      ...(fees || []).map((fee: any) => {
        const feeAssignments = (assignments || []).filter((row: any) => row.fee_id === fee.id)
        const paid = feeAssignments.filter((row: any) => row.status === 'paid').length
        const reminderList = remindersByFee.get(fee.id) || []
        const lastReminder = reminderList[0]?.created_at
        const status = feeAssignments.length === 0
          ? 'unassigned'
          : paid === 0
            ? 'unpaid'
            : paid === feeAssignments.length
              ? 'paid'
              : 'partial'
        return [
          fee.title || 'Fee',
          fee.amount_cents ?? 0,
          fee.due_date || '',
          status,
          fee.audience_type || '',
          feeAssignments.length,
          paid,
          reminderList.length,
          lastReminder ? formatDate(lastReminder) : '',
        ]
      }),
    ]

    return buildExportResponse(format, 'org-fees', 'Organization fees', rows)
  }

  if (type === 'payments') {
    const { data: fees } = await supabaseAdmin
      .from('org_fees')
      .select('id, title, amount_cents, due_date')
      .eq('org_id', orgId)

    const feeIds = (fees || []).map((fee) => fee.id)
    let assignments: any[] | null = []
    if (feeIds.length) {
      let scoped = supabaseAdmin
        .from('org_fee_assignments')
        .select('fee_id, athlete_id, status, paid_at, created_at')
        .in('fee_id', feeIds)
      if (range.start) scoped = scoped.gte('created_at', range.start)
      if (range.end) scoped = scoped.lte('created_at', range.end)
      const { data } = await scoped
      assignments = data
    }

    const athleteIds = Array.from(new Set((assignments || []).map((row) => row.athlete_id).filter(Boolean) as string[]))
    const { data: athletes } = athleteIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', athleteIds)
      : { data: [] }

    const feeMap = new Map((fees || []).map((fee: any) => [fee.id, fee]))
    const athleteMap = new Map((athletes || []).map((athlete: any) => [athlete.id, athlete.full_name || 'Athlete']))

    const rows = [
      ['Payer', 'Fee', 'Amount (cents)', 'Status', 'Paid at', 'Due date'],
      ...(assignments || []).map((assignment: any) => {
        const fee = feeMap.get(assignment.fee_id)
        return [
          athleteMap.get(assignment.athlete_id) || 'Athlete',
          fee?.title || 'Fee',
          fee?.amount_cents ?? 0,
          assignment.status || '',
          formatDate(assignment.paid_at || assignment.created_at),
          fee?.due_date || '',
        ]
      }),
    ]

    return buildExportResponse(format, 'org-payments', 'Payments received', rows)
  }

  if (type === 'invoices') {
    let query = supabaseAdmin
      .from('payment_receipts')
      .select('id, payer_id, payee_id, amount, currency, status, order_id, session_payment_id, fee_assignment_id, receipt_url, created_at')
      .eq('org_id', orgId)
    if (range.start) query = query.gte('created_at', range.start)
    if (range.end) query = query.lte('created_at', range.end)
    const { data: receipts } = await query.order('created_at', { ascending: false })

    const payerIds = Array.from(new Set((receipts || []).map((row) => row.payer_id).filter(Boolean) as string[]))
    const payeeIds = Array.from(new Set((receipts || []).map((row) => row.payee_id).filter(Boolean) as string[]))
    const profileIds = Array.from(new Set([...payerIds, ...payeeIds]))
    const { data: profiles } = profileIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', profileIds)
      : { data: [] }
    const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]))

    const rows = [
      ['Date', 'Payer', 'Payee', 'Amount', 'Currency', 'Status', 'Order ID', 'Session Payment ID', 'Fee Assignment ID', 'Receipt URL'],
      ...(receipts || []).map((receipt: any) => {
        const payer = receipt.payer_id ? profileMap.get(receipt.payer_id) : null
        const payee = receipt.payee_id ? profileMap.get(receipt.payee_id) : null
        return [
          formatDate(receipt.created_at),
          payer?.full_name || payer?.email || '',
          payee?.full_name || payee?.email || '',
          receipt.amount ?? '',
          receipt.currency || '',
          receipt.status || '',
          receipt.order_id || '',
          receipt.session_payment_id || '',
          receipt.fee_assignment_id || '',
          receipt.receipt_url || '',
        ]
      }),
    ]

    return buildExportResponse(format, 'org-invoices', 'Organization invoices', rows)
  }

  if (type === 'reports' || type === 'summary') {
    const { data: members } = await supabaseAdmin
      .from('organization_memberships')
      .select('user_id')
      .eq('org_id', orgId)

    const memberIds = (members || []).map((row) => row.user_id)
    const memberList = memberIds.join(',')

    let sessions: any[] | null = []
    if (memberIds.length) {
      let scoped = supabaseAdmin
        .from('sessions')
        .select('id, start_time')
        .or(`coach_id.in.(${memberList}),athlete_id.in.(${memberList})`)
      if (range.start) scoped = scoped.gte('start_time', range.start)
      if (range.end) scoped = scoped.lte('start_time', range.end)
      const { data } = await scoped
      sessions = data
    }

    let orderQuery = supabaseAdmin
      .from('orders')
      .select('amount, total, price, created_at')
      .eq('org_id', orgId)
    if (range.start) orderQuery = orderQuery.gte('created_at', range.start)
    if (range.end) orderQuery = orderQuery.lte('created_at', range.end)
    const { data: orders } = await orderQuery

    let feeQuery = supabaseAdmin
      .from('org_fees')
      .select('id, amount_cents, created_at')
      .eq('org_id', orgId)
    if (range.start) feeQuery = feeQuery.gte('created_at', range.start)
    if (range.end) feeQuery = feeQuery.lte('created_at', range.end)
    const { data: fees } = await feeQuery

    const feeIds = (fees || []).map((fee) => fee.id)
    let assignments: any[] | null = []
    if (feeIds.length) {
      let scoped = supabaseAdmin
        .from('org_fee_assignments')
        .select('fee_id, status, created_at')
        .in('fee_id', feeIds)
      if (range.start) scoped = scoped.gte('created_at', range.start)
      if (range.end) scoped = scoped.lte('created_at', range.end)
      const { data } = await scoped
      assignments = data
    }

    const orderRevenue = (orders || []).reduce((sum: number, row: any) => sum + Number(row.amount ?? row.total ?? row.price ?? 0), 0)
    const feeRevenue = (assignments || [])
      .filter((row: any) => row.status === 'paid')
      .reduce((sum: number, row: any) => {
        const fee = (fees || []).find((item: any) => item.id === row.fee_id)
        return sum + Number(fee?.amount_cents || 0) / 100
      }, 0)

    const rows = [
      ['Metric', 'Value'],
      ['Session volume', sessions?.length || 0],
      ['Active users', memberIds.length],
      ['Marketplace revenue', orderRevenue.toFixed(2)],
      ['Fees collected', feeRevenue.toFixed(2)],
      ['Org revenue (total)', (orderRevenue + feeRevenue).toFixed(2)],
    ]

    return buildExportResponse(format, 'org-reports', 'Org reports summary', rows)
  }

  if (type === 'compliance') {
    let complianceQuery = supabaseAdmin
      .from('org_compliance_uploads')
      .select('file_name, created_at, uploaded_by')
      .eq('org_id', orgId)
    if (range.start) complianceQuery = complianceQuery.gte('created_at', range.start)
    if (range.end) complianceQuery = complianceQuery.lte('created_at', range.end)
    const { data: uploads } = await complianceQuery.order('created_at', { ascending: false })

    const uploaderIds = Array.from(new Set((uploads || []).map((row: any) => row.uploaded_by).filter(Boolean) as string[]))
    const { data: uploaders } = uploaderIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', uploaderIds)
      : { data: [] }
    const uploaderMap = new Map((uploaders || []).map((row: any) => [row.id, row.full_name || row.email || 'Org admin']))

    const rows = [
      ['File', 'Status', 'Uploaded', 'Uploaded by'],
      ...(uploads || []).map((upload: any) => [
        upload.file_name || 'Document',
        'uploaded',
        formatDate(upload.created_at),
        uploaderMap.get(upload.uploaded_by) || 'Org admin',
      ]),
    ]

    return buildExportResponse(format, 'org-compliance', 'Compliance documents', rows)
  }

  if (type === 'marketplace') {
    let productQuery = supabaseAdmin
      .from('products')
      .select('id, title, name, status, price, price_cents, created_at')
      .eq('org_id', orgId)
    if (range.start) productQuery = productQuery.gte('created_at', range.start)
    if (range.end) productQuery = productQuery.lte('created_at', range.end)
    const { data: products } = await productQuery

    let orderQuery = supabaseAdmin
      .from('orders')
      .select('id, product_id, athlete_id, amount, total, price, status, refund_status, fulfillment_status, created_at')
      .eq('org_id', orgId)
    if (range.start) orderQuery = orderQuery.gte('created_at', range.start)
    if (range.end) orderQuery = orderQuery.lte('created_at', range.end)
    const { data: orders } = await orderQuery.order('created_at', { ascending: false })

    const athleteIds = Array.from(new Set((orders || []).map((row) => row.athlete_id).filter(Boolean) as string[]))
    const { data: athletes } = athleteIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', athleteIds)
      : { data: [] }
    const athleteMap = new Map((athletes || []).map((athlete: any) => [athlete.id, athlete.full_name || 'Athlete']))
    const productMap = new Map((products || []).map((product: any) => [product.id, product.title || product.name || 'Product']))

    const rows = [
      ['Type', 'Name', 'Buyer', 'Amount', 'Status', 'Refund', 'Fulfillment', 'Date'],
      ...(products || []).map((product: any) => [
        'Product',
        product.title || product.name || 'Product',
        '',
        product.price_cents ? product.price_cents / 100 : product.price ?? 0,
        product.status || '',
        '',
        '',
        formatDate(product.created_at),
      ]),
      ...(orders || []).map((order: any) => [
        'Order',
        productMap.get(order.product_id) || 'Product',
        athleteMap.get(order.athlete_id) || 'Athlete',
        order.amount ?? order.total ?? order.price ?? 0,
        order.status || '',
        order.refund_status || '',
        order.fulfillment_status || '',
        formatDate(order.created_at),
      ]),
    ]

    return buildExportResponse(format, 'org-marketplace', 'Marketplace activity', rows)
  }

  return jsonError('Unsupported export type', 400)
}
