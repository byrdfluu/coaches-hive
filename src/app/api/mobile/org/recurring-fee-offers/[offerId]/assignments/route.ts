import { NextResponse } from 'next/server'
import { mobileError, requireMobileOrgAuthority } from '@/lib/mobilePaymentApi'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const auth = await requireMobileOrgAuthority(request)
  if ('response' in auth) return auth.response
  const { offerId } = await params
  const body = await request.json().catch(() => ({}))
  const athleteIds = Array.from(new Set((Array.isArray(body.athlete_ids) ? body.athlete_ids : [body.athlete_id]).filter(Boolean).map(String)))
  if (!athleteIds.length) return mobileError('athlete_id or athlete_ids is required', 422)
  const [{ data: offer }, { data: memberships }] = await Promise.all([
    supabaseAdmin.from('organization_recurring_fee_offers').select('id,status').eq('id', offerId).eq('organization_id', auth.orgId).maybeSingle(),
    supabaseAdmin.from('athlete_organization_memberships').select('athlete_id').eq('org_id', auth.orgId).eq('status', 'active').in('athlete_id', athleteIds),
  ])
  if (!offer) return mobileError('Recurring fee offer not found', 404)
  if (new Set((memberships || []).map((x) => x.athlete_id)).size !== athleteIds.length) return mobileError('Every athlete must belong to this organization', 403)
  const rows = athleteIds.map((athleteId) => ({ offer_id: offerId, athlete_id: athleteId, assigned_by: auth.user.id, status: 'offered', updated_at: new Date().toISOString() }))
  const { data, error } = await supabaseAdmin.from('organization_recurring_fee_offer_assignments').upsert(rows, { onConflict: 'offer_id,athlete_id' }).select('*')
  if (error) return mobileError('Unable to assign recurring fee offer', 500)
  await supabaseAdmin.from('org_audit_log').insert({ org_id: auth.orgId, actor_id: auth.user.id, actor_email: auth.user.email || null,
    action: 'recurring_fee_offer_assigned', target_type: 'recurring_fee_offer', target_id: offerId, metadata: { athlete_ids: athleteIds } })
  return NextResponse.json({ items: data || [] }, { status: 201 })
}
