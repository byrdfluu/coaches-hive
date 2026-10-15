import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { resolveActiveOrganization } from '@/lib/activeOrganization'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { canManageProgramOfferings } from '@/lib/offeringAuthorization'

async function context(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 }) }
  const org = await resolveActiveOrganization(session.user.id, { requestedWorkspaceId: request.headers.get('x-workspace-id') })
  if (!org) return { error: NextResponse.json({ error: 'Select an organization workspace.' }, { status: 403 }) }
  const { data: membership } = await supabaseAdmin.from('organization_memberships').select('role,status')
    .eq('org_id', org.organizationId).eq('user_id', session.user.id).eq('status', 'active').maybeSingle()
  if (!canManageProgramOfferings([String(membership?.role || org.role)])) {
    return { error: NextResponse.json({ error: 'Organization admin or program director access is required.' }, { status: 403 }) }
  }
  return { supabase, org }
}

export async function GET(request: Request) {
  const access = await context(request)
  if ('error' in access) return access.error
  const [{ data: liability, error: liabilityError }, { data: history, error: historyError }, { data: memberships }] = await Promise.all([
    (access.supabase as any).rpc('org_credit_liability', { p_org_id: access.org.organizationId, p_as_of: new Date().toISOString() }),
    (access.supabase as any).rpc('org_credit_history', { p_org_id: access.org.organizationId, p_limit: 500 }),
    (supabaseAdmin as any).from('org_offering_credit_memberships').select('id,athlete_id,offering_id,status,programs(name),athlete_profiles(full_name)')
      .eq('org_id', access.org.organizationId).in('status', ['active', 'past_due']),
  ])
  if (liabilityError || historyError) return NextResponse.json({ error: 'Unable to load credit liability.' }, { status: 500 })
  return NextResponse.json({ liability: liability || [], history: history || [], memberships: memberships || [] }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function POST(request: Request) {
  const access = await context(request)
  if ('error' in access) return access.error
  const body = await request.json().catch(() => ({}))
  const membershipId = String(body.membership_id || '')
  const count = Number(body.count)
  const note = String(body.note || '').trim()
  if (!membershipId || !Number.isInteger(count) || count < 1 || note.length < 3) {
    return NextResponse.json({ error: 'Choose a membership, enter a positive credit count, and provide an audit note.' }, { status: 400 })
  }
  const { data: membership } = await (supabaseAdmin as any).from('org_offering_credit_memberships').select('id')
    .eq('id', membershipId).eq('org_id', access.org.organizationId).maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Credit membership not found.' }, { status: 404 })
  const { data, error } = await (access.supabase as any).rpc('restore_org_offering_credits', {
    p_membership_id: membershipId, p_count: count, p_note: note, p_reference_id: crypto.randomUUID(),
  })
  if (error) return NextResponse.json({ error: 'Credits could not be restored.' }, { status: 409 })
  return NextResponse.json({ restored: Number(data || 0) })
}
