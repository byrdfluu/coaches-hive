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

  const { data: seasons, error: dbError } = await supabaseAdmin
    .from('org_seasons')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (dbError) return jsonError('Failed to fetch seasons', 500)

  return NextResponse.json({ seasons: seasons ?? [] })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error

  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const body = await request.json().catch(() => ({}))
  const { name, season_start, season_end } = body as {
    name?: string
    season_start?: string
    season_end?: string
  }

  if (!name?.trim()) return jsonError('Season name is required', 400)

  const { data: season, error: dbError } = await supabaseAdmin
    .from('org_seasons')
    .insert({
      org_id: orgId,
      name: name.trim(),
      season_start: season_start || null,
      season_end: season_end || null,
      status: 'draft',
    })
    .select('*')
    .single()

  if (dbError || !season) return jsonError('Failed to create season', 500)

  return NextResponse.json({ season }, { status: 201 })
}
