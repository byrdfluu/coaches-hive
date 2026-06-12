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

  const { data: criteria, error: dbError } = await supabaseAdmin
    .from('tryout_criteria')
    .select('*')
    .eq('tryout_event_id', (await params).id)
    .order('sort_order', { ascending: true })

  if (dbError) return jsonError('Failed to fetch criteria', 500)

  return NextResponse.json({ criteria: criteria ?? [] })
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
  const { label, max_score, weight, sort_order } = body as {
    label?: string
    max_score?: number
    weight?: number
    sort_order?: number
  }

  if (!label?.trim()) return jsonError('label is required', 400)

  const { data: criterion, error: dbError } = await supabaseAdmin
    .from('tryout_criteria')
    .insert({
      tryout_event_id: (await params).id,
      label: label.trim(),
      max_score: max_score ?? 10,
      weight: weight ?? 1.0,
      sort_order: sort_order ?? 0,
    })
    .select('*')
    .single()

  if (dbError || !criterion) return jsonError('Failed to create criterion', 500)

  return NextResponse.json({ criterion }, { status: 201 })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error

  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const tryout = await verifyTryoutOwnership((await params).id, orgId)
  if (!tryout) return jsonError('Tryout not found', 404)

  const { searchParams } = new URL(request.url)
  const criterionId = searchParams.get('criterion_id')
  if (!criterionId) return jsonError('criterion_id query param is required', 400)

  // Verify the criterion belongs to this tryout
  const { data: existing } = await supabaseAdmin
    .from('tryout_criteria')
    .select('id')
    .eq('id', criterionId)
    .eq('tryout_event_id', (await params).id)
    .maybeSingle()

  if (!existing) return jsonError('Criterion not found', 404)

  const { error: dbError } = await supabaseAdmin
    .from('tryout_criteria')
    .delete()
    .eq('id', criterionId)
    .eq('tryout_event_id', (await params).id)

  if (dbError) return jsonError('Failed to delete criterion', 500)

  return NextResponse.json({ ok: true })
}
