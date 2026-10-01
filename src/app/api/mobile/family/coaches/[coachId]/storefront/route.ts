import { NextResponse } from 'next/server'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { loadCoachOperatingMode, privateTrainingEnabled } from '@/lib/coachOperatingMode'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ coachId: string }> }) {
  const user=await getMobileRequestUser(request)
  if(!user)return NextResponse.json({error:{code:'unauthorized',message:'Authentication is required.'}},{status:401})
  const {coachId}=await params
  const athleteId=new URL(request.url).searchParams.get('athlete_profile_id')
  const athlete=await resolveAuthorizedAthleteContext(user.id,athleteId)
  if(!athlete)return NextResponse.json({error:{code:'ATHLETE_PROFILE_UNAVAILABLE',message:'Athlete profile is unavailable.'}},{status:404})

  const {data:orgRoles}=await supabaseAdmin.from('organization_memberships').select('org_id,role,status')
    .eq('user_id',coachId).eq('status','active').in('role',['coach','assistant_coach'])
  if((orgRoles||[]).length){
    const orgIds=Array.from(new Set((orgRoles||[]).map(row=>row.org_id)))
    const [{data:activeWorkspaces},{data:orgs}]=await Promise.all([
      supabaseAdmin.from('business_workspaces').select('organization_id').eq('workspace_type','organization')
        .eq('status','active').in('organization_id',orgIds),
      supabaseAdmin.from('organizations').select('id,name,status').in('id',orgIds),
    ])
    const activeOrgIds=new Set((activeWorkspaces||[]).map(row=>row.organization_id))
    const storefronts=(orgs||[]).filter(org=>activeOrgIds.has(org.id)&&org.status!=='inactive')
    return NextResponse.json({coach_id:coachId,athlete_profile_id:athlete.profileId,mode:'organization',
      organization_storefronts:storefronts.map(org=>({organization_id:org.id,name:org.name,
        endpoint:`/api/mobile/family/storefront?organization_id=${org.id}&athlete_profile_id=${athlete.profileId}`}))})
  }

  const {data:workspace}=await supabaseAdmin.from('business_workspaces').select('id,status').eq('workspace_type','independent_coach')
    .eq('owner_user_id',coachId).eq('status','active').maybeSingle()
  if(!workspace)return NextResponse.json({error:{code:'not_found',message:'Coach storefront is unavailable.'}},{status:404})
  const {profile:coachMode}=await loadCoachOperatingMode(coachId)
  if(!coachMode?.isActive||!privateTrainingEnabled(coachMode.mode))return NextResponse.json({error:{code:'COACH_STOREFRONT_UNAVAILABLE',message:'Private training is not available from this coach.'}},{status:404})
  const [{data:memberships},{data:sessions},{data:packages},{data:availability}]=await Promise.all([
    supabaseAdmin.from('coach_membership_plans').select('id,name,description,price_cents,billing_interval,status,included_sessions')
      .eq('coach_id',coachId).eq('status','active').order('price_cents'),
    supabaseAdmin.from('sessions').select('id,title,notes,start_time,end_time,price,price_cents,status,session_type,type,booking_type')
      .eq('coach_id',coachId).is('org_id',null).is('athlete_id',null).is('athlete_profile_id',null)
      .gte('start_time',new Date().toISOString()).in('status',['available','open','scheduled']).order('start_time').limit(100),
    supabaseAdmin.from('marketplace_items').select('id,name,description,price,item_type,is_active,inventory_count')
      .eq('coach_id',coachId).eq('is_active',true).in('item_type',['training_package','package']),
    supabaseAdmin.from('availability_blocks').select('id,day_of_week,specific_date,start_time,end_time,session_type,location,timezone,capacity')
      .eq('coach_id',coachId).order('day_of_week').order('start_time'),
  ])
  const sessionItems=(sessions||[]).map(item=>{
    const kind=String(item.session_type||item.type||item.booking_type||'one_on_one').toLowerCase().replaceAll(' ','_')
    return {...item,offering_type:kind.includes('group')?'group_session':'one_on_one_session',offering_id:item.id,
      amount_cents:Number(item.price_cents||Math.round(Number(item.price||0)*100)),
      checkout_required:Number(item.price_cents||item.price||0)>0,checkout_available:true}
  })
  return NextResponse.json({coach_id:coachId,workspace_id:workspace.id,athlete_profile_id:athlete.profileId,mode:'independent_coach',operating_mode:coachMode.mode,categories:[
    ...(memberships||[]).length?[{type:'coach_membership',items:(memberships||[]).map(item=>({...item,offering_type:'coach_membership',offering_id:item.id,amount_cents:Number(item.price_cents),checkout_required:Number(item.price_cents)>0,checkout_available:true}))}]:[],
    ...sessionItems.filter(item=>item.offering_type==='one_on_one_session').length?[{type:'one_on_one_session',items:sessionItems.filter(item=>item.offering_type==='one_on_one_session')}]:[],
    ...sessionItems.filter(item=>item.offering_type==='group_session').length?[{type:'group_session',items:sessionItems.filter(item=>item.offering_type==='group_session')}]:[],
    ...(availability||[]).length?[{type:'bookable_availability',items:(availability||[]).map(item=>({...item,offering_type:'bookable_availability',offering_id:item.id,checkout_required:false,checkout_available:false}))}]:[],
    ...(packages||[]).length?[{type:'training_package',items:(packages||[]).map(item=>({...item,offering_type:'training_package',offering_id:item.id,amount_cents:Math.round(Number(item.price||0)*100),checkout_required:Number(item.price||0)>0,checkout_available:item.inventory_count==null||item.inventory_count>0}))}]:[],
  ]},{headers:{'Cache-Control':'private, no-store'}})
}
