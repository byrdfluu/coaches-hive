import { NextResponse } from 'next/server'
import { mobileError, money, requireMobileOrgAuthority } from '@/lib/mobilePaymentApi'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { loadStripeConnectAccountStatus, isStripeConnectEnabled } from '@/lib/stripeConnectAccounts'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { auditPaymentAction, enforcePaymentRateLimit } from '@/lib/paymentSecurity'

export async function GET(request: Request) {
  const auth = await requireMobileOrgAuthority(request)
  if ('response' in auth) {
    const user=await getMobileRequestUser(request)
    if(!user)return auth.response
    const [{data:owned},{data:guardianLinks},{data:familyMemberships}]=await Promise.all([
      supabaseAdmin.from('athlete_profiles').select('id').eq('owner_user_id',user.id).eq('status','active'),
      supabaseAdmin.from('guardian_athlete_links').select('athlete_id').eq('guardian_user_id',user.id).eq('status','active'),
      supabaseAdmin.from('family_members').select('family_id').eq('user_id',user.id).eq('status','active').in('role',['parent','guardian']),
    ])
    let athleteIds=Array.from(new Set([...(owned||[]).map(x=>x.id),...(guardianLinks||[]).map(x=>x.athlete_id)]))
    const familyIds=(familyMemberships||[]).map(x=>x.family_id)
    if(familyIds.length){const{data:familyAthletes}=await supabaseAdmin.from('athlete_profiles').select('id').in('family_id',familyIds).eq('status','active');athleteIds=Array.from(new Set([...athleteIds,...(familyAthletes||[]).map(x=>x.id)]))}
    if(!athleteIds.length)return NextResponse.json({items:[]})
    const{data,error}=await supabaseAdmin.from('organization_recurring_fee_offer_assignments').select('id,offer_id,athlete_id,status,accepted_at,organization_recurring_fee_offers(*)').in('athlete_id',athleteIds).in('status',['offered','accepted'])
    if(error)return mobileError('Unable to load assigned recurring fee offers',500)
    return NextResponse.json({items:(data||[]).map(item=>({assignment_id:item.id,offer_id:item.offer_id,athlete_id:item.athlete_id,assignment_status:item.status,offer:Array.isArray(item.organization_recurring_fee_offers)?item.organization_recurring_fee_offers[0]:item.organization_recurring_fee_offers}))})
  }
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
  const benefits={group_credits:Math.max(0,Math.round(Number(body?.benefits?.group_credits)||0)),one_on_one_credits:Math.max(0,Math.round(Number(body?.benefits?.one_on_one_credits)||0))}
  const cancellationTerms=typeof body.cancellation_terms==='string'?body.cancellation_terms.trim().slice(0,2000):null
  const refundTerms=typeof body.refund_terms==='string'?body.refund_terms.trim().slice(0,2000):null
  const endDate=typeof body.end_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(body.end_date)?body.end_date:null
  const paymentCount=body.payment_count==null?null:Math.max(1,Math.round(Number(body.payment_count)||0))
  const selfEnrollmentEnabled = body.self_enrollment_enabled === true
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
    currency: 'usd', interval, status, created_by: auth.user.id,benefits,cancellation_terms:cancellationTerms,
    refund_terms:refundTerms,end_date:endDate,payment_count:paymentCount,self_enrollment_enabled:selfEnrollmentEnabled,
  }).select('*').single()
  if (error) return mobileError('Unable to create recurring fee offer', 500)
  await supabaseAdmin.from('org_audit_log').insert({ org_id: auth.orgId, actor_id: auth.user.id, actor_email: auth.user.email || null,
    action: 'recurring_fee_offer_created', target_type: 'recurring_fee_offer', target_id: data.id,
    metadata: { amount_cents: amountCents, interval, status, self_enrollment_enabled: selfEnrollmentEnabled } })
  await auditPaymentAction({ actorUserId: auth.user.id, workspaceId: auth.workspace.id, organizationId: auth.orgId,
    action: 'recurring_fee_offer_created', targetType: 'recurring_fee_offer', targetId: data.id, result: 'succeeded',
    metadata: { amount_cents: amountCents, interval, status, self_enrollment_enabled: selfEnrollmentEnabled } })
  return NextResponse.json(data, { status: 201 })
}
