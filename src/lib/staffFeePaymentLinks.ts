import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import stripe from '@/lib/stripeServer'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { calculateOrganizationPayment, organizationCheckoutLineItems, organizationPaymentMetadata } from '@/lib/organizationPaymentPolicy'
import { resolveBaseUrl } from '@/lib/siteUrl'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { activeWorkspaceRole, requireWorkspaceContext } from '@/lib/workspaceAuthority'
import { resolveAthleteProfileOwner, userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'
import { idempotencyKeyFor, requestIdFor } from '@/lib/requestSecurity'

export type FeeOwnerType = 'organization' | 'league'
type SafeErrorCode = 'unauthorized_staff'|'workspace_owner_mismatch'|'assignment_missing'|'assignment_already_paid'|'stripe_connect_incomplete'|'expired_or_revoked_link'|'invalid_payer_verification'|'session_already_in_progress'|'capacity_unavailable'|'stripe_temporarily_unavailable'|'payment_link_failed'

const digest = (token: string) => createHash('sha256').update(token).digest('hex')
const activeAssignmentStates = new Set(['unpaid','pending','failed','expired','partial'])
const terminalAssignmentStates = new Set(['paid','refunded','canceled','void','waived','disputed'])

export const paymentLinkError = (code: SafeErrorCode, message: string, status: number, requestId: string = randomUUID(), retryable = status >= 500) =>
  NextResponse.json({ error: { code, message, retryable, request_id: requestId } }, { status, headers: { 'X-Coaches-Hive-Support-Reference': requestId } })

async function audit(input: { linkId?: string|null; event: string; actorId?: string|null; workspaceId: string; ownerType: FeeOwnerType; ownerId: string; assignmentId: string; requestId: string; sessionId?: string|null; paymentIntentId?: string|null; metadata?: Record<string,unknown> }) {
  await supabaseAdmin.from('fee_payment_link_audit_events').insert({
    payment_link_id: input.linkId || null, event_type: input.event, actor_user_id: input.actorId || null,
    workspace_id: input.workspaceId, organization_id: input.ownerType === 'organization' ? input.ownerId : null,
    league_id: input.ownerType === 'league' ? input.ownerId : null, assignment_id: input.assignmentId,
    request_id: input.requestId, stripe_checkout_session_id: input.sessionId || null,
    stripe_payment_intent_id: input.paymentIntentId || null, metadata: input.metadata || {},
  })
}

async function assignmentFor(ownerType: FeeOwnerType, assignmentId: string) {
  if (ownerType === 'organization') {
    const { data, error } = await supabaseAdmin.from('org_fee_assignments')
      .select('id,athlete_id,amount,status,stripe_checkout_session_id,workspace_id,fee_id,org_fees!inner(org_id,title,amount_cents,due_date)')
      .eq('id', assignmentId).maybeSingle()
    if (error) throw error
    if (!data) return null
    const fee = Array.isArray((data as any).org_fees) ? (data as any).org_fees[0] : (data as any).org_fees
    return { ownerType, id: data.id, ownerId: String(fee.org_id), athleteId: String(data.athlete_id), amountCents: Math.round(Number(data.amount ?? Number(fee.amount_cents || 0) / 100) * 100), status: String(data.status), sessionId: data.stripe_checkout_session_id || null, workspaceId: data.workspace_id || null, title: String(fee.title || 'Organization fee'), dueAt: fee.due_date || null }
  }
  const { data, error } = await supabaseAdmin.from('league_fee_assignments')
    .select('id,league_id,athlete_id,org_id,amount_cents,paid_cents,status,checkout_session_id,due_at,league_fees!inner(title,status)')
    .eq('id', assignmentId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const fee = Array.isArray((data as any).league_fees) ? (data as any).league_fees[0] : (data as any).league_fees
  return { ownerType, id: data.id, ownerId: String(data.league_id), athleteId: data.athlete_id ? String(data.athlete_id) : null, amountCents: Number(data.amount_cents) - Number(data.paid_cents || 0), status: String(data.status), sessionId: data.checkout_session_id || null, workspaceId: null, title: String(fee.title || 'League fee'), dueAt: data.due_at || null }
}

async function ownerWorkspace(ownerType: FeeOwnerType, ownerId: string) {
  const column = ownerType === 'organization' ? 'organization_id' : 'league_id'
  const { data } = await supabaseAdmin.from('business_workspaces').select('id,display_name,status,workspace_type,organization_id,league_id').eq(column, ownerId).eq('workspace_type', ownerType).maybeSingle()
  return data && data.status === 'active' ? data : null
}

async function authorizeStaff(request: Request, ownerType: FeeOwnerType, ownerId: string) {
  const user = await getMobileRequestUser(request)
  if (!user) return { denied: 'unauthorized_staff' as const }
  const requestedWorkspaceId = request.headers.get('x-workspace-id')?.trim()
  if (!requestedWorkspaceId) return { denied: 'workspace_owner_mismatch' as const }
  const workspace = await requireWorkspaceContext(user.id, requestedWorkspaceId)
  if (!workspace || workspace.type !== ownerType) return { denied: 'workspace_owner_mismatch' as const }
  if (ownerType === 'organization' && workspace.organizationId !== ownerId) return { denied: 'workspace_owner_mismatch' as const }
  if (ownerType === 'league' && workspace.leagueId !== ownerId) return { denied: 'workspace_owner_mismatch' as const }
  const actingRole = activeWorkspaceRole(workspace, request.headers.get('x-acting-role'))
  if (!actingRole) return { denied: 'unauthorized_staff' as const }
  const canPay = workspace.permissions['payments.manage'] === true || workspace.permissions.manage_payments === true
  const effectiveRoles = actingRole ? [actingRole] : workspace.roles
  if (ownerType === 'organization') {
    const { data: membership } = await supabaseAdmin.from('organization_memberships').select('status').eq('org_id', ownerId).eq('user_id', user.id).eq('status','active').maybeSingle()
    const isAdmin = effectiveRoles.some(role => ['owner','org_admin'].includes(role))
    const isProgramDirector = effectiveRoles.includes('program_director') && canPay
    return membership && (isAdmin || isProgramDirector) ? { user, workspace } : { denied: 'unauthorized_staff' as const }
  }
  const { data: membership } = await supabaseAdmin.from('league_memberships').select('status,role').eq('league_id', ownerId).eq('user_id', user.id).eq('status','active').maybeSingle()
  return membership?.role === 'league_admin' && effectiveRoles.includes('league_admin') && canPay ? { user, workspace } : { denied: 'unauthorized_staff' as const }
}

export async function createStaffPaymentLink(request: Request, ownerType: FeeOwnerType, assignmentId: string) {
  const requestId = requestIdFor(request)
  const body = await request.json().catch(() => ({}))
  const resolvedKey=idempotencyKeyFor(request,body)
  if('error'in resolvedKey)return paymentLinkError('payment_link_failed',resolvedKey.error==='conflict'?'Idempotency-Key and idempotency_key must match.':'A valid Idempotency-Key header is required.',resolvedKey.error==='conflict'?409:400,requestId)
  const idempotencyKey=resolvedKey.key
  try {
    const assignment = await assignmentFor(ownerType, assignmentId)
    if (!assignment) return paymentLinkError('assignment_missing','Fee assignment was not found.',404,requestId)
    const auth = await authorizeStaff(request, ownerType, assignment.ownerId)
    if ('denied' in auth) { const code=auth.denied||'unauthorized_staff'; return paymentLinkError(code,code==='workspace_owner_mismatch'?'The workspace does not own this fee assignment.':'You do not have permission to create this payment link.',403,requestId) }
    const workspace = await ownerWorkspace(ownerType, assignment.ownerId)
    if (!workspace || workspace.id !== auth.workspace.id || (assignment.workspaceId && assignment.workspaceId !== workspace.id)) return paymentLinkError('workspace_owner_mismatch','The workspace does not own this fee assignment.',403,requestId)
    if (terminalAssignmentStates.has(assignment.status)) return paymentLinkError('assignment_already_paid',`This fee is ${assignment.status} and cannot be paid.`,409,requestId,false)
    if (!activeAssignmentStates.has(assignment.status)) return paymentLinkError('session_already_in_progress','This fee already has a payment in progress.',409,requestId,false)
    const connect = await loadStripeConnectAccountStatus(ownerType === 'organization' ? 'org' : 'league', assignment.ownerId, { refresh: true })
    if (!isStripeConnectEnabled(connect)) return paymentLinkError('stripe_connect_incomplete',`${ownerType === 'organization' ? 'Organization' : 'League'} must finish Stripe Connect onboarding before accepting payments.`,409,requestId,false)
    const publicToken = randomBytes(32).toString('base64url')
    const tokenHash = digest(publicToken)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const intendedPayer = assignment.athleteId ? await resolveAthleteProfileOwner(supabaseAdmin, assignment.athleteId) : null
    const { data: prior } = await supabaseAdmin.from('fee_payment_links').select('id,stripe_checkout_session_id').eq('owner_type',ownerType).eq('assignment_id',assignment.id).eq('idempotency_key',idempotencyKey).maybeSingle()
    if (prior?.stripe_checkout_session_id) await stripe.checkout.sessions.expire(prior.stripe_checkout_session_id).catch(() => undefined)
    await supabaseAdmin.from('fee_payment_links').update({ status:'revoked',revoked_at:new Date().toISOString(),updated_at:new Date().toISOString() }).eq('owner_type',ownerType).eq('assignment_id',assignment.id).in('status',['active','checkout_open'])
    const payload = { owner_type:ownerType,workspace_id:workspace.id,organization_id:ownerType==='organization'?assignment.ownerId:null,league_id:ownerType==='league'?assignment.ownerId:null,assignment_id:assignment.id,intended_payer_user_id:intendedPayer,created_by_user_id:auth.user.id,token_hash:tokenHash,idempotency_key:idempotencyKey,status:'active',expires_at:expiresAt,revoked_at:null,stripe_checkout_session_id:null,stripe_payment_intent_id:null,updated_at:new Date().toISOString() }
    const query = prior ? supabaseAdmin.from('fee_payment_links').update(payload).eq('id',prior.id) : supabaseAdmin.from('fee_payment_links').insert(payload)
    const { data: link, error } = await query.select('id').single()
    if (error || !link) throw error || new Error('Unable to store payment link')
    await audit({linkId:link.id,event:prior?'link_regenerated':'link_created',actorId:auth.user.id,workspaceId:workspace.id,ownerType,ownerId:assignment.ownerId,assignmentId:assignment.id,requestId})
    return NextResponse.json({ payment_url:`${resolveBaseUrl()}/pay/${publicToken}`,assignment_id:assignment.id,status:'active',expires_at:expiresAt,request_id:requestId })
  } catch (error) {
    console.error('staff payment link creation failed', { requestId, ownerType, assignmentId, error: error instanceof Error ? error.message : 'unknown' })
    return paymentLinkError('payment_link_failed','Unable to create the payment link.',500,requestId,true)
  }
}

export async function revokeStaffPaymentLinks(request: Request, ownerType: FeeOwnerType, assignmentId: string) {
  const requestId = requestIdFor(request)
  try {
    const assignment = await assignmentFor(ownerType, assignmentId)
    if (!assignment) return paymentLinkError('assignment_missing','Fee assignment was not found.',404,requestId)
    const auth = await authorizeStaff(request, ownerType, assignment.ownerId)
    if ('denied' in auth) { const code=auth.denied||'unauthorized_staff'; return paymentLinkError(code,code==='workspace_owner_mismatch'?'The workspace does not own this fee assignment.':'You do not have permission to revoke this payment link.',403,requestId) }
    const { data: links } = await supabaseAdmin.from('fee_payment_links').select('id,stripe_checkout_session_id').eq('owner_type',ownerType).eq('assignment_id',assignmentId).in('status',['active','checkout_open'])
    await Promise.all((links||[]).map(link => link.stripe_checkout_session_id ? stripe.checkout.sessions.expire(link.stripe_checkout_session_id).catch(()=>undefined) : Promise.resolve()))
    await supabaseAdmin.from('fee_payment_links').update({status:'revoked',revoked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('owner_type',ownerType).eq('assignment_id',assignmentId).in('status',['active','checkout_open'])
    await audit({event:'link_revoked',actorId:auth.user.id,workspaceId:auth.workspace.id,ownerType,ownerId:assignment.ownerId,assignmentId,requestId,metadata:{count:(links||[]).length}})
    return NextResponse.json({})
  } catch (error) {
    console.error('staff payment link revocation failed', { requestId, ownerType, assignmentId, error: error instanceof Error ? error.message : 'unknown' })
    return paymentLinkError('payment_link_failed','Unable to revoke the payment link.',500,requestId,true)
  }
}

export async function getPublicPaymentLink(token: string, request?: Request, recordOpen = false) {
  const tokenHash = digest(token)
  const { data: link } = await supabaseAdmin.from('fee_payment_links').select('*').eq('token_hash',tokenHash).maybeSingle()
  if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now() || !['active','checkout_open'].includes(link.status)) return null
  const assignment = await assignmentFor(link.owner_type as FeeOwnerType,link.assignment_id)
  if (!assignment || terminalAssignmentStates.has(assignment.status)) return null
  const workspace = await ownerWorkspace(link.owner_type as FeeOwnerType,assignment.ownerId)
  const user = request ? await getMobileRequestUser(request) : null
  const verified = Boolean(user && (!link.intended_payer_user_id || link.intended_payer_user_id === user.id) && (!assignment.athleteId || await userOwnsAthleteProfile(supabaseAdmin,user.id,assignment.athleteId)))
  let athleteName: string|null = null
  if (verified && assignment.athleteId) {
    const { data: athlete } = await supabaseAdmin.from('athlete_profiles').select('first_name,last_name').eq('id',assignment.athleteId).maybeSingle()
    if (athlete) athleteName = [athlete.first_name,athlete.last_name].filter(Boolean).join(' ') || 'Athlete'
    else { const { data: profile } = await supabaseAdmin.from('profiles').select('full_name').eq('id',assignment.athleteId).maybeSingle(); athleteName=profile?.full_name||'Athlete' }
  }
  const contract = calculateOrganizationPayment(assignment.amountCents)
  const { data: branding } = assignment.ownerType === 'organization'
    ? await supabaseAdmin.from('org_settings').select('brand_logo_url').eq('org_id',assignment.ownerId).maybeSingle()
    : { data: null }
  if (recordOpen) {
    const requestId=randomUUID()
    await audit({linkId:link.id,event:'link_opened',actorId:user?.id||null,workspaceId:link.workspace_id,ownerType:assignment.ownerType,ownerId:assignment.ownerId,assignmentId:assignment.id,requestId})
    if (verified) await audit({linkId:link.id,event:'payer_verified',actorId:user!.id,workspaceId:link.workspace_id,ownerType:assignment.ownerType,ownerId:assignment.ownerId,assignmentId:assignment.id,requestId})
  }
  return { link, assignment, workspace, verified, athleteName, contract, tokenHash, logoUrl:branding?.brand_logo_url||null }
}

export async function createPublicPaymentCheckout(token: string, request: Request) {
  const requestId = requestIdFor(request)
  let claimedView: Awaited<ReturnType<typeof getPublicPaymentLink>> = null
  let didClaim = false
  try {
    const body=await request.json().catch(()=>({}))
    const resolvedKey=idempotencyKeyFor(request,body)
    if('error'in resolvedKey)return paymentLinkError('payment_link_failed',resolvedKey.error==='conflict'?'Idempotency-Key and idempotency_key must match.':'A valid Idempotency-Key header is required.',resolvedKey.error==='conflict'?409:400,requestId,false)
    const view = await getPublicPaymentLink(token,request)
    if (!view) return paymentLinkError('expired_or_revoked_link','This payment link is expired, revoked, or unavailable.',410,requestId,false)
    const user = await getMobileRequestUser(request)
    if (!user || !view.verified) return paymentLinkError('invalid_payer_verification','Sign in with the intended payer account before continuing.',403,requestId,false)
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc('claim_fee_payment_link_checkout',{p_link_id:view.link.id,p_token_hash:view.tokenHash})
    if (claimError || !claimed) return paymentLinkError('session_already_in_progress','This payment is no longer available.',409,requestId,false)
    if (claimed.stripe_checkout_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(claimed.stripe_checkout_session_id).catch(()=>null)
      if (existing?.status==='open' && existing.url) return NextResponse.json({checkout_url:existing.url,request_id:requestId,reused:true})
    }
    claimedView=view
    didClaim=true
    const connect = await loadStripeConnectAccountStatus(view.assignment.ownerType==='organization'?'org':'league',view.assignment.ownerId,{refresh:true})
    if (!isStripeConnectEnabled(connect)) return paymentLinkError('stripe_connect_incomplete','The payment recipient is not ready to accept payments.',409,requestId,false)
    let { data: payer } = await supabaseAdmin.from('profiles').select('email,stripe_customer_id').eq('id',user.id).maybeSingle()
    let customerId = payer?.stripe_customer_id || null
    if (!customerId) {
      const customer = await stripe.customers.create({email:payer?.email||user.email||undefined,metadata:{coachesHiveUserId:user.id}},{idempotencyKey:`payer-customer:${user.id}`})
      customerId=customer.id
      await supabaseAdmin.from('profiles').update({stripe_customer_id:customerId}).eq('id',user.id)
    }
    const session = await stripe.checkout.sessions.create({mode:'payment',customer:customerId,payment_method_types:['card','us_bank_account'],line_items:organizationCheckoutLineItems(view.assignment.title,view.contract),success_url:`${resolveBaseUrl()}/pay/${token}?checkout=return&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${resolveBaseUrl()}/pay/${token}?checkout=canceled`,client_reference_id:user.id,payment_intent_data:{application_fee_amount:view.contract.application_fee_cents,transfer_data:{destination:connect!.stripeAccountId},on_behalf_of:connect!.stripeAccountId,statement_descriptor_suffix:'COACHES HIVE',metadata:{request_id:requestId,checkout_type:view.assignment.ownerType==='organization'?'org_fee':'league_fee',assignment_id:view.assignment.id,payment_record_id:view.assignment.id,org_id:view.assignment.ownerType==='organization'?view.assignment.ownerId:'',league_id:view.assignment.ownerType==='league'?view.assignment.ownerId:'',workspace_id:view.link.workspace_id,athlete_profile_id:view.assignment.athleteId||'',payer_user_id:user.id,payment_link_id:view.link.id,...organizationPaymentMetadata(view.contract)}},metadata:{request_id:requestId,checkout_type:view.assignment.ownerType==='organization'?'org_fee':'league_fee',assignment_id:view.assignment.id,payment_record_id:view.assignment.id,payment_link_id:view.link.id,payer_user_id:user.id},expires_at:Math.floor(Date.now()/1000)+30*60},{idempotencyKey:`staff-payment-link:${view.link.id}:${createHash('sha256').update(resolvedKey.key).digest('hex')}`})
    if (!session.url) throw new Error('Stripe did not return a checkout URL')
    const table=view.assignment.ownerType==='organization'?'org_fee_assignments':'league_fee_assignments'
    const sessionColumn=view.assignment.ownerType==='organization'?'stripe_checkout_session_id':'checkout_session_id'
    const update:any={[sessionColumn]:session.id,status:'processing'}
    if(view.assignment.ownerType==='league'){update.updated_at=new Date().toISOString();update.currency='usd'}
    await Promise.all([
      supabaseAdmin.from(table).update(update).eq('id',view.assignment.id),
      supabaseAdmin.from('fee_payment_links').update({stripe_checkout_session_id:session.id,status:'checkout_open',updated_at:new Date().toISOString()}).eq('id',view.link.id),
      audit({linkId:view.link.id,event:'checkout_created',actorId:user.id,workspaceId:view.link.workspace_id,ownerType:view.assignment.ownerType,ownerId:view.assignment.ownerId,assignmentId:view.assignment.id,requestId,sessionId:session.id}),
    ])
    return NextResponse.json({checkout_url:session.url,expires_at:new Date(session.expires_at*1000).toISOString(),request_id:requestId})
  } catch (error) {
    if(didClaim&&claimedView){
      const table=claimedView.assignment.ownerType==='organization'?'org_fee_assignments':'league_fee_assignments'
      await supabaseAdmin.from(table).update({status:claimedView.assignment.status,updated_at:new Date().toISOString()}).eq('id',claimedView.assignment.id).eq('status','processing')
      await supabaseAdmin.from('fee_payment_links').update({status:'active',updated_at:new Date().toISOString()}).eq('id',claimedView.link.id).is('stripe_checkout_session_id',null)
    }
    console.error('public payment checkout failed',{requestId,error:error instanceof Error?error.message:'unknown'})
    return paymentLinkError('stripe_temporarily_unavailable','Unable to start secure checkout. Please try again.',503,requestId,true)
  }
}
