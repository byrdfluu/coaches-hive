import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = [
  'org_admin','club_admin','travel_admin','school_admin',
  'athletic_director','program_director','team_manager',
]

async function getOrgId(userId: string) {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { org_id?: string } | null)?.org_id ?? null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (typeof body?.label === 'string') updates.label = body.label.trim()
  if (typeof body?.min_age === 'number' || body?.min_age === null) updates.min_age = body.min_age
  if (typeof body?.max_age === 'number' || body?.max_age === null) updates.max_age = body.max_age
  if (typeof body?.sort_order === 'number') updates.sort_order = body.sort_order

  const { data, error: dbError } = await supabaseAdmin
    .from('org_age_groups')
    .update(updates)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (dbError) return jsonError('Failed to update age group', 500)
  return NextResponse.json({ age_group: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)
  const { id } = await params

  const { error: dbError } = await supabaseAdmin
    .from('org_age_groups')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (dbError) return jsonError('Failed to delete age group', 500)
  return NextResponse.json({ ok: true })
}