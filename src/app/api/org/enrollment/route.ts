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

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    + '-' + Math.random().toString(36).slice(2, 7)
}

export async function GET(_request: Request) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const { data, error: dbError } = await supabaseAdmin
    .from('org_enrollment_forms')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (dbError) return jsonError('Failed to fetch enrollment forms', 500)

  // Attach submission counts
  const formIds = (data || []).map((f: { id: string }) => f.id)
  let counts: Record<string, number> = {}
  if (formIds.length > 0) {
    const { data: subs } = await supabaseAdmin
      .from('org_enrollment_submissions')
      .select('form_id')
      .in('form_id', formIds)
    ;(subs || []).forEach((s: { form_id: string }) => {
      counts[s.form_id] = (counts[s.form_id] || 0) + 1
    })
  }

  const forms = (data || []).map((f: Record<string, unknown>) => ({
    ...f,
    submission_count: counts[f.id as string] || 0,
  }))

  return NextResponse.json({ forms })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)

  const body = await request.json().catch(() => ({}))
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) return jsonError('title is required')

  const slug = slugify(title)
  const enrollmentFeeCents = body?.enrollment_fee_cents ? Math.max(0, Math.round(Number(body.enrollment_fee_cents))) : 0

  const insertPayload = {
    org_id: orgId,
    title,
    slug,
    description: body?.description?.trim() || null,
    sport: body?.sport?.trim() || null,
    age_group: body?.age_group?.trim() || null,
    team_id: body?.team_id || null,
    season_id: body?.season_id || null,
    is_active: true,
    early_bird_fee_cents: body?.early_bird_fee_cents == null ? null : Math.max(0, Math.round(Number(body.early_bird_fee_cents))),
    early_bird_deadline: body?.early_bird_deadline || null,
    late_fee_cents: body?.late_fee_cents == null ? null : Math.max(0, Math.round(Number(body.late_fee_cents))),
    late_fee_starts_at: body?.late_fee_starts_at || null,
    bundle_config: body?.bundle_pricing && typeof body.bundle_pricing === 'object' ? body.bundle_pricing : {},
    required_waiver_ids: Array.isArray(body?.required_waiver_ids) ? body.required_waiver_ids : [],
  }

  let { data, error: dbError } = await supabaseAdmin
    .from('org_enrollment_forms')
    .insert({
      ...insertPayload,
      enrollment_fee_cents: enrollmentFeeCents,
    })
    .select()
    .single()

  if (dbError && enrollmentFeeCents === 0) {
    const fallback = await supabaseAdmin
      .from('org_enrollment_forms')
      .insert(insertPayload)
      .select()
      .single()
    data = fallback.data
    dbError = fallback.error
  }

  if (dbError) return jsonError('Failed to create enrollment form', 500)
  return NextResponse.json({ form: data })
}
