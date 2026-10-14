import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { resolveActiveOrganization } from '@/lib/activeOrganization'

export const dynamic = 'force-dynamic'

const managers = new Set(['owner', 'org_admin', 'club_admin', 'travel_admin', 'school_admin', 'athletic_director', 'program_director', 'admin', 'superadmin'])
const assignmentWarning = 'Tryout created, but its coaches could not be assigned. Open Edit Tryout to retry.'

async function context(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { error: NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 }) }
  const org = await resolveActiveOrganization(session.user.id, { requestedWorkspaceId: request.headers.get('x-workspace-id') })
  if (!org) return { error: NextResponse.json({ error: 'Select an organization workspace.' }, { status: 403 }) }
  if (!managers.has(String(org.role))) return { error: NextResponse.json({ error: 'Tryout management permission is required.' }, { status: 403 }) }
  return { supabase, org }
}

export async function GET(request: Request) {
  const access = await context(request)
  if ('error' in access) return access.error
  const { supabase, org } = access
  const [{ data, error }, { data: coaches, error: coachError }] = await Promise.all([
    (supabase as any).rpc('org_mobile_tryouts', { p_workspace_id: org.workspaceId, p_org_id: org.organizationId }),
    (supabase as any).rpc('my_org_assignable_coaches', { p_org_id: org.organizationId }),
  ])
  if (error) return NextResponse.json({ error: error.message || 'Failed to fetch tryouts.' }, { status: 500 })
  if (coachError) return NextResponse.json({ error: 'Unable to load assignable coaches.' }, { status: 503 })
  return NextResponse.json({ tryouts: data?.tryouts ?? [], payments_ready: Boolean(data?.payments_ready), assignable_coaches: coaches ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const access = await context(request)
  if ('error' in access) return access.error
  const { supabase, org } = access
  const body = await request.json().catch(() => ({}))
  const title = String(body.title || '').trim()
  const maxParticipants = Number(body.max_participants)
  const price = Number(body.price || 0)
  if (!title || !Number.isInteger(maxParticipants) || maxParticipants < 1 || !Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: 'Enter a title, positive capacity, and nonnegative price.' }, { status: 400 })
  }
  const tryout = {
    title,
    sport: String(body.sport || '').trim() || null,
    tryout_date: body.tryout_date || null,
    location: String(body.location || '').trim() || null,
    max_participants: maxParticipants,
    notes: String(body.notes || '').trim() || null,
    status: ['open', 'closed', 'cancelled'].includes(body.status) ? body.status : 'closed',
    price,
    fulfillment_mode: ['series', 'per_occurrence', 'credit_membership', 'free'].includes(body.fulfillment_mode) ? body.fulfillment_mode : 'series',
    price_per_occurrence_cents: body.price_per_occurrence == null ? null : Math.max(0, Math.round(Number(body.price_per_occurrence) * 100)),
    credits_per_period: body.credits_per_period == null ? null : Number(body.credits_per_period),
    billing_interval: ['month', 'year'].includes(body.billing_interval) ? body.billing_interval : null,
    renews_until_cancelled: Boolean(body.renews_until_cancelled),
    cancellation_cutoff_hours: Math.max(0, Number(body.cancellation_cutoff_hours ?? 24)),
  }
  const { data: tryoutId, error: saveError } = await (supabase as any).rpc('org_mobile_save_tryout', {
    p_workspace_id: org.workspaceId,
    p_org_id: org.organizationId,
    p_tryout: tryout,
    p_tryout_id: body.id || null,
  })
  if (saveError || !tryoutId) return NextResponse.json({ error: saveError?.message || 'Failed to create tryout.' }, { status: 500 })

  let coach_assignment_warning: string | null = null
  if (Array.isArray(body.coach_ids)) {
    const { error: coachError } = await (supabase as any).rpc('set_org_tryout_coaches', { p_tryout_id: tryoutId, p_coach_ids: body.coach_ids })
    if (coachError) coach_assignment_warning = assignmentWarning
  }
  return NextResponse.json({ tryout_id: tryoutId, coach_assignment_warning }, { status: body.id ? 200 : 201 })
}
