import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { resolveActiveOrganization } from '@/lib/activeOrganization'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic='force-dynamic'
export async function GET(request:Request){
 const supabase=await createRouteHandlerClientCompat(),{data:{session}}=await supabase.auth.getSession()
 if(!session?.user)return NextResponse.json({error:'Please sign in.'},{status:401})
 const context=await resolveActiveOrganization(session.user.id,{requestedWorkspaceId:request.headers.get('x-workspace-id')})
 if(!context)return NextResponse.json({error:'Organization access required.'},{status:403})
 const db=supabaseAdmin as any,[occurrences,programs]=await Promise.all([
  db.from('org_offering_occurrences').select('*').eq('org_id',context.organizationId).in('status',['published','cancelled']).order('starts_at'),
  db.from('programs').select('id,name,type').eq('org_id',context.organizationId),
 ])
 if(occurrences.error||programs.error)return NextResponse.json({error:'Unable to load offering calendar.'},{status:500})
 const occurrenceIds=(occurrences.data||[]).map((row:any)=>row.id)
 const {data:reservations}=occurrenceIds.length?await db.from('org_offering_registration_occurrences').select('occurrence_id,status,unit_price_cents,credit_delta').in('occurrence_id',occurrenceIds):{data:[]}
 const coachIds=Array.from(new Set((occurrences.data||[]).flatMap((row:any)=>row.coach_ids||[]))),{data:profiles}=coachIds.length?await db.from('profiles').select('id,full_name').in('id',coachIds):{data:[]}
 const programMap=new Map((programs.data||[]).map((row:any)=>[row.id,row])),people=new Map((profiles||[]).map((row:any)=>[row.id,row.full_name]))
 return NextResponse.json({occurrences:(occurrences.data||[]).map((row:any)=>{const roster=(reservations||[]).filter((reservation:any)=>reservation.occurrence_id===row.id),active=roster.filter((reservation:any)=>['reserved','attended'].includes(reservation.status));return{...row,offering:programMap.get(row.offering_id),registered_count:active.length,paid_count:active.filter((reservation:any)=>reservation.unit_price_cents>0).length,credit_count:active.filter((reservation:any)=>reservation.credit_delta<0).length,attendance_count:roster.filter((reservation:any)=>reservation.status==='attended').length,cancelled_count:roster.filter((reservation:any)=>['cancelled','late_cancel'].includes(reservation.status)).length,available_spots:row.capacity==null?null:Math.max(0,row.capacity-active.length),coach_names:(row.coach_ids||[]).map((coachId:string)=>people.get(coachId)||'Coach')}})},{headers:{'Cache-Control':'private, no-store'}})
}
