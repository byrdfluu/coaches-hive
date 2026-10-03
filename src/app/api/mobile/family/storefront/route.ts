import { NextResponse } from 'next/server'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { requestIdFor } from '@/lib/requestSecurity'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseUuid } from '@/lib/uuid'
import { normalizeOfferingBilling, type OfferingBillingType } from '@/lib/offeringBilling'
import { loadFamilyOrganizationContact } from '@/lib/familyOrganizationContact'
import { mobileApiError } from '@/lib/mobileApiContract'

export const dynamic = 'force-dynamic'

type Offering = {
  offering_type: string
  offering_id: string
  organization_id: string
  title: string
  description: string | null
  image_url: string | null
  amount_cents: number
  billing_type: OfferingBillingType
  billing_interval: string | null
  start_date: string | null
  end_date: string | null
  capacity: number | null
  availability: number | null
  athlete_eligibility: { eligible: boolean; reasons: string[] }
  status: 'available' | 'ineligible' | 'pending_payment' | 'processing' | 'purchased' | 'registered' | 'active_subscription' | 'sold_out' | 'registration_closed' | 'canceled' | 'refunded' | 'partially_refunded'
  location: string | null
  purchase_limit: string | null
  included_per_cycle: string | null
  first_charge_date: string | null
  next_billing_date: string | null
  cancellation_terms: string | null
  credits_roll_over: boolean | null
  refund_policy: string | null
  validity_days: number | null
  checkout_required: boolean
  checkout_available: boolean
  checkout_type: string | null
  checkout_record_id: string | null
}

const unavailable = (message: string, status: number, requestId: string, code?: string) => {
  console.warn('[mobile/family/storefront]', { request_id: requestId, status, message })
  return mobileApiError({ code: code || (status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'INVALID_REQUEST'),
    message, status, retryable: status === 429 || status >= 500, requestId })
}
const cents = (value: unknown) => Math.max(0, Math.round(Number(value || 0) * 100))
const directCents = (value: unknown) => Math.max(0, Math.round(Number(value || 0)))
const terms = (row: any) => ({
  location: row?.location || null,
  purchase_limit: row?.purchase_limit == null ? null : String(row.purchase_limit),
  included_per_cycle: row?.included_per_cycle == null ? null : String(row.included_per_cycle),
  first_charge_date: null,
  next_billing_date: null,
  cancellation_terms: row?.cancellation_terms || null,
  credits_roll_over: row?.credits_roll_over == null ? null : Boolean(row.credits_roll_over),
  refund_policy: row?.refund_policy || row?.refund_terms || null,
  validity_days: row?.validity_days == null ? null : Number(row.validity_days),
})

const paymentStatus = (transaction: any): Offering['status'] | null => {
  if (!transaction) return null
  if (transaction.status === 'refunded') return 'refunded'
  if (transaction.status === 'partially_refunded' || Number(transaction.refunded_amount_cents || 0) > 0) return 'partially_refunded'
  if (transaction.status === 'processing' || transaction.status === 'pending') return 'processing'
  return null
}

const registrationStatus = (status: unknown): Offering['status'] | null => {
  const value = String(status || '').toLowerCase().replace('cancelled', 'canceled')
  if (['paid', 'confirmed', 'registered', 'completed', 'accepted', 'active'].includes(value)) return 'registered'
  if (value === 'pending') return 'pending_payment'
  if (value === 'processing') return 'processing'
  if (value === 'canceled') return 'canceled'
  if (value === 'refunded') return 'refunded'
  if (value === 'partially_refunded') return 'partially_refunded'
  return null
}

/**
 * Public URLs are already durable. Private offering images are persisted as
 * storage://<bucket>/<object path>, never as an expiring signed URL. Re-signing
 * here means image replacement/deletion is reflected on the next no-cache
 * storefront request without copying media into checkout/payment records.
 */
