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

export async function GET() {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error

  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const { data: tryouts, error: dbError } = await supabaseAdmin
    .from('tryout_events')
    .select('*')
    .eq('org_id', orgId)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (dbError) return jsonError('Failed to fetch tryouts', 500)

  return NextResponse.json({ tryouts: tryouts ?? [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error

  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

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
    season_id?: string
    location_id?: string
  }

  if (!name?.trim()) return jsonError('Event name is required', 400)

  const { data: tryout, error: dbError } = await supabaseAdmin
    .from('tryout_events')
    .insert({
      org_id: orgId,
      name: name.trim(),
      sport: sport?.trim() || null,
      age_group: age_group?.trim() || null,
      event_date: event_date || null,
      event_time: event_time || null,
      max_slots: max_slots ?? null,
      registration_fee_cents: registration_fee_cents ?? 0,
      notes: notes?.trim() || null,
      season_id: season_id || null,
      location_id: location_id || null,
      status: 'draft',
    })
    .select('*')
    .single()

  if (dbError || !tryout) return jsonError('Failed to create tryout', 500)

  return NextResponse.json({ tryout }, { status: 201 })
}
