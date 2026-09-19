import { NextResponse } from 'next/server'
import { mobileError, money, requireMobileOrgAuthority } from '@/lib/mobilePaymentApi'
import { loadStripeConnectAccountStatus, isStripeConnectEnabled } from '@/lib/stripeConnectAccounts'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { auditPaymentAction, enforcePaymentRateLimit } from '@/lib/paymentSecurity'

export async function GET(request: Request) {
  const auth = await requireMobileOrgAuthority(request)
  if ('response' in auth) return auth.response
  const { data, error } = await supabaseAdmin.from('organization_recurring_fee_offers').select('*,organization_recurring_fee_offer_assignments(*)')
    .eq('organization_id', auth.orgId).order('created_at', { ascending: false })
  return error ? mobileError('Unable to load recurring fee offers', 500) : NextResponse.json({ items: data || [] })
}

export async function POST(request: Request) {
  const auth = await requireMobileOrgAuthority(request)
  if ('response' in auth) return auth.response
  if (!(await enforcePaymentRateLimit(auth.user.id, 'recurring_fee_offer_create', 10, 300).catch(() => false))) return mobileError('Too many recurring-fee requests. Try again later.', 429)
  const body = await request.json().catch(() => ({}))
  const amountCents = money(body.amount_cents)
  const description = String(body.description || '').trim()
  const interval = String(body.interval || '')
  const status = body.status === 'published' ? 'published' : 'draft'
  if (amountCents < 50 || description.length < 1 || description.length > 160 || !['month', 'year'].includes(interval)) {
    return mobileError('description, amount_cents of at least 50, and interval month or year are required', 422)
  }
  const [{ data: settings }, connect] = await Promise.all([
    supabaseAdmin.from('org_settings').select('plan_status,recurring_fees_enabled').eq('org_id', auth.orgId).maybeSingle(),
    loadStripeConnectAccountStatus('org', auth.orgId, { refresh: true }).catch(() => null),
  ])
  if (!settings?.recurring_fees_enabled || !['active', 'trialing'].includes(String(settings.plan_status || ''))) {
    return mobileError('Recurring fees are not enabled for this organization plan', 403)
  }
  if (!isStripeConnectEnabled(connect)) return mobileError('Organization payouts are not ready', 409)
  const { data, error } = await supabaseAdmin.from('organization_recurring_fee_offers').insert({
    organization_id: auth.orgId, workspace_id: auth.workspace.id, description, amount_cents: amountCents,
    currency: 'usd', interval, status, created_by: auth.user.id,
  }).select('*').single()
  if (error) return mobileError('Unable to create recurring fee offer', 500)
  await supabaseAdmin.from('org_audit_log').insert({ org_id: auth.orgId, actor_id: auth.user.id, actor_email: auth.user.email || null,
    action: 'recurring_fee_offer_created', target_type: 'recurring_fee_offer', target_id: data.id,
    metadata: { amount_cents: amountCents, interval, status } })
  await auditPaymentAction({ actorUserId: auth.user.id, workspaceId: auth.workspace.id, organizationId: auth.orgId,
    action: 'recurring_fee_offer_created', targetType: 'recurring_fee_offer', targetId: data.id, result: 'succeeded',
    metadata: { amount_cents: amountCents, interval, status } })
  return NextResponse.json(data, { status: 201 })
}
