import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic='force-dynamic'
export async function GET(){
 const{session,error}=await getSessionRole(['coach','assistant_coach','program_director','org_admin','admin'])
 if(error||!session)return error
 const db=supabaseAdmin as any,{data:links}=await db.from('org_program_coaches').select('program_id').eq('coach_id',session.user.id),ids=(links||[]).map((row:any)=>row.program_id)
 const[direct,programOccurrences,{data:programs}]=await Promise.all([
  db.from('org_offering_occurrences').select('*').contains('coach_ids',[session.user.id]).in('status',['published','cancelled']).order('starts_at'),
  ids.length?db.from('org_offering_occurrences').select('*').in('offering_id',ids).in('status',['published','cancelled']).order('starts_at'):Promise.resolve({data:[]}),
  ids.length?db.from('programs').select('id,name,type').in('id',ids):Promise.resolve({data:[]}),
 ])
 const occurrenceMap=new Map([...(direct.data||[]),...(programOccurrences.data||[])].map((row:any)=>[row.id,row])),assigned=Array.from(occurrenceMap.values()),occurrenceIds=assigned.map((row:any)=>row.id)
 const{data:reservations}=occurrenceIds.length?await db.from('org_offering_registration_occurrences').select('id,occurrence_id,athlete_id,status').in('occurrence_id',occurrenceIds):{data:[]}
 const[{data:sessionLinks},{data:packageLinks}]=await Promise.all([db.from('org_training_session_coaches').select('session_id').eq('coach_id',session.user.id),db.from('org_training_package_coaches').select('package_id').eq('coach_id',session.user.id)])
 const packageIds=(packageLinks||[]).map((row:any)=>row.package_id)
 const{data:packageSessions}=packageIds.length
  ?await db.from('org_training_package_sessions').select('session_id,package_id').in('package_id',packageIds)
  :{data:[]}
 const trainingIds=Array.from(new Set([...(sessionLinks||[]).map((row:any)=>row.session_id),...(packageSessions||[]).map((row:any)=>row.session_id)]))
 const{data:training}=trainingIds.length
  ?await db.from('org_training_sessions').select('id,title,starts_at,ends_at,timezone,location,session_type,capacity,status').in('id',trainingIds).gte('starts_at',new Date().toISOString()).order('starts_at')
  :{data:[]}
 const trainingRows:any[]=[];for(const row of training||[]){const{data:roster}=await db.rpc('my_org_training_session_roster',{p_session_id:row.id});trainingRows.push({...row,offering:{name:row.title||'Training session'},offering_type:'training_session',roster:roster||[],registered_count:(roster||[]).filter((item:any)=>!['cancelled','late_cancel'].includes(item.booking_status)).length,confirmed_count:(roster||[]).filter((item:any)=>item.booking_status==='reserved').length,cancelled_count:(roster||[]).filter((item:any)=>['cancelled','late_cancel'].includes(item.booking_status)).length,attended_count:(roster||[]).filter((item:any)=>item.booking_status==='attended').length,no_show_count:(roster||[]).filter((item:any)=>item.booking_status==='no_show').length})}
 const offeringRows=assigned.map((row:any)=>{const roster=(reservations||[]).filter((reservation:any)=>reservation.occurrence_id===row.id);return{...row,offering:(programs||[]).find((program:any)=>program.id===row.offering_id),roster,registered_count:roster.filter((reservation:any)=>['reserved','attended'].includes(reservation.status)).length,confirmed_count:roster.filter((reservation:any)=>reservation.status==='reserved').length,cancelled_count:roster.filter((reservation:any)=>['cancelled','late_cancel'].includes(reservation.status)).length,attended_count:roster.filter((reservation:any)=>reservation.status==='attended').length,no_show_count:roster.filter((reservation:any)=>reservation.status==='no_show').length}})
 return NextResponse.json({occurrences:[...offeringRows,...trainingRows].sort((a:any,b:any)=>new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime())},{headers:{'Cache-Control':'private, no-store'}})
}
