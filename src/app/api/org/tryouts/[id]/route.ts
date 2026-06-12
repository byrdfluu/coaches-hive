import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = ['org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director', 'team_manager']

async function getOrgId(userId: string): Promise<string | null> {
  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return (membership as { org_id?: string | null } | null)?.org_id ?? null
}

async function verifyTryoutOwnership(tryoutId: string, orgId: string) {
  const { data: tryout } = await supabaseAdmin
    .from('tryout_events')
    .select('*')
    .eq('id', tryoutId)
    .eq('org_id', orgId)
    .maybeSingle()
  return tryout
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error

  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const tryout = await verifyTryoutOwnership((await params).id, orgId)
  if (!tryout) return jsonError('Tryout not found', 404)

  return NextResponse.json({ tryout })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error

  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const existing = await verifyTryoutOwnership((await params).id, orgId)
  if (!existing) return jsonError('Tryout not found', 404)

  const body = await request.json().catch(() => ({}))
  const {
    name,
    sport,
    age_group,
    event_date,
    event_time,
    max_slots,
    registration_fee_cents,
    notes,
    status,
    season_id,
    location_id,
  } = body as {
    name?: string
    sport?: string
    age_group?: string
    event_date?: string
    event_time?: string
    max_slots?: number
    registration_fee_cents?: number
    notes?: string
    status?: string
    season_id?: string
    location_id?: string
  }

  const VALID_STATUSES = ['draft', 'open', 'closed', 'complete']

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name.trim()
  if (sport !== undefined) updates.sport = sport?.trim() || null
  if (age_group !== undefined) updates.age_group = age_group?.trim() || null
  if (event_date !== undefined) updates.event_date = event_date || null
  if (event_time !== undefined) updates.event_time = event_time || null
  if (max_slots !== undefined) updates.max_slots = max_slots ?? null
  if (registration_fee_cents !== undefined) updates.registration_fee_cents = registration_fee_cents ?? 0
  if (notes !== undefined) updates.notes = notes?.trim() || null
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) return jsonError('Invalid status', 400)
    updates.status = status
  }
  if (season_id !== undefined) updates.season_id = season_id || null
  if (location_id !== undefined) updates.location_id = location_id || null

  const { data: tryout, error: dbError } = await supabaseAdmin
    .from('tryout_events')
    .update(updates)
    .eq('id', (await params).id)
    .eq('org_id', orgId)
    .select('*')
    .single()

  if (dbError || !tryout) return jsonError('Failed to update tryout', 500)

  return NextResponse.json({ tryout })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error

  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const existing = await verifyTryoutOwnership((await params).id, orgId)
  if (!existing) return jsonError('Tryout not found', 404)

  const row = existing as { status?: string }
  if (row.status !== 'draft') return jsonError('Only draft tryouts can be deleted', 400)

  const { error: dbError } = await supabaseAdmin
    .from('tryout_events')
    .delete()
    .eq('id', (await params).id)
    .eq('org_id', orgId)

  if (dbError) return jsonError('Failed to delete tryout', 500)

  return NextResponse.json({ ok: true })
}
