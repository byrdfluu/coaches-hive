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

  const { data: locations, error: dbError } = await supabaseAdmin
    .from('org_locations')
    .select('*')
    .eq('org_id', orgId)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true })

  if (dbError) return jsonError('Failed to fetch locations', 500)

  return NextResponse.json({ locations: locations ?? [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error

  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const body = await request.json().catch(() => ({}))
  const { name, address, city, state, is_primary } = body as {
    name?: string
    address?: string
    city?: string
    state?: string
    is_primary?: boolean
  }

  if (!name?.trim()) return jsonError('Location name is required', 400)

  if (is_primary) {
    await supabaseAdmin
      .from('org_locations')
      .update({ is_primary: false })
      .eq('org_id', orgId)
  }

  const { data: location, error: dbError } = await supabaseAdmin
    .from('org_locations')
    .insert({
      org_id: orgId,
      name: name.trim(),
      address: address?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      is_primary: is_primary ?? false,
    })
    .select('*')
    .single()

  if (dbError || !location) return jsonError('Failed to create location', 500)

  return NextResponse.json({ location }, { status: 201 })
}
