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
  const { data } = await supabaseAdmin
    .from('tryout_events')
    .select('id')
    .eq('id', tryoutId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data
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

  const { data: registrations, error: dbError } = await supabaseAdmin
    .from('tryout_registrations')
    .select('*')
    .eq('tryout_event_id', (await params).id)
    .order('created_at', { ascending: true })

  if (dbError) return jsonError('Failed to fetch registrations', 500)

  return NextResponse.json({ registrations: registrations ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error

  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const tryout = await verifyTryoutOwnership((await params).id, orgId)
  if (!tryout) return jsonError('Tryout not found', 404)

  const body = await request.json().catch(() => ({}))
  const { athlete_id, athlete_name, athlete_email, jersey_number } = body as {
    athlete_id?: string
    athlete_name?: string
    athlete_email?: string
    jersey_number?: string
  }

  if (!athlete_name?.trim()) return jsonError('athlete_name is required', 400)

  const { data: registration, error: dbError } = await supabaseAdmin
    .from('tryout_registrations')
    .insert({
      tryout_event_id: (await params).id,
      athlete_id: athlete_id || null,
      athlete_name: athlete_name.trim(),
      athlete_email: athlete_email?.trim() || null,
      jersey_number: jersey_number?.trim() || null,
      payment_status: 'unpaid',
    })
    .select('*')
    .single()

  if (dbError || !registration) return jsonError('Failed to create registration', 500)

  return NextResponse.json({ registration }, { status: 201 })
}