async function storefrontImageUrl(value: unknown): Promise<string | null> {
  const persisted = typeof value === 'string' ? value.trim() : ''
  if (!persisted) return null
  if (/^https:\/\//i.test(persisted)) return persisted
  if (!persisted.startsWith('storage://')) return null

  const objectReference = persisted.slice('storage://'.length)
  const separator = objectReference.indexOf('/')
  if (separator <= 0 || separator === objectReference.length - 1) return null
  const bucket = objectReference.slice(0, separator)
  const path = objectReference.slice(separator + 1)
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7)
  if (error) {
    console.warn('[mobile/family/storefront] offering image unavailable', { bucket, code: error.message })
    return null
  }
  return data?.signedUrl || null
}

export async function GET(request: Request) {
  const requestId = requestIdFor(request)
  const user = await getMobileRequestUser(request)
  if (!user) return unavailable('Authentication is required.', 401, requestId)
  const url = new URL(request.url)
  const orgId = parseUuid(url.searchParams.get('organization_id') || url.searchParams.get('org_id'))
  const athleteId = parseUuid(url.searchParams.get('athlete_profile_id') || url.searchParams.get('athlete_id'))
  if (!orgId || !athleteId) return unavailable('Organization and athlete are required.', 422, requestId)
  const athlete = await resolveAuthorizedAthleteContext(user.id, athleteId)
  if (!athlete) return unavailable('Athlete profile is unavailable.', 404, requestId, 'ATHLETE_PROFILE_UNAVAILABLE')

  const [{ data: workspace }, { data: athleteProfile }] = await Promise.all([
    supabaseAdmin.from('business_workspaces').select('id,status').eq('workspace_type', 'organization')
      .eq('organization_id', orgId).eq('status', 'active').maybeSingle(),
    supabaseAdmin.from('athlete_profiles').select('id,full_name,birthdate,grade_level,sport').eq('id', athlete.profileId).maybeSingle(),
  ])
  if (!workspace) return unavailable('Organization storefront is unavailable.', 404, requestId)
  if (!athleteProfile) return unavailable('Athlete profile is unavailable.', 404, requestId, 'ATHLETE_PROFILE_UNAVAILABLE')

  const inventoryResults = await Promise.all([
    supabaseAdmin.from('org_team_members').select('team_id').eq('athlete_id', athlete.profileId),
    supabaseAdmin.from('org_fee_assignments')
      .select('id,fee_id,status,athlete_id,amount,org_fees!inner(id,org_id,title,description,image_url,amount_cents,due_date,audience_type,team_id,publication_status,location,purchase_limit,included_per_cycle,cancellation_terms,credits_roll_over,refund_policy)')
      .eq('athlete_id', athlete.profileId).eq('org_fees.org_id', orgId),
    supabaseAdmin.from('org_fees').select('id,org_id,title,description,image_url,amount_cents,due_date,audience_type,team_id,publication_status,location,purchase_limit,included_per_cycle,cancellation_terms,credits_roll_over,refund_policy')
      .eq('org_id', orgId).eq('publication_status', 'published'),
    supabaseAdmin.from('organization_recurring_fee_offer_assignments').select('offer_id,status')
      .eq('athlete_id', athlete.profileId).in('status', ['offered','accepted']),
    supabaseAdmin.from('organization_recurring_fee_offers').select('*').eq('organization_id', orgId).eq('status', 'published'),
    supabaseAdmin.from('programs').select('id,name,description,image_url,type,price,billing_type,billing_interval,start_date,end_date,capacity,status,eligible_grades,eligible_age_min,eligible_age_max,eligible_birth_year_min,eligible_birth_year_max,eligible_sports,location,purchase_limit,included_per_cycle,cancellation_terms,credits_roll_over,refund_policy')
      .eq('org_id', orgId).eq('status', 'active').is('archived_at', null)
      .or(`end_date.gte.${new Date().toISOString().slice(0,10)},and(end_date.is.null,start_date.gte.${new Date().toISOString().slice(0,10)}),and(end_date.is.null,start_date.is.null)`),
    supabaseAdmin.from('org_tryouts').select('id,title,notes,image_url,price,billing_type,billing_interval,tryout_date,max_participants,status,location,purchase_limit,included_per_cycle,cancellation_terms,credits_roll_over,refund_policy')
      .eq('org_id', orgId).in('status', ['open','published','active']).is('archived_at', null)
      .gte('tryout_date', new Date().toISOString().slice(0,10)),
    supabaseAdmin.from('sessions').select('id,title,notes,image_url,start_time,end_time,price,price_cents,billing_type,billing_interval,status,team_id,athlete_profile_id,athlete_id,location,purchase_limit,included_per_cycle,cancellation_terms,credits_roll_over,refund_policy')
      .eq('org_id', orgId).is('athlete_profile_id', null).is('athlete_id', null)
      .is('archived_at', null).or(`end_time.gt.${new Date().toISOString()},and(end_time.is.null,start_time.gte.${new Date().toISOString()})`)
      .in('status', ['available','open','scheduled']).order('start_time').limit(100),
    supabaseAdmin.from('marketplace_items').select('id,name,description,image_url,price,billing_type,billing_interval,item_type,is_active,inventory_count,location,purchase_limit,included_per_cycle,cancellation_terms,credits_roll_over,refund_policy')
      .eq('org_id', orgId).eq('is_active', true),
    supabaseAdmin.from('org_training_packages')
      .select('id,name,description,image_url,price_cents,billing_type,billing_interval,offering_type,status,location,purchase_limit,included_per_cycle,cancellation_terms,credits_roll_over,refund_policy,validity_days,group_credits,one_on_one_credits')
      .eq('org_id', orgId).eq('status', 'published'),
  ])
  const inventoryError = inventoryResults.find(result => result.error)?.error
  if (inventoryError) {
    console.error('[mobile/family/storefront] inventory query failed', { request_id: requestId, code: inventoryError.code })
    return unavailable('Offerings are temporarily unavailable. Please try again.', 503, requestId, 'STOREFRONT_UNAVAILABLE')
  }
  const inventoryData = inventoryResults.map(result => result.data || []) as any[][]
  const [teamRows,feeAssignments,publishedFees,recurringAssignments,recurringOffers,programs,tryouts,sessions,products,trainingPackages] = inventoryData

  const teamIds = new Set((teamRows || []).map(row => row.team_id))
  const programIds = (programs || []).map(row => row.id)
  const relationshipResults = await Promise.all([
    programIds.length ? supabaseAdmin.from('org_program_targets').select('program_id,target_type,team_id,athlete_id').in('program_id', programIds) : Promise.resolve({ data: [], error: null }),
    programIds.length ? supabaseAdmin.from('program_registrations').select('id,program_id,athlete_profile_id,status').in('program_id', programIds) : Promise.resolve({ data: [], error: null }),
    (tryouts || []).length ? supabaseAdmin.from('org_tryout_registrations').select('id,tryout_id,athlete_profile_id,status').in('tryout_id', (tryouts || []).map(row => row.id)) : Promise.resolve({ data: [], error: null }),
    (trainingPackages || []).length ? supabaseAdmin.from('org_training_package_purchases')
      .select('id,package_id,athlete_id,status,created_at,updated_at,current_period_end,stripe_checkout_session_id,stripe_subscription_id,superseded_at').eq('athlete_id', athlete.profileId)
      .is('superseded_at', null)
      .in('package_id', (trainingPackages || []).map(row => row.id)).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.from('offering_recurring_subscriptions')
      .select('offering_type,offering_id,status,created_at,current_period_end,canceled_at')
      .eq('organization_id', orgId).eq('athlete_profile_id', athlete.profileId).order('created_at', { ascending: false }),
    supabaseAdmin.from('organization_recurring_fees')
      .select('offer_id,status,start_date,created_at,current_period_end,canceled_at')
      .eq('organization_id', orgId).eq('athlete_id', athlete.profileId).order('created_at', { ascending: false }),
    supabaseAdmin.from('payment_transactions')
      .select('source_record_type,source_record_id,status,gross_amount_cents,refunded_amount_cents,metadata,occurred_at')
      .eq('org_id', orgId).eq('athlete_profile_id', athlete.profileId).order('occurred_at', { ascending: false }),
    supabaseAdmin.from('checkout_purchase_attempts')
      .select('purchase_id,checkout_record_id,stripe_checkout_session_id,status,expires_at')
      .eq('organization_id', orgId).eq('athlete_profile_id', athlete.profileId).eq('checkout_type', 'training_package')
      .in('status', ['processing','checkout_pending']).gt('expires_at', new Date().toISOString()),
  ])
  const relationshipError = relationshipResults.find(result => result.error)?.error
  if (relationshipError) {
    console.error('[mobile/family/storefront] eligibility query failed', { request_id: requestId, code: relationshipError.code })
    return unavailable('Offerings are temporarily unavailable. Please try again.', 503, requestId, 'STOREFRONT_UNAVAILABLE')
  }
  const relationshipData = relationshipResults.map(result => result.data || []) as any[][]
  const [programTargets,programRegistrations,tryoutRegistrations,trainingPurchases,recurringSubscriptions,recurringFees,paymentTransactions,checkoutAttempts] = relationshipData

  const transactionFor = (...ids: Array<string | null | undefined>) => (paymentTransactions || []).find(row => {
    const candidates = new Set(ids.filter(Boolean))
    return candidates.has(row.source_record_id) || candidates.has(row.metadata?.offering_id) || candidates.has(row.metadata?.item_id)
      || candidates.has(row.metadata?.package_id) || candidates.has(row.metadata?.registration_id)
  })
  const recurringFor = (type: string, id: string) => (recurringSubscriptions || []).find(row => row.offering_type === type && row.offering_id === id)

  const assignedOfferIds = new Set((recurringAssignments || []).map(row => row.offer_id))
  const offerings: Offering[] = []
  const feeRows=new Map<string,{fee:any;assignment:any}>()
  for(const row of feeAssignments||[]){const fee=Array.isArray((row as any).org_fees)?(row as any).org_fees[0]:(row as any).org_fees
    if(fee)feeRows.set(fee.id,{fee,assignment:row})}
  for(const fee of publishedFees||[]){const eligible=fee.audience_type==='all'||(fee.audience_type==='team'&&fee.team_id&&teamIds.has(fee.team_id))
    if(eligible&&!feeRows.has(fee.id))feeRows.set(fee.id,{fee,assignment:null})}
  for (const {fee,assignment:row} of Array.from(feeRows.values())) {
    const amount = directCents(fee.amount_cents || Math.round(Number(row?.amount || 0) * 100))
    const txStatus=paymentStatus(transactionFor(row?.id,fee.id))
    const feeStatus:Offering['status']=txStatus||(row?.status==='paid'?'purchased':row?.status==='processing'?'processing':row?.status==='canceled'?'canceled':row?.status==='refunded'?'refunded':row?.status==='partial'?'pending_payment':'available')
    const feeAvailable=amount>0&&!['purchased','processing','refunded','canceled'].includes(feeStatus)
    offerings.push({ offering_type:'organization_fee',offering_id:fee.id,organization_id:orgId,title:fee.title,
      billing_type:amount>0?'one_time':'free',
      description:fee.description||null,image_url:fee.image_url||null,amount_cents:amount,billing_interval:null,start_date:null,end_date:fee.due_date||null,
      capacity:null,availability:null,athlete_eligibility:{eligible:true,reasons:[]},status:feeStatus,
      checkout_required:amount>0,checkout_available:feeAvailable,checkout_type:'fee',checkout_record_id:row?.id||null,...terms(fee) })
  }
  for (const offer of recurringOffers || []) {
    if (!assignedOfferIds.has(offer.id) && offer.self_enrollment_enabled !== true) continue
    const subscription=(recurringFees||[]).find(row=>row.offer_id===offer.id)
    const active=['trialing','active'].includes(String(subscription?.status))
    const recurringStatus:Offering['status']=active?'active_subscription':subscription?.status==='canceled'?'canceled':subscription?'pending_payment':'available'
    offerings.push({ offering_type:'recurring_plan',offering_id:offer.id,organization_id:orgId,title:offer.description,
      billing_type:'recurring',
      description:offer.description,image_url:offer.image_url||null,amount_cents:directCents(offer.amount_cents),billing_interval:offer.interval,
      start_date:null,end_date:offer.end_date||null,capacity:null,availability:null,
      athlete_eligibility:{eligible:!active,reasons:active?['already_enrolled']:[]},status:recurringStatus,checkout_required:true,checkout_available:!active,
      checkout_type:'recurring_fee',checkout_record_id:offer.id,...terms(offer),first_charge_date:subscription?.start_date||subscription?.created_at||null,
      next_billing_date:subscription?.current_period_end||null })
  }
  for (const program of programs || []) {
    const targets=(programTargets||[]).filter(row=>row.program_id===program.id)
    const targetEligible=!targets.length||targets.some(row=>row.target_type==='organization'
      ||(row.target_type==='athlete'&&row.athlete_id===athlete.profileId)||(row.target_type==='team'&&row.team_id&&teamIds.has(row.team_id)))
    const reasons:string[]=[]
    if(!targetEligible)reasons.push('not_in_target_audience')
    const birthDate=athleteProfile.birthdate?new Date(`${athleteProfile.birthdate}T12:00:00Z`):null
    const age=birthDate&&Number.isFinite(birthDate.getTime())?Math.floor((Date.now()-birthDate.getTime())/31557600000):null
    const birthYear=birthDate?birthDate.getUTCFullYear():null
    if((program.eligible_age_min!=null||program.eligible_age_max!=null||program.eligible_birth_year_min!=null||program.eligible_birth_year_max!=null)&&age==null)reasons.push('birthdate_required')
    if(program.eligible_age_min!=null&&age!=null&&age<Number(program.eligible_age_min))reasons.push('below_minimum_age')
    if(program.eligible_age_max!=null&&age!=null&&age>Number(program.eligible_age_max))reasons.push('above_maximum_age')
    if(program.eligible_birth_year_min!=null&&birthYear!=null&&birthYear<Number(program.eligible_birth_year_min))reasons.push('birth_year_ineligible')
    if(program.eligible_birth_year_max!=null&&birthYear!=null&&birthYear>Number(program.eligible_birth_year_max))reasons.push('birth_year_ineligible')
    if(Array.isArray(program.eligible_grades)&&program.eligible_grades.length&&(!athleteProfile.grade_level||!program.eligible_grades.includes(athleteProfile.grade_level)))reasons.push(athleteProfile.grade_level?'grade_ineligible':'grade_required')
    if(Array.isArray(program.eligible_sports)&&program.eligible_sports.length&&(!athleteProfile.sport||!program.eligible_sports.includes(athleteProfile.sport)))reasons.push(athleteProfile.sport?'sport_ineligible':'sport_required')
    const occupied=(programRegistrations||[]).filter(row=>row.program_id===program.id).length
    const existing=(programRegistrations||[]).find(row=>row.program_id===program.id&&row.athlete_profile_id===athlete.profileId)
    const capacity=program.capacity==null?null:Number(program.capacity),available=capacity&&capacity>0?Math.max(0,capacity-occupied):null
    const amount=cents(program.price)
    const billing=normalizeOfferingBilling(program.billing_type,program.billing_interval,amount)
    const subscription=recurringFor('program',program.id)
    const txStatus=paymentStatus(transactionFor(existing?.id,program.id))
    const closed=Boolean(program.end_date&&new Date(program.end_date).getTime()<Date.now())
    const activeSubscription=['trialing','active'].includes(String(subscription?.status))
    const programStatus:Offering['status']=txStatus||(activeSubscription?'active_subscription':registrationStatus(existing?.status)||(reasons.length?'ineligible':available===0?'sold_out':closed?'registration_closed':'available'))
    offerings.push({offering_type:String(program.type||'program'),offering_id:program.id,organization_id:orgId,title:program.name,
      description:program.description||null,image_url:program.image_url||null,amount_cents:amount,billing_type:billing.billingType,billing_interval:billing.billingInterval,start_date:program.start_date||null,end_date:program.end_date||null,
      capacity,availability:available,athlete_eligibility:{eligible:!reasons.length&&available!==0&&!closed,reasons:[...reasons,...(available===0?['capacity_full']:[]),...(closed?['registration_closed']:[])]},status:programStatus,
      checkout_required:amount>0,checkout_available:programStatus==='available',checkout_type:billing.billingType==='recurring'?'recurring_offering':'program',checkout_record_id:existing?.id||null,...terms(program),
      first_charge_date:subscription?.created_at||null,next_billing_date:subscription?.current_period_end||null})
  }
  for(const tryout of tryouts||[]){const registrations=(tryoutRegistrations||[]).filter(row=>row.tryout_id===tryout.id),existing=registrations.find(row=>row.athlete_profile_id===athlete.profileId)
    const capacity=tryout.max_participants==null?null:Number(tryout.max_participants),available=capacity&&capacity>0?Math.max(0,capacity-registrations.length):null,amount=cents(tryout.price),billing=normalizeOfferingBilling(tryout.billing_type,tryout.billing_interval,amount)
    const subscription=recurringFor('tryout',tryout.id),txStatus=paymentStatus(transactionFor(existing?.id,tryout.id)),closed=Boolean(tryout.tryout_date&&new Date(tryout.tryout_date).getTime()<Date.now()),activeSubscription=['trialing','active'].includes(String(subscription?.status))
    const tryoutStatus:Offering['status']=txStatus||(activeSubscription?'active_subscription':registrationStatus(existing?.status)||(available===0?'sold_out':closed?'registration_closed':'available'))
    offerings.push({offering_type:'tryout',offering_id:tryout.id,organization_id:orgId,title:tryout.title,description:tryout.notes||null,
      image_url:tryout.image_url||null,amount_cents:amount,billing_type:billing.billingType,billing_interval:billing.billingInterval,start_date:tryout.tryout_date||null,end_date:null,capacity,availability:available,
      athlete_eligibility:{eligible:available!==0&&!closed,reasons:[...(available===0?['capacity_full']:[]),...(closed?['registration_closed']:[])]},status:tryoutStatus,checkout_required:amount>0,
      checkout_available:tryoutStatus==='available',checkout_type:billing.billingType==='recurring'?'recurring_offering':'tryout',checkout_record_id:existing?.id||null,...terms(tryout),first_charge_date:subscription?.created_at||null,next_billing_date:subscription?.current_period_end||null})}
  for(const session of sessions||[]){if(session.team_id&&!teamIds.has(session.team_id))continue;const amount=directCents(session.price_cents||Math.round(Number(session.price||0)*100)),billing=normalizeOfferingBilling(session.billing_type,session.billing_interval,amount)
    const subscription=recurringFor('session',session.id),activeSubscription=['trialing','active'].includes(String(subscription?.status)),sessionStatus:Offering['status']=activeSubscription?'active_subscription':subscription?.status==='canceled'?'canceled':'available'
    offerings.push({offering_type:'bookable_session',offering_id:session.id,organization_id:orgId,title:session.title||'Training session',description:session.notes||null,
      image_url:session.image_url||null,amount_cents:amount,billing_type:billing.billingType,billing_interval:billing.billingInterval,start_date:session.start_time,end_date:session.end_time,capacity:1,availability:1,
      athlete_eligibility:{eligible:!activeSubscription,reasons:activeSubscription?['already_enrolled']:[]},status:sessionStatus,checkout_required:amount>0,
      checkout_available:billing.billingType==='recurring'&&!activeSubscription,checkout_type:billing.billingType==='recurring'?'recurring_offering':'session',checkout_record_id:null,...terms(session),first_charge_date:subscription?.created_at||null,next_billing_date:subscription?.current_period_end||null})}
  for(const trainingPackage of trainingPackages||[]){
    const packagePurchases=(trainingPurchases||[]).filter(row=>row.package_id===trainingPackage.id)
    const activePurchase=packagePurchases.find(row=>['active','paid','past_due'].includes(String(row.status)))
    const resumablePending=packagePurchases.find(row=>row.status==='pending'&&Boolean(row.stripe_checkout_session_id)
      &&(checkoutAttempts||[]).some(attempt=>(attempt.purchase_id===row.id||attempt.checkout_record_id===row.id)
        &&attempt.stripe_checkout_session_id===row.stripe_checkout_session_id&&new Date(attempt.expires_at).getTime()>Date.now()))
    const existing=activePurchase||resumablePending
    const recurring=trainingPackage.billing_type==='recurring'
    const activeRecurring=recurring&&existing&&['active','past_due'].includes(String(existing.status))
    const txStatus=paymentStatus(transactionFor(existing?.id,trainingPackage.id))
    const trainingStatus:Offering['status']=txStatus||(activeRecurring?'active_subscription':existing?.status==='pending'?'pending_payment':existing?.status==='canceled'?'canceled':existing?.status==='active'?'purchased':'available')
    const packageTerms=terms(trainingPackage)
    const cycleCredits=Number(trainingPackage.group_credits || 0)+Number(trainingPackage.one_on_one_credits || 0)
    const includedPerCycle=packageTerms.included_per_cycle ?? (recurring&&cycleCredits>0?String(cycleCredits):null)
    offerings.push({offering_type:trainingPackage.offering_type==='drop_in'?'drop_in_package':'training_package',offering_id:trainingPackage.id,
      organization_id:orgId,title:trainingPackage.name,description:trainingPackage.description||null,amount_cents:directCents(trainingPackage.price_cents),billing_type:recurring?'recurring':Number(trainingPackage.price_cents)>0?'one_time':'free',
      image_url:trainingPackage.image_url||null,billing_interval:recurring?trainingPackage.billing_interval:null,start_date:null,end_date:null,capacity:null,availability:null,
      athlete_eligibility:{eligible:!activeRecurring,reasons:activeRecurring?['already_enrolled']:[]},status:trainingStatus,
      checkout_required:Number(trainingPackage.price_cents)>0,checkout_available:['available','canceled','pending_payment'].includes(trainingStatus),
      checkout_type:'training_package',checkout_record_id:existing?.id||null,...packageTerms,included_per_cycle:includedPerCycle,
      validity_days:recurring?null:packageTerms.validity_days,first_charge_date:existing?.created_at||null,next_billing_date:existing?.current_period_end||null})
  }
  for(const product of products||[]){const amount=cents(product.price),packageItem=['training_package','package'].includes(String(product.item_type)),billing=normalizeOfferingBilling(product.billing_type,product.billing_interval,amount)
    const subscription=recurringFor('marketplace_product',product.id),activeSubscription=['trialing','active'].includes(String(subscription?.status)),txStatus=paymentStatus(transactionFor(product.id))
    const soldOut=product.inventory_count===0,productStatus:Offering['status']=txStatus||(activeSubscription?'active_subscription':soldOut?'sold_out':'available')
    offerings.push({offering_type:packageItem?'training_package':'marketplace_product',offering_id:product.id,organization_id:orgId,title:product.name,
      description:product.description||null,image_url:product.image_url||null,amount_cents:amount,billing_type:billing.billingType,billing_interval:billing.billingInterval,start_date:null,end_date:null,capacity:product.inventory_count,
      availability:product.inventory_count,athlete_eligibility:{eligible:product.inventory_count==null||product.inventory_count>0,reasons:product.inventory_count===0?['sold_out']:[]},
      status:productStatus,checkout_required:amount>0,checkout_available:productStatus==='available',checkout_type:billing.billingType==='recurring'?'recurring_offering':'marketplace',checkout_record_id:product.id,...terms(product),first_charge_date:subscription?.created_at||null,next_billing_date:subscription?.current_period_end||null})}

  // A source row has exactly one canonical storefront representation. This
  // prevents legacy aliases (for example camp/programs or tryout/tryouts) from
  // causing duplicate cards or duplicate checkout attempts in mobile clients.
  const canonicalRows=Array.from(new Map(offerings.map(item=>[item.offering_id,item])).values())
  const canonicalOfferings=await Promise.all(canonicalRows.map(async item=>({
    ...item,
    image_url:await storefrontImageUrl(item.image_url),
  })))
  const categories=Array.from(new Set(canonicalOfferings.map(item=>item.offering_type))).map(type=>({type,items:canonicalOfferings.filter(item=>item.offering_type===type)}))
  const familyContact = await loadFamilyOrganizationContact(orgId, athlete.profileId)
  return NextResponse.json({ organization_id:orgId,workspace_id:workspace.id,athlete_profile_id:athlete.profileId,
    primary_family_contact:familyContact,
    athlete_name:athleteProfile.full_name,availability_contract:{type:'integer_or_null',description:'Remaining units or seats; null means the offering is not capacity-limited or no capacity was configured.'},categories,offerings:canonicalOfferings },{headers:{'Cache-Control':'private, no-store'}})
}
