import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildExportResponse, normalizeExportFormat } from '@/lib/exportUtils'
import { getFeePercentage, resolveProductCategory, FeeTier } from '@/lib/platformFees'
import { normalizeCoachTier } from '@/lib/planRules'
export const dynamic = 'force-dynamic'


export const runtime = 'nodejs'

const formatDate = (value?: string | null) => (value ? value.slice(0, 10) : '')
const formatTime = (value?: string | null) => (value ? value.slice(11, 16) : '')
const normalizeRangeValue = (value: string | null, endOfDay: boolean) => {
  if (!value) return null
  if (value.includes('T')) return value
  return `${value}T${endOfDay ? '23:59:59.999Z' : '00:00:00.000Z'}`
}
const getDateRange = (searchParams: URLSearchParams) => ({
  start: normalizeRangeValue(searchParams.get('start'), false),
  end: normalizeRangeValue(searchParams.get('end'), true),
})

const dayLabel = (day?: number | null) => {
  const labels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  if (day === null || day === undefined) return ''
  return labels[day] || ''
}

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const { searchParams } = new URL(request.url)
  const type = String(searchParams.get('type') || 'bookings').toLowerCase()
  const format = normalizeExportFormat(searchParams.get('format'))
  const coachId = session.user.id
  const range = getDateRange(searchParams)

  if (type === 'bookings') {
    let query = supabaseAdmin
      .from('sessions')
      .select('id, athlete_id, start_time, status, location, notes')
      .eq('coach_id', coachId)
    if (range.start) query = query.gte('start_time', range.start)
    if (range.end) query = query.lte('start_time', range.end)
    const { data: sessions } = await query.order('start_time', { ascending: false })

    const athleteIds = Array.from(new Set((sessions || []).map((row) => row.athlete_id).filter(Boolean) as string[]))
    const { data: athletes } = athleteIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', athleteIds)
      : { data: [] }
    const athleteMap = new Map((athletes || []).map((athlete: { id: string; full_name?: string | null }) => [athlete.id, athlete.full_name || 'Athlete']))

    const rows = [
      ['Date', 'Time', 'Athlete', 'Location', 'Status', 'Notes'],
      ...(sessions || []).map((session: any) => [
        formatDate(session.start_time),
        formatTime(session.start_time),
        athleteMap.get(session.athlete_id) || 'Athlete',
        session.location || '',
        session.status || '',
        session.notes || '',
      ]),
    ]

    return buildExportResponse(format, 'coach-bookings', 'Coach bookings', rows)
  }

  if (type === 'payouts') {
    let query = supabaseAdmin
      .from('coach_payouts')
      .select('id, amount, status, scheduled_for, paid_at, created_at, session_payment_id')
      .eq('coach_id', coachId)
    if (range.start) query = query.gte('created_at', range.start)
    if (range.end) query = query.lte('created_at', range.end)
    const { data: payouts } = await query.order('created_at', { ascending: false })

    const paymentIds = Array.from(new Set((payouts || []).map((row) => row.session_payment_id).filter(Boolean) as string[]))
    const { data: payments } = paymentIds.length
      ? await supabaseAdmin
          .from('session_payments')
          .select('id, amount, platform_fee, net_amount')
          .in('id', paymentIds)
      : { data: [] }

    const paymentMap = new Map((payments || []).map((row: any) => [row.id, row]))

    const rows = [
      ['Date', 'Gross', 'Platform fee', 'Net', 'Status', 'Payment ID'],
      ...(payouts || []).map((payout: any) => {
        const payment = payout.session_payment_id ? paymentMap.get(payout.session_payment_id) : null
        const gross = payment?.amount ?? null
        const platformFee = payment?.platform_fee ?? null
        const net = payment?.net_amount ?? payout.amount ?? null
        return [
          formatDate(payout.paid_at || payout.scheduled_for || payout.created_at),
          gross ?? '',
          platformFee ?? '',
          net ?? '',
          payout.status || '',
          payout.session_payment_id || '',
        ]
      }),
    ]

    return buildExportResponse(format, 'coach-payouts', 'Coach payouts', rows)
  }

  if (type === 'availability') {
    const { data: availability } = await supabaseAdmin
      .from('availability_blocks')
      .select('day_of_week, specific_date, start_time, end_time, session_type, location')
      .eq('coach_id', coachId)
      .order('day_of_week', { ascending: true })

    const rows = [
      ['Day', 'Date', 'Start', 'End', 'Session type', 'Location'],
      ...(availability || []).map((block: any) => [
        dayLabel(block.day_of_week),
        block.specific_date || '',
        block.start_time || '',
        block.end_time || '',
        block.session_type || '',
        block.location || '',
      ]),
    ]

    return buildExportResponse(format, 'coach-availability', 'Coach availability', rows)
  }

  if (type === 'roster') {
    const { data: links } = await supabaseAdmin
      .from('coach_athlete_links')
      .select('athlete_id, status')
      .eq('coach_id', coachId)

    const athleteIds = Array.from(new Set((links || []).map((row) => row.athlete_id).filter(Boolean) as string[]))
    const { data: athletes } = athleteIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', athleteIds)
      : { data: [] }

    const { data: plans } = athleteIds.length
      ? await supabaseAdmin.from('athlete_plans').select('athlete_id, tier').in('athlete_id', athleteIds)
      : { data: [] }

    const { data: sessions } = athleteIds.length
      ? await supabaseAdmin
          .from('sessions')
          .select('athlete_id, start_time')
          .eq('coach_id', coachId)
          .in('athlete_id', athleteIds)
          .order('start_time', { ascending: false })
      : { data: [] }

    const athleteMap = new Map((athletes || []).map((athlete: { id: string; full_name?: string | null }) => [athlete.id, athlete.full_name || 'Athlete']))
    const planMap = new Map((plans || []).map((plan: any) => [plan.athlete_id, plan.tier || '']))
    const lastSessionMap = new Map<string, string>()
    ;(sessions || []).forEach((session: any) => {
      if (!lastSessionMap.has(session.athlete_id)) {
        lastSessionMap.set(session.athlete_id, formatDate(session.start_time))
      }
    })

    const rows = [
      ['Athlete', 'Plan', 'Status', 'Last session'],
      ...(links || []).map((link: any) => [
        athleteMap.get(link.athlete_id) || 'Athlete',
        planMap.get(link.athlete_id) || '',
        link.status || '',
        lastSessionMap.get(link.athlete_id) || '',
      ]),
    ]

    return buildExportResponse(format, 'coach-roster', 'Coach roster', rows)
  }

  if (type === 'reviews') {
    let query = supabaseAdmin
      .from('coach_reviews')
      .select('rating, review_text, verified, created_at, athlete_id')
      .eq('coach_id', coachId)
    if (range.start) query = query.gte('created_at', range.start)
    if (range.end) query = query.lte('created_at', range.end)
    const { data: reviews } = await query.order('created_at', { ascending: false })

    const athleteIds = Array.from(new Set((reviews || []).map((row) => row.athlete_id).filter(Boolean) as string[]))
    const { data: athletes } = athleteIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', athleteIds)
      : { data: [] }
    const athleteMap = new Map((athletes || []).map((athlete: { id: string; full_name?: string | null }) => [athlete.id, athlete.full_name || 'Athlete']))

    const rows = [
      ['Date', 'Athlete', 'Rating', 'Verified', 'Review'],
      ...(reviews || []).map((review: any) => [
        formatDate(review.created_at),
        athleteMap.get(review.athlete_id) || 'Athlete',
        review.rating ?? '',
        review.verified ? 'Yes' : 'No',
        review.review_text || '',
      ]),
    ]

    return buildExportResponse(format, 'coach-reviews', 'Coach reviews', rows)
  }

  if (type === 'marketplace') {
    let query = supabaseAdmin
      .from('orders')
      .select('id, product_id, athlete_id, amount, total, price, status, created_at')
      .eq('coach_id', coachId)
    if (range.start) query = query.gte('created_at', range.start)
    if (range.end) query = query.lte('created_at', range.end)
    const { data: orders } = await query.order('created_at', { ascending: false })

    const productIds = Array.from(new Set((orders || []).map((row) => row.product_id).filter(Boolean) as string[]))
    const athleteIds = Array.from(new Set((orders || []).map((row) => row.athlete_id).filter(Boolean) as string[]))

    const { data: products } = productIds.length
      ? await supabaseAdmin.from('products').select('id, title, name, type, category').in('id', productIds)
      : { data: [] }
    const { data: athletes } = athleteIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', athleteIds)
      : { data: [] }

    const productMap = new Map((products || []).map((product: any) => [product.id, product]))
    const athleteMap = new Map((athletes || []).map((athlete: { id: string; full_name?: string | null }) => [athlete.id, athlete.full_name || 'Athlete']))

    const { data: planRow } = await supabaseAdmin
      .from('coach_plans')
      .select('tier')
      .eq('coach_id', coachId)
      .maybeSingle()

    const { data: feeRules } = await supabaseAdmin
      .from('platform_fee_rules')
      .select('tier, category, percentage')
      .eq('active', true)

    const tier = normalizeCoachTier(planRow?.tier) as FeeTier

    const rows = [
      ['Date', 'Product', 'Buyer', 'Amount', 'Platform fee', 'Net', 'Status'],
      ...(orders || []).map((order: any) => {
        const product = productMap.get(order.product_id) || {}
        const category = resolveProductCategory(product.type || product.category)
        const percent = getFeePercentage(tier, category, feeRules || [])
        const amount = Number(order.amount ?? order.total ?? order.price ?? 0)
        const platformFee = Math.round(amount * (percent / 100) * 100) / 100
        const net = Math.max(amount - platformFee, 0)
        return [
          formatDate(order.created_at),
          product.title || product.name || 'Product',
          athleteMap.get(order.athlete_id) || 'Athlete',
          amount || 0,
          platformFee,
          net,
          order.status || '',
        ]
      }),
    ]

    return buildExportResponse(format, 'coach-marketplace', 'Marketplace sales', rows)
  }

  if (type === 'invoices') {
    let query = supabaseAdmin
      .from('payment_receipts')
      .select('id, payer_id, amount, currency, status, order_id, session_payment_id, receipt_url, created_at')
      .eq('payee_id', coachId)
    if (range.start) query = query.gte('created_at', range.start)
    if (range.end) query = query.lte('created_at', range.end)
    const { data: receipts } = await query.order('created_at', { ascending: false })

    const payerIds = Array.from(new Set((receipts || []).map((row) => row.payer_id).filter(Boolean) as string[]))
    const { data: payers } = payerIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', payerIds)
      : { data: [] }

    const payerMap = new Map((payers || []).map((payer: any) => [payer.id, payer]))

    const rows = [
      ['Date', 'Payer', 'Amount', 'Currency', 'Status', 'Order ID', 'Session Payment ID', 'Receipt URL'],
      ...(receipts || []).map((receipt: any) => {
        const payer = receipt.payer_id ? payerMap.get(receipt.payer_id) : null
        return [
          formatDate(receipt.created_at),
          payer?.full_name || payer?.email || '',
          receipt.amount ?? '',
          receipt.currency || '',
          receipt.status || '',
          receipt.order_id || '',
          receipt.session_payment_id || '',
          receipt.receipt_url || '',
        ]
      }),
    ]

    return buildExportResponse(format, 'coach-invoices', 'Coach invoices', rows)
  }

  return jsonError('Unsupported export type', 400)
}
