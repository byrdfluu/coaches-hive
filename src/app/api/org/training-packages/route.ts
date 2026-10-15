import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { resolveActiveOrganization } from '@/lib/activeOrganization'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic='force-dynamic'
const managers=new Set(['owner','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','admin'])
async function access(request:Request){const supabase=await createRouteHandlerClientCompat(),{data:{session}}=await supabase.auth.getSession();if(!session?.user)return{error:NextResponse.json({error:'Please sign in.'},{status:401})};const org=await resolveActiveOrganization(session.user.id,{requestedWorkspaceId:request.headers.get('x-workspace-id')});if(!org||!managers.has(org.role))return{error:NextResponse.json({error:'Training package management access is required.'},{status:403})};return{supabase,org}}

export async function GET(request:Request){const ctx=await access(request);if('error'in ctx)return ctx.error;const db=supabaseAdmin as any,orgId=ctx.org.organizationId
 const[packages,metrics,links,sessions,packageCoaches,purchases,migrations]=await Promise.all([
  db.from('org_training_packages').select('*').eq('org_id',orgId).order('created_at',{ascending:false}),
  db.from('org_training_package_metrics').select('*').eq('org_id',orgId),
  db.from('org_training_package_sessions').select('package_id,session_id'),
  db.from('org_training_sessions').select('*').eq('org_id',orgId).order('starts_at'),
  db.from('org_training_package_coaches').select('package_id,coach_id'),
  db.from('org_training_package_purchases').select('id,package_id,status,athlete_id,current_period_end,expires_at').eq('org_id',orgId),
  db.from('legacy_training_package_migrations').select('legacy_package_id,unified_program_id,migration_status,migrated_at').eq('org_id',orgId),
 ])
 const failed=[packages,metrics,links,sessions,packageCoaches,purchases,migrations].find(result=>result.error);if(failed?.error)return NextResponse.json({error:'Unable to load legacy training archive.'},{status:500})
 const{data:coaches,error:coachError}=await(ctx.supabase as any).rpc('my_org_assignable_coaches',{p_org_id:orgId});if(coachError)return NextResponse.json({error:'Unable to load eligible coaches.'},{status:503})
 return NextResponse.json({read_only:true,packages:(packages.data||[]).map((pkg:any)=>({...pkg,metrics:(metrics.data||[]).find((row:any)=>row.package_id===pkg.id)||null,sessions:(links.data||[]).filter((row:any)=>row.package_id===pkg.id).map((row:any)=>(sessions.data||[]).find((session:any)=>session.id===row.session_id)).filter(Boolean),coach_ids:(packageCoaches.data||[]).filter((row:any)=>row.package_id===pkg.id).map((row:any)=>row.coach_id),purchases:(purchases.data||[]).filter((row:any)=>row.package_id===pkg.id),migration:(migrations.data||[]).find((row:any)=>row.legacy_package_id===pkg.id)||null})),available_sessions:sessions.data||[],assignable_coaches:coaches||[]},{headers:{'Cache-Control':'private, no-store'}})}

export async function POST(request:Request){const ctx=await access(request);if('error'in ctx)return ctx.error
 return NextResponse.json({error:{code:'LEGACY_TRAINING_CATALOG_READ_ONLY',message:'Legacy training records are read-only. Create and manage training products in Offerings.'},redirect_url:'/org/offerings/new'},{status:410})
}
