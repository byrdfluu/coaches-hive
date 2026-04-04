import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildExportResponse, buildReceiptPdfBuffer, normalizeExportFormat } from '@/lib/exportUtils'
import { NextResponse } from 'next/server'
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

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const { searchParams } = new URL(request.url)
  const type = String(searchParams.get('type') || 'sessions').toLowerCase()
  const format = normalizeExportFormat(searchParams.get('format'))
  const athleteId = session.user.id

  const range = getDateRange(searchParams)

  if (type === 'sessions') {
    let query = supabaseAdmin
      .from('sessions')
      .select('id, coach_id, start_time, status, location, notes')
      .eq('athlete_id', athleteId)
    if (range.start) query = query.gte('start_time', range.start)
    if (range.end) query = query.lte('start_time', range.end)
    const { data: sessions } = await query.order('start_time', { ascending: false })

    const coachIds = Array.from(new Set((sessions || []).map((row) => row.coach_id).filter(Boolean) as string[]))
    const { data: coaches } = coachIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', coachIds)
      : { data: [] }
    const coachMap = new Map((coaches || []).map((coach: { id: string; full_name?: string | null }) => [coach.id, coach.full_name || 'Coach']))

    const rows = [
      ['Date', 'Time', 'Coach', 'Location', 'Status', 'Notes'],
      ...(sessions || []).map((session: any) => [
        formatDate(session.start_time),
        formatTime(session.start_time),
        coachMap.get(session.coach_id) || 'Coach',
        session.location || '',
        session.status || '',
        session.notes || '',
      ]),
    ]

    return buildExportResponse(format, 'athlete-sessions', 'Athlete sessions', rows)
  }

  if (type === 'payments') {
    const receiptId = searchParams.get('receipt')

    if (receiptId && format === 'pdf') {
      const { data: payment } = await supabaseAdmin
        .from('session_payments')
        .select('id, session_id, coach_id, amount, status, payment_method, paid_at, created_at, currency')
        .eq('id', receiptId)
        .eq('athlete_id', athleteId)
        .maybeSingle()

      if (!payment) return jsonError('Receipt not found', 404)

      const [athleteRes, coachRes, sessionRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('full_name, email').eq('id', athleteId).maybeSingle(),
        payment.coach_id
          ? supabaseAdmin.from('profiles').select('full_name').eq('id', payment.coach_id).maybeSingle()
          : Promise.resolve({ data: null }),
        payment.session_id
          ? supabaseAdmin.from('sessions').select('title').eq('id', payment.session_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      const pdfBuffer = buildReceiptPdfBuffer({
        receiptId: payment.id,
        amount: Number(payment.amount || 0),
        status: String(payment.status || 'paid'),
        date: String(payment.paid_at || payment.created_at || ''),
        coachName: (coachRes.data as any)?.full_name || 'Coach',
        athleteName: (athleteRes.data as any)?.full_name || 'Athlete',
        athleteEmail: (athleteRes.data as any)?.email || '',
        sessionTitle: (sessionRes.data as any)?.title || null,
        paymentMethod: String(payment.payment_method || 'stripe'),
        currency: String(payment.currency || 'usd'),
      })

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="receipt-${receiptId.slice(0, 8)}.pdf"`,
        },
      })
    }

    let query = supabaseAdmin
      .from('session_payments')
      .select('id, session_id, coach_id, amount, status, payment_method, paid_at, created_at, currency')
      .eq('athlete_id', athleteId)
    if (range.start) query = query.gte('created_at', range.start)
    if (range.end) query = query.lte('created_at', range.end)
    const { data: payments } = await query.order('created_at', { ascending: false })

    const coachIds = Array.from(new Set((payments || []).map((row) => row.coach_id).filter(Boolean) as string[]))
    const { data: coaches } = coachIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', coachIds)
      : { data: [] }
    const coachMap = new Map((coaches || []).map((coach: { id: string; full_name?: string | null }) => [coach.id, coach.full_name || 'Coach']))

    const rows = [
      ['Date', 'Amount', 'Method', 'Status', 'Coach', 'Receipt ID', 'Session ID'],
      ...(payments || []).map((payment: any) => [
        formatDate(payment.paid_at || payment.created_at),
        payment.amount ?? 0,
        payment.payment_method || '',
        payment.status || '',
        coachMap.get(payment.coach_id) || 'Coach',
        payment.id,
        payment.session_id || '',
      ]),
    ]

    return buildExportResponse(format, 'athlete-payments', 'Athlete payments', rows)
  }

  if (type === 'orders') {
    let query = supabaseAdmin
      .from('orders')
      .select('id, product_id, coach_id, org_id, amount, total, price, status, fulfillment_status, refund_status, created_at')
      .eq('athlete_id', athleteId)
    if (range.start) query = query.gte('created_at', range.start)
    if (range.end) query = query.lte('created_at', range.end)
    const { data: orders } = await query.order('created_at', { ascending: false })

    const productIds = Array.from(new Set((orders || []).map((row) => row.product_id).filter(Boolean) as string[]))
    const coachIds = Array.from(new Set((orders || []).map((row) => row.coach_id).filter(Boolean) as string[]))
    const orgIds = Array.from(new Set((orders || []).map((row) => row.org_id).filter(Boolean) as string[]))

    const { data: products } = productIds.length
      ? await supabaseAdmin.from('products').select('id, title, name').in('id', productIds)
      : { data: [] }
    const { data: coaches } = coachIds.length
      ? await supabaseAdmin.from('profiles').select('id, full_name').in('id', coachIds)
      : { data: [] }
    const { data: orgs } = orgIds.length
      ? await supabaseAdmin.from('organizations').select('id, name').in('id', orgIds)
      : { data: [] }

    const productMap = new Map((products || []).map((product: { id: string; title?: string | null; name?: string | null }) => [
      product.id,
      product.title || product.name || 'Product',
    ]))
    const coachMap = new Map((coaches || []).map((coach: { id: string; full_name?: string | null }) => [coach.id, coach.full_name || 'Coach']))
    const orgMap = new Map((orgs || []).map((org: { id: string; name?: string | null }) => [org.id, org.name || 'Organization']))

    const rows = [
      ['Date', 'Item', 'Seller', 'Total', 'Status', 'Fulfillment', 'Refund'],
      ...(orders || []).map((order: any) => [
        formatDate(order.created_at),
        productMap.get(order.product_id) || 'Product',
        order.coach_id ? coachMap.get(order.coach_id) || 'Coach' : orgMap.get(order.org_id) || 'Organization',
        order.amount ?? order.total ?? order.price ?? 0,
        order.status || '',
        order.fulfillment_status || '',
        order.refund_status || '',
      ]),
    ]

    return buildExportResponse(format, 'athlete-orders', 'Marketplace orders', rows)
  }

  if (type === 'metrics') {
    const { data: metrics } = await supabaseAdmin
      .from('athlete_metrics')
      .select('label, value, unit, sort_order')
      .eq('athlete_id', athleteId)
      .order('sort_order', { ascending: true })

    let resultsQuery = supabaseAdmin
      .from('athlete_results')
      .select('title, event_date, placement, detail')
      .eq('athlete_id', athleteId)
    if (range.start) resultsQuery = resultsQuery.gte('event_date', range.start.slice(0, 10))
    if (range.end) resultsQuery = resultsQuery.lte('event_date', range.end.slice(0, 10))
    const { data: results } = await resultsQuery.order('event_date', { ascending: false })

    const rows = [
      ['Type', 'Label', 'Value', 'Unit', 'Date', 'Notes'],
      ...(metrics || []).map((metric: any) => [
        'Metric',
        metric.label || '',
        metric.value || '',
        metric.unit || '',
        '',
        '',
      ]),
      ...(results || []).map((result: any) => [
        'Result',
        result.title || '',
        result.placement || '',
        '',
        result.event_date || '',
        result.detail || '',
      ]),
    ]

    return buildExportResponse(format, 'athlete-performance', 'Performance metrics', rows)
  }

  if (type === 'profile') {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email, guardian_name, guardian_email, guardian_phone, athlete_season, athlete_grade_level')
      .eq('id', athleteId)
      .maybeSingle()

    const { data: contacts } = await supabaseAdmin
      .from('emergency_contacts')
      .select('contact_index, name, relationship, email, phone')
      .eq('athlete_id', athleteId)
      .order('contact_index', { ascending: true })

    const rows = [
      ['Field', 'Value'],
      ['Name', profile?.full_name || ''],
      ['Email', profile?.email || ''],
      ['Season', profile?.athlete_season || ''],
      ['Grade level', profile?.athlete_grade_level || ''],
      ['Guardian name', profile?.guardian_name || ''],
      ['Guardian email', profile?.guardian_email || ''],
      ['Guardian phone', profile?.guardian_phone || ''],
      ...((contacts || []).flatMap((contact: any) => [
        [`Emergency contact ${contact.contact_index} name`, contact.name || ''],
        [`Emergency contact ${contact.contact_index} relationship`, contact.relationship || ''],
        [`Emergency contact ${contact.contact_index} email`, contact.email || ''],
        [`Emergency contact ${contact.contact_index} phone`, contact.phone || ''],
      ])),
    ]

    return buildExportResponse(format, 'athlete-profile', 'Profile & contacts', rows)
  }

  return jsonError('Unsupported export type', 400)
}
