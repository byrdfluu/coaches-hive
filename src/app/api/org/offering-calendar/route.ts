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
 const db=supabaseAdmin as any,[occurrences,programs,training]=await Promise.all([
  db.from('org_offering_occurrences').select('*').eq('org_id',context.organizationId).in('status',['published','cancelled']).order('starts_at'),
  db.from('programs').select('id,name,type').eq('org_id',context.organizationId),
  db.from('org_training_sessions').select('id,title,starts_at,ends_at,timezone,location,status,capacity').eq('org_id',context.organizationId).in('status',['published','cancelled']).order('starts_at'),
 ])
 if(occurrences.error||programs.error||training.error)return NextResponse.json({error:'Unable to load organization calendar.'},{status:500})
 const occurrenceIds=(occurrences.data||[]).map((row:any)=>row.id)
 const trainingIds=(training.data||[]).map((row:any)=>row.id)
 const [{data:reservations},{data:trainingBookings},{data:trainingCoaches}]=await Promise.all([
  occurrenceIds.length?db.from('org_offering_registration_occurrences').select('occurrence_id,status,unit_price_cents,credit_delta').in('occurrence_id',occurrenceIds):Promise.resolve({data:[]}),
  trainingIds.length?db.from('org_training_session_bookings').select('session_id,status,booking_type').in('session_id',trainingIds):Promise.resolve({data:[]}),
  trainingIds.length?db.from('org_training_session_coaches').select('session_id,coach_id').in('session_id',trainingIds):Promise.resolve({data:[]}),
 ])
 const coachIds=Array.from(new Set((occurrences.data||[]).flatMap((row:any)=>row.coach_ids||[]))),{data:profiles}=coachIds.length?await db.from('profiles').select('id,full_name').in('id',coachIds):{data:[]}
 const trainingCoachIds=Array.from(new Set((trainingCoaches||[]).map((row:any)=>row.coach_id))),{data:trainingProfiles}=trainingCoachIds.length?await db.from('profiles').select('id,full_name').in('id',trainingCoachIds):{data:[]}
 const programMap=new Map((programs.data||[]).map((row:any)=>[row.id,row])),people=new Map((profiles||[]).map((row:any)=>[row.id,row.full_name]))
 const trainingPeople=new Map((trainingProfiles||[]).map((row:any)=>[row.id,row.full_name]))
 const offeringRows=(occurrences.data||[]).map((row:any)=>{const roster=(reservations||[]).filter((reservation:any)=>reservation.occurrence_id===row.id),active=roster.filter((reservation:any)=>['reserved','attended'].includes(reservation.status));return{...row,offering:programMap.get(row.offering_id),registered_count:active.length,paid_count:active.filter((reservation:any)=>reservation.unit_price_cents>0).length,credit_count:active.filter((reservation:any)=>reservation.credit_delta<0).length,attendance_count:roster.filter((reservation:any)=>reservation.status==='attended').length,cancelled_count:roster.filter((reservation:any)=>['cancelled','late_cancel'].includes(reservation.status)).length,available_spots:row.capacity==null?null:Math.max(0,row.capacity-active.length),coach_names:(row.coach_ids||[]).map((coachId:string)=>people.get(coachId)||'Coach')}})
 const trainingRows=(training.data||[]).map((row:any)=>{const roster=(trainingBookings||[]).filter((booking:any)=>booking.session_id===row.id),active=roster.filter((booking:any)=>['pending_payment','reserved','attended','no_show'].includes(booking.status)),assigned=(trainingCoaches||[]).filter((link:any)=>link.session_id===row.id);return{...row,offering:{name:row.title||'Training session'},offering_type:'training_session',registered_count:active.length,paid_count:active.filter((booking:any)=>booking.booking_type==='drop_in').length,credit_count:active.filter((booking:any)=>booking.booking_type==='credit').length,attendance_count:roster.filter((booking:any)=>booking.status==='attended').length,cancelled_count:roster.filter((booking:any)=>['cancelled','late_cancel'].includes(booking.status)).length,available_spots:Math.max(0,row.capacity-active.length),coach_names:assigned.map((link:any)=>trainingPeople.get(link.coach_id)||'Coach')}})
 return NextResponse.json({occurrences:[...offeringRows,...trainingRows].sort((a:any,b:any)=>new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime())},{headers:{'Cache-Control':'private, no-store'}})
}
