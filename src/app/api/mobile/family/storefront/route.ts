import { NextResponse } from 'next/server'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { requestIdFor } from '@/lib/requestSecurity'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeUuid } from '@/lib/uuid'
import { normalizeOfferingBilling, type OfferingBillingType } from '@/lib/offeringBilling'

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
  status: string
  checkout_required: boolean
  checkout_available: boolean
  checkout_type: string | null
  checkout_record_id: string | null
}

const unavailable = (message: string, status: number, requestId: string, code?: string) => {
  console.warn('[mobile/family/storefront]', { request_id: requestId, status, message })
  return NextResponse.json({ error: { code: code || (status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'INVALID_REQUEST'), message } }, { status })
}
const cents = (value: unknown) => Math.max(0, Math.round(Number(value || 0) * 100))
const directCents = (value: unknown) => Math.max(0, Math.round(Number(value || 0)))

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
  const orgId = normalizeUuid(url.searchParams.get('organization_id') || url.searchParams.get('org_id'))
  const athleteId = normalizeUuid(url.searchParams.get('athlete_profile_id'))
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
      .select('id,status,athlete_id,amount,org_fees!inner(id,org_id,title,description,image_url,amount_cents,due_date)')
      .eq('athlete_id', athlete.profileId).eq('org_fees.org_id', orgId).in('status', ['unpaid','failed','expired','partial']),
    supabaseAdmin.from('organization_recurring_fee_offer_assignments').select('offer_id,status')
      .eq('athlete_id', athlete.profileId).in('status', ['offered','accepted']),
    supabaseAdmin.from('organization_recurring_fee_offers').select('*').eq('organization_id', orgId).eq('status', 'published'),
    supabaseAdmin.from('programs').select('id,name,description,image_url,type,price,billing_type,billing_interval,start_date,end_date,capacity,status,eligible_grades,eligible_age_min,eligible_age_max,eligible_birth_year_min,eligible_birth_year_max,eligible_sports')
      .eq('org_id', orgId).eq('status', 'active'),
    supabaseAdmin.from('org_tryouts').select('id,title,notes,image_url,price,billing_type,billing_interval,tryout_date,max_participants,status')
      .eq('org_id', orgId).in('status', ['open','published','active']),
    supabaseAdmin.from('sessions').select('id,title,notes,image_url,start_time,end_time,price,price_cents,billing_type,billing_interval,status,team_id,athlete_profile_id,athlete_id')
      .eq('org_id', orgId).is('athlete_profile_id', null).is('athlete_id', null)
      .gte('start_time', new Date().toISOString()).in('status', ['available','open','scheduled']).order('start_time').limit(100),
    supabaseAdmin.from('marketplace_items').select('id,name,description,image_url,price,billing_type,billing_interval,item_type,is_active,inventory_count')
      .eq('org_id', orgId).eq('is_active', true),
    supabaseAdmin.from('org_training_packages')
      .select('id,name,description,image_url,price_cents,billing_type,billing_interval,offering_type,status')
      .eq('org_id', orgId).eq('status', 'published'),
  ])
  const inventoryError = inventoryResults.find(result => result.error)?.error
  if (inventoryError) {
    console.error('[mobile/family/storefront] inventory query failed', { request_id: requestId, code: inventoryError.code })
    return unavailable('Offerings are temporarily unavailable. Please try again.', 503, requestId, 'STOREFRONT_UNAVAILABLE')
  }
  const inventoryData = inventoryResults.map(result => result.data || []) as any[][]
  const [teamRows,feeAssignments,recurringAssignments,recurringOffers,programs,tryouts,sessions,products,trainingPackages] = inventoryData

  const teamIds = new Set((teamRows || []).map(row => row.team_id))
  const programIds = (programs || []).map(row => row.id)
  const relationshipResults = await Promise.all([
    programIds.length ? supabaseAdmin.from('org_program_targets').select('program_id,target_type,team_id,athlete_id').in('program_id', programIds) : Promise.resolve({ data: [], error: null }),
    programIds.length ? supabaseAdmin.from('program_registrations').select('id,program_id,athlete_profile_id,status').in('program_id', programIds).in('status', ['pending','paid']) : Promise.resolve({ data: [], error: null }),
    (tryouts || []).length ? supabaseAdmin.from('org_tryout_registrations').select('id,tryout_id,athlete_profile_id,status').in('tryout_id', (tryouts || []).map(row => row.id)).in('status', ['pending','paid']) : Promise.resolve({ data: [], error: null }),
    (trainingPackages || []).length ? supabaseAdmin.from('org_training_package_purchases')
      .select('id,package_id,athlete_id,status').eq('athlete_id', athlete.profileId)
      .in('package_id', (trainingPackages || []).map(row => row.id)).in('status', ['pending','active','past_due']) : Promise.resolve({ data: [], error: null }),
  ])
  const relationshipError = relationshipResults.find(result => result.error)?.error
  if (relationshipError) {
    console.error('[mobile/family/storefront] eligibility query failed', { request_id: requestId, code: relationshipError.code })
    return unavailable('Offerings are temporarily unavailable. Please try again.', 503, requestId, 'STOREFRONT_UNAVAILABLE')
  }
  const relationshipData = relationshipResults.map(result => result.data || []) as any[][]
  const [programTargets,programRegistrations,tryoutRegistrations,trainingPurchases] = relationshipData

  const assignedOfferIds = new Set((recurringAssignments || []).map(row => row.offer_id))
  const offerings: Offering[] = []
  for (const row of feeAssignments || []) {
    const fee = Array.isArray((row as any).org_fees) ? (row as any).org_fees[0] : (row as any).org_fees
    if (!fee) continue
    const amount = directCents(fee.amount_cents || Math.round(Number(row.amount || 0) * 100))
    offerings.push({ offering_type:'organization_fee',offering_id:fee.id,organization_id:orgId,title:fee.title,
      billing_type:amount>0?'one_time':'free',
      description:fee.description||null,image_url:fee.image_url||null,amount_cents:amount,billing_interval:null,start_date:null,end_date:fee.due_date||null,
      capacity:null,availability:null,athlete_eligibility:{eligible:true,reasons:[]},status:String(row.status),
      checkout_required:amount>0,checkout_available:amount>0,checkout_type:'fee',checkout_record_id:row.id })
  }
  for (const offer of recurringOffers || []) {
    if (!assignedOfferIds.has(offer.id) && offer.self_enrollment_enabled !== true) continue
    offerings.push({ offering_type:'recurring_plan',offering_id:offer.id,organization_id:orgId,title:offer.description,
      billing_type:'recurring',
      description:offer.description,image_url:offer.image_url||null,amount_cents:directCents(offer.amount_cents),billing_interval:offer.interval,
      start_date:null,end_date:offer.end_date||null,capacity:null,availability:null,
      athlete_eligibility:{eligible:true,reasons:[]},status:'published',checkout_required:true,checkout_available:true,
      checkout_type:'recurring_fee',checkout_record_id:offer.id })
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
    if(reasons.length)continue
    const occupied=(programRegistrations||[]).filter(row=>row.program_id===program.id).length
    const existing=(programRegistrations||[]).find(row=>row.program_id===program.id&&row.athlete_profile_id===athlete.profileId)
    const capacity=program.capacity==null?null:Number(program.capacity),available=capacity&&capacity>0?Math.max(0,capacity-occupied):null
    const amount=cents(program.price)
    const billing=normalizeOfferingBilling(program.billing_type,program.billing_interval,amount)
    offerings.push({offering_type:String(program.type||'program'),offering_id:program.id,organization_id:orgId,title:program.name,
      description:program.description||null,image_url:program.image_url||null,amount_cents:amount,billing_type:billing.billingType,billing_interval:billing.billingInterval,start_date:program.start_date||null,end_date:program.end_date||null,
      capacity,availability:available,athlete_eligibility:{eligible:available!==0,reasons:available===0?['capacity_full']:[]},status:'active',
      checkout_required:amount>0,checkout_available:available!==0&&existing?.status!=='paid',checkout_type:billing.billingType==='recurring'?'recurring_offering':'program',checkout_record_id:existing?.id||null})
  }
  for(const tryout of tryouts||[]){const registrations=(tryoutRegistrations||[]).filter(row=>row.tryout_id===tryout.id),existing=registrations.find(row=>row.athlete_profile_id===athlete.profileId)
    const capacity=tryout.max_participants==null?null:Number(tryout.max_participants),available=capacity&&capacity>0?Math.max(0,capacity-registrations.length):null,amount=cents(tryout.price),billing=normalizeOfferingBilling(tryout.billing_type,tryout.billing_interval,amount)
    offerings.push({offering_type:'tryout',offering_id:tryout.id,organization_id:orgId,title:tryout.title,description:tryout.notes||null,
      image_url:tryout.image_url||null,amount_cents:amount,billing_type:billing.billingType,billing_interval:billing.billingInterval,start_date:tryout.tryout_date||null,end_date:null,capacity,availability:available,
      athlete_eligibility:{eligible:available!==0,reasons:available===0?['capacity_full']:[]},status:String(tryout.status),checkout_required:amount>0,
      checkout_available:available!==0&&existing?.status!=='paid',checkout_type:billing.billingType==='recurring'?'recurring_offering':'tryout',checkout_record_id:existing?.id||null})}
  for(const session of sessions||[]){if(session.team_id&&!teamIds.has(session.team_id))continue;const amount=directCents(session.price_cents||Math.round(Number(session.price||0)*100)),billing=normalizeOfferingBilling(session.billing_type,session.billing_interval,amount)
    offerings.push({offering_type:'bookable_session',offering_id:session.id,organization_id:orgId,title:session.title||'Training session',description:session.notes||null,
      image_url:session.image_url||null,amount_cents:amount,billing_type:billing.billingType,billing_interval:billing.billingInterval,start_date:session.start_time,end_date:session.end_time,capacity:1,availability:1,
      athlete_eligibility:{eligible:true,reasons:[]},status:String(session.status),checkout_required:amount>0,
      checkout_available:billing.billingType==='recurring',checkout_type:billing.billingType==='recurring'?'recurring_offering':'session',checkout_record_id:null})}
  for(const trainingPackage of trainingPackages||[]){
    const existing=(trainingPurchases||[]).find(row=>row.package_id===trainingPackage.id)
    const recurring=trainingPackage.billing_type==='recurring'
    const activeRecurring=recurring&&existing&&['active','past_due'].includes(String(existing.status))
    offerings.push({offering_type:trainingPackage.offering_type==='drop_in'?'drop_in_package':'training_package',offering_id:trainingPackage.id,
      organization_id:orgId,title:trainingPackage.name,description:trainingPackage.description||null,amount_cents:directCents(trainingPackage.price_cents),billing_type:recurring?'recurring':Number(trainingPackage.price_cents)>0?'one_time':'free',
      image_url:trainingPackage.image_url||null,billing_interval:recurring?trainingPackage.billing_interval:null,start_date:null,end_date:null,capacity:null,availability:null,
      athlete_eligibility:{eligible:!activeRecurring,reasons:activeRecurring?['already_enrolled']:[]},status:'published',
      checkout_required:Number(trainingPackage.price_cents)>0,checkout_available:!activeRecurring,
      checkout_type:'training_package',checkout_record_id:existing?.id||null})
  }
  for(const product of products||[]){const amount=cents(product.price),packageItem=['training_package','package'].includes(String(product.item_type)),billing=normalizeOfferingBilling(product.billing_type,product.billing_interval,amount)
    offerings.push({offering_type:packageItem?'training_package':'marketplace_product',offering_id:product.id,organization_id:orgId,title:product.name,
      description:product.description||null,image_url:product.image_url||null,amount_cents:amount,billing_type:billing.billingType,billing_interval:billing.billingInterval,start_date:null,end_date:null,capacity:product.inventory_count,
      availability:product.inventory_count,athlete_eligibility:{eligible:product.inventory_count==null||product.inventory_count>0,reasons:product.inventory_count===0?['sold_out']:[]},
      status:'active',checkout_required:amount>0,checkout_available:product.inventory_count==null||product.inventory_count>0,checkout_type:billing.billingType==='recurring'?'recurring_offering':'marketplace',checkout_record_id:product.id})}

  // A source row has exactly one canonical storefront representation. This
  // prevents legacy aliases (for example camp/programs or tryout/tryouts) from
  // causing duplicate cards or duplicate checkout attempts in mobile clients.
  const canonicalRows=Array.from(new Map(offerings.map(item=>[item.offering_id,item])).values())
  const canonicalOfferings=await Promise.all(canonicalRows.map(async item=>({
    ...item,
    image_url:await storefrontImageUrl(item.image_url),
  })))
  const categories=Array.from(new Set(canonicalOfferings.map(item=>item.offering_type))).map(type=>({type,items:canonicalOfferings.filter(item=>item.offering_type===type)}))
  return NextResponse.json({ organization_id:orgId,workspace_id:workspace.id,athlete_profile_id:athlete.profileId,
    athlete_name:athleteProfile.full_name,availability_contract:{type:'integer_or_null',description:'Remaining units or seats; null means the offering is not capacity-limited or no capacity was configured.'},categories,offerings:canonicalOfferings },{headers:{'Cache-Control':'private, no-store'}})
}
