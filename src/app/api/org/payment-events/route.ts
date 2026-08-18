import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { randomBytes } from 'node:crypto'

const ROLES = ['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager','admin']
async function orgFor(id: string) { const { data } = await supabaseAdmin.from('organization_memberships').select('org_id').eq('user_id', id).maybeSingle(); return data?.org_id || null }

export async function GET() {
  const { session, error } = await getSessionRole(ROLES); if (error || !session) return error
  const orgId = await orgFor(session.user.id); if (!orgId) return jsonError('Organization not found', 404)
  const { data: events, error: dbError } = await supabaseAdmin.from('org_event_collections').select('*').eq('org_id', orgId).order('starts_at')
  if (dbError) return jsonError(dbError.message, 500)
  const ids = (events || []).map((row) => row.id)
  const { data: obligations } = ids.length ? await supabaseAdmin.from('org_event_obligations').select('*').in('event_id', ids) : { data: [] }
  return NextResponse.json({ events: events || [], obligations: obligations || [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ROLES); if (error || !session) return error
  const orgId = await orgFor(session.user.id); if (!orgId) return jsonError('Organization not found', 404)
  const body = await request.json().catch(() => ({})); const total = Math.round(Number(body.total_cost_cents || 0))
  const players = Array.isArray(body.player_ids) ? Array.from(new Set<string>(body.player_ids.filter((id: unknown): id is string => typeof id === 'string'))) : []
  if (!String(body.name || '').trim() || total < 0 || !body.starts_at) return jsonError('name, starts_at, and total_cost_cents are required')
  const perPlayer = body.per_player_amount_cents != null ? Math.round(Number(body.per_player_amount_cents)) : players.length ? Math.ceil(total / players.length) : total
  const { data: event, error: eventError } = await supabaseAdmin.from('org_event_collections').insert({
    org_id: orgId, team_id: body.team_id || null, name: String(body.name).trim(), event_type: body.event_type || 'other',
    starts_at: body.starts_at, ends_at: body.ends_at || null, location: body.location || null, total_cost_cents: total,
    split_player_count: players.length || null, per_player_amount_cents: perPlayer, payment_deadline: body.payment_deadline || null,
    slug: `${String(body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,50)}-${randomBytes(4).toString('hex')}`,
    created_by: session.user.id,
  }).select('*').single()
  if (eventError) return jsonError(eventError.message, 500)
  if (players.length) await supabaseAdmin.from('org_event_obligations').insert(players.map((playerId) => ({ event_id: event.id, player_id: playerId, amount_due_cents: perPlayer })))
  return NextResponse.json({ event, obligations_created: players.length }, { status: 201 })
}
