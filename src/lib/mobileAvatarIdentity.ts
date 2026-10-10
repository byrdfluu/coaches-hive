import{supabaseAdmin}from'@/lib/supabaseAdmin'

export async function canonicalUserAvatarMap(userIds:string[]){
 const ids=Array.from(new Set(userIds.filter(Boolean))),result=new Map<string,string|null>()
 if(!ids.length)return result
 const[{data:profiles},{data:athletes}]=await Promise.all([
  supabaseAdmin.from('profiles').select('id,avatar_url,role').in('id',ids),
  supabaseAdmin.from('athlete_profiles').select('owner_user_id,auth_user_id,avatar_url,is_primary,display_order,updated_at').or(`owner_user_id.in.(${ids.join(',')}),auth_user_id.in.(${ids.join(',')})`).eq('status','active').eq('is_test',false).order('is_primary',{ascending:false}).order('display_order').order('updated_at',{ascending:false}),
 ])
 const profileMap=new Map((profiles||[]).map(row=>[row.id,row]))
 for(const id of ids){const profile=profileMap.get(id),family=['athlete','parent','guardian','family'].includes(String(profile?.role||'').toLowerCase());let avatar:string|null=null
  if(family){const athlete=(athletes||[]).find(row=>(row.auth_user_id===id||row.owner_user_id===id)&&Boolean(row.avatar_url));avatar=athlete?.avatar_url||null}
  result.set(id,avatar||profile?.avatar_url||null)
 }
 return result
}

export const preserveVersionedAvatar=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null
