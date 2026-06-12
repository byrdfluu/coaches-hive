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
    .from('org_seasons')
    .select('id, status, org_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!existing) return jsonError('Season not found', 404)

  const body = await request.json().catch(() => ({}))
  const { name, season_start, season_end, status } = body as {
    name?: string
    season_start?: string
    season_end?: string
    status?: string
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name.trim()
  if (season_start !== undefined) updates.season_start = season_start || null
  if (season_end !== undefined) updates.season_end = season_end || null

  if (status !== undefined) {
    updates.status = status
    if (status === 'active') {
      await supabaseAdmin
        .from('org_seasons')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .eq('status', 'active')
        .neq('id', id)
    }
  }

  const { data: season, error: dbError } = await supabaseAdmin
    .from('org_seasons')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (dbError || !season) return jsonError('Failed to update season', 500)

  return NextResponse.json({ season })
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
    .from('org_seasons')
    .select('id, status')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!existing) return jsonError('Season not found', 404)
  if ((existing as { status?: string }).status !== 'draft') {
    return jsonError('Only draft seasons can be deleted', 400)
  }

  const { error: dbError } = await supabaseAdmin.from('org_seasons').delete().eq('id', id)
  if (dbError) return jsonError('Failed to delete season', 500)

  return NextResponse.json({ ok: true })
}
