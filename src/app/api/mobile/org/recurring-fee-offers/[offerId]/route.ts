import { NextResponse } from 'next/server'
import { mobileError, money, requireMobileOrgAuthority } from '@/lib/mobilePaymentApi'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const auth = await requireMobileOrgAuthority(request)
  if ('response' in auth) return auth.response
  const { offerId } = await params
  const body = await request.json().catch(() => ({}))
  const { data: current } = await supabaseAdmin.from('organization_recurring_fee_offers').select('*')
    .eq('id', offerId).eq('organization_id', auth.orgId).maybeSingle()
  if (!current) return mobileError('Recurring fee offer not found', 404)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), version: Number(current.version) + 1 }
  if (body.description !== undefined) patch.description = String(body.description || '').trim()
  if (body.amount_cents !== undefined) patch.amount_cents = money(body.amount_cents)
  if (body.interval !== undefined) patch.interval = String(body.interval)
  if (body.status !== undefined) patch.status = String(body.status)
  if ((patch.description !== undefined && (!patch.description || String(patch.description).length > 160))
    || (patch.amount_cents !== undefined && Number(patch.amount_cents) < 50)
    || (patch.interval !== undefined && !['month', 'year'].includes(String(patch.interval)))
    || (patch.status !== undefined && !['draft', 'published', 'inactive'].includes(String(patch.status)))) {
    return mobileError('Invalid recurring fee offer update', 422)
  }
  const { data, error } = await supabaseAdmin.from('organization_recurring_fee_offers').update(patch).eq('id', offerId).select('*').single()
  if (error) return mobileError('Unable to update recurring fee offer', 500)
  await supabaseAdmin.from('org_audit_log').insert({ org_id: auth.orgId, actor_id: auth.user.id, actor_email: auth.user.email || null,
    action: 'recurring_fee_offer_updated', target_type: 'recurring_fee_offer', target_id: offerId, metadata: patch })
  return NextResponse.json(data)
}
