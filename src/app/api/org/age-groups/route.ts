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

export async function GET(_request: Request) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const { data, error: dbError } = await supabaseAdmin
    .from('org_age_groups')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order')
    .order('label')

  if (dbError) return jsonError('Failed to fetch age groups', 500)
  return NextResponse.json({ age_groups: data ?? [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const body = await request.json().catch(() => ({}))
  const label = typeof body?.label === 'string' ? body.label.trim() : ''
  if (!label) return jsonError('label is required')

  const { data: existing } = await supabaseAdmin
    .from('org_age_groups')
    .select('count')
    .eq('org_id', orgId)
  const count = Array.isArray(existing) ? existing.length : 0

  const { data, error: dbError } = await supabaseAdmin
    .from('org_age_groups')
    .insert({
      org_id: orgId,
      label,
      min_age: typeof body?.min_age === 'number' ? body.min_age : null,
      max_age: typeof body?.max_age === 'number' ? body.max_age : null,
      sort_order: count,
    })
    .select()
    .single()

  if (dbError) return jsonError('Failed to create age group', 500)
  return NextResponse.json({ age_group: data })
}