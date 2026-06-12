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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error

  const { id } = await params
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const { data: existing } = await supabaseAdmin
    .from('org_locations')
    .select('id, org_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!existing) return jsonError('Location not found', 404)

  const body = await request.json().catch(() => ({}))
  const { name, address, city, state, is_primary } = body as {
    name?: string
    address?: string
    city?: string
    state?: string
    is_primary?: boolean
  }

  if (is_primary) {
    await supabaseAdmin
      .from('org_locations')
      .update({ is_primary: false })
      .eq('org_id', orgId)
      .neq('id', id)
  }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name.trim()
  if (address !== undefined) updates.address = address?.trim() || null
  if (city !== undefined) updates.city = city?.trim() || null
  if (state !== undefined) updates.state = state?.trim() || null
  if (is_primary !== undefined) updates.is_primary = is_primary

  const { data: location, error: dbError } = await supabaseAdmin
    .from('org_locations')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (dbError || !location) return jsonError('Failed to update location', 500)

  return NextResponse.json({ location })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error

  const { id } = await params
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const { data: existing } = await supabaseAdmin
    .from('org_locations')
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!existing) return jsonError('Location not found', 404)

  const { data: teams } = await supabaseAdmin
    .from('org_teams')
    .select('id')
    .eq('location_id', id)
    .limit(1)

  if (teams && teams.length > 0) {
    return jsonError('Remove location from teams before deleting.', 400)
  }

  const { error: dbError } = await supabaseAdmin.from('org_locations').delete().eq('id', id)
  if (dbError) return jsonError('Failed to delete location', 500)

  return NextResponse.json({ ok: true })
}
