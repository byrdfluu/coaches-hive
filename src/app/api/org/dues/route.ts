import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const ROLES = ['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager','admin']

async function orgFor(userId: string) {
  const { data } = await supabaseAdmin.from('organization_memberships').select('org_id').eq('user_id', userId).maybeSingle()
  return data?.org_id || null
}

const addFrequency = (date: Date, frequency: string) => {
  const next = new Date(date)
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7)
  else if (frequency === 'quarterly') next.setUTCMonth(next.getUTCMonth() + 3)
  else if (frequency === 'annual') next.setUTCFullYear(next.getUTCFullYear() + 1)
  else next.setUTCMonth(next.getUTCMonth() + 1)
  return next
}

export async function GET() {
  const { session, error } = await getSessionRole(ROLES)
  if (error || !session) return error
  const orgId = await orgFor(session.user.id)
  if (!orgId) return jsonError('Organization not found', 404)
  const { data: schedules, error: scheduleError } = await supabaseAdmin
    .from('org_dues_schedules').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
  if (scheduleError) return jsonError(scheduleError.message, 500)
  const ids = (schedules || []).map((row) => row.id)
  const { data: installments } = ids.length
    ? await supabaseAdmin.from('org_dues_installments').select('*').in('schedule_id', ids).order('due_at')
    : { data: [] }
  const total = (installments || []).reduce((sum, row) => sum + Number(row.amount_due_cents || 0), 0)
  const collected = (installments || []).reduce((sum, row) => sum + Number(row.amount_paid_cents || 0), 0)
  return NextResponse.json({ schedules: schedules || [], installments: installments || [], summary: {
    active_autopay: (installments || []).filter((row) => row.autopay && !['paid','waived'].includes(row.status)).length,
    upcoming: (installments || []).filter((row) => ['upcoming','due'].includes(row.status)).length,
    past_due: (installments || []).filter((row) => ['past_due','failed'].includes(row.status)).length,
    amount_due_cents: total,
    amount_collected_cents: collected,
    collection_rate: total ? collected / total : 0,
  } })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ROLES)
  if (error || !session) return error
  const orgId = await orgFor(session.user.id)
  if (!orgId) return jsonError('Organization not found', 404)
  const body = await request.json().catch(() => ({}))
  const amountCents = Math.round(Number(body.amount_cents || 0))
  const frequency = String(body.frequency || '')
  if (!String(body.title || '').trim() || amountCents <= 0 || !['weekly','monthly','quarterly','annual'].includes(frequency)) {
    return jsonError('title, positive amount_cents, and a valid frequency are required')
  }
  const start = new Date(`${body.starts_on}T12:00:00.000Z`)
  const end = body.ends_on ? new Date(`${body.ends_on}T23:59:59.999Z`) : addFrequency(start, frequency)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return jsonError('Valid start and end dates are required')

  const { data: schedule, error: scheduleError } = await supabaseAdmin.from('org_dues_schedules').insert({
    org_id: orgId, team_id: body.team_id || null, title: String(body.title).trim(), amount_cents: amountCents,
    frequency, starts_on: body.starts_on, ends_on: body.ends_on || null, created_by: session.user.id,
  }).select('*').single()
  if (scheduleError) return jsonError(scheduleError.message, 500)

  let playerIds: string[] = Array.isArray(body.player_ids) ? body.player_ids.filter((id: unknown) => typeof id === 'string') : []
  if (!playerIds.length && body.team_id) {
    const { data } = await supabaseAdmin.from('org_team_members').select('athlete_id').eq('team_id', body.team_id)
    playerIds = (data || []).map((row) => row.athlete_id).filter(Boolean)
  }
  const rows: Record<string, unknown>[] = []
  for (const playerId of Array.from(new Set(playerIds))) {
    let due = new Date(start)
    let sequence = 1
    while (due <= end && sequence <= 120) {
      rows.push({ schedule_id: schedule.id, player_id: playerId, sequence_number: sequence, due_at: due.toISOString(), amount_due_cents: amountCents })
      due = addFrequency(due, frequency)
      sequence += 1
    }
  }
  if (rows.length) {
    const { error: installmentError } = await supabaseAdmin.from('org_dues_installments').insert(rows)
    if (installmentError) return jsonError(installmentError.message, 500)
  }
  return NextResponse.json({ schedule, installments_created: rows.length }, { status: 201 })
}
