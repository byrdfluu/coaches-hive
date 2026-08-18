import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

async function ownedPlayer(playerId:string){
  const supabase=await createRouteHandlerClientCompat();const{data:{session}}=await supabase.auth.getSession();const user=session?.user
  if(!user)return{response:NextResponse.json({error:'Unauthorized'},{status:401})}
  const{data:player}=await supabaseAdmin.from('athlete_profiles').select('*').eq('id',playerId).eq('owner_user_id',user.id).maybeSingle()
  return player?{user,player}:{response:NextResponse.json({error:'Player not found'},{status:404})}
}

export async function GET(_request:Request,{params}:{params:Promise<{playerId:string}>}){
  const access=await ownedPlayer((await params).playerId);if('response'in access)return access.response
  const id=access.player.id
  const [participations,transactions,teamMemberships,waivers]=await Promise.all([
    supabaseAdmin.from('player_participations').select('*').eq('player_id',id),
    supabaseAdmin.from('payment_transactions').select('id,transaction_type,status,org_id,team_id,amount_cents,platform_fee_cents,currency,occurred_at,description').or(`athlete_profile_id.eq.${id},player_id.eq.${id}`),
    supabaseAdmin.from('org_team_members').select('*').eq('athlete_id',id),
    supabaseAdmin.from('org_document_assignments').select('*').eq('athlete_id',id),
  ])
  await supabaseAdmin.from('data_audit_log').insert({user_id:access.user.id,action:'export',entity_type:'player',entity_id:id,changes:{format:'json'}})
  return NextResponse.json({exported_at:new Date().toISOString(),player:access.player,participations:participations.data||[],transactions:transactions.data||[],team_memberships:teamMemberships.data||[],waivers:waivers.data||[]},{headers:{'Content-Disposition':`attachment; filename="player-${id}-data.json"`}})
}

export async function DELETE(request:Request,{params}:{params:Promise<{playerId:string}>}){
  const access=await ownedPlayer((await params).playerId);if('response'in access)return access.response
  const body=await request.json().catch(()=>({}));if(body?.confirmation!=='ANONYMIZE PLAYER')return NextResponse.json({error:'confirmation must equal ANONYMIZE PLAYER'},{status:400})
  const id=access.player.id,now=new Date().toISOString()
  const{error}=await supabaseAdmin.from('athlete_profiles').update({full_name:'Deleted Player',avatar_url:null,bio:null,birthdate:null,location:null,gender:null,city:null,state:null,zip_code:null,coppa_consent_given:false,coppa_consent_date:null,coppa_consenting_parent_id:null,status:'archived',updated_at:now}).eq('id',id).eq('owner_user_id',access.user.id)
  if(error)return NextResponse.json({error:error.message},{status:500})
  await supabaseAdmin.from('data_audit_log').insert({user_id:access.user.id,action:'anonymize',entity_type:'player',entity_id:id,changes:{personal_fields:'removed',financial_records:'retained'}})
  return NextResponse.json({ok:true,player_id:id,status:'archived',financial_records_retained:true})
}
