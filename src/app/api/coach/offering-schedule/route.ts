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
 return NextResponse.json({occurrences:assigned.map((row:any)=>{const roster=(reservations||[]).filter((reservation:any)=>reservation.occurrence_id===row.id);return{...row,offering:(programs||[]).find((program:any)=>program.id===row.offering_id),roster,confirmed_count:roster.filter((reservation:any)=>reservation.status==='reserved').length,cancelled_count:roster.filter((reservation:any)=>['cancelled','late_cancel'].includes(reservation.status)).length,attended_count:roster.filter((reservation:any)=>reservation.status==='attended').length,no_show_count:roster.filter((reservation:any)=>reservation.status==='no_show').length}})},{headers:{'Cache-Control':'private, no-store'}})
}
