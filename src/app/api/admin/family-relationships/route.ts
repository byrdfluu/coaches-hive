import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseUuid } from '@/lib/uuid'

export const dynamic='force-dynamic'
const normalizedRole=(value:unknown)=>['guardian','parent','family'].includes(String(value||'').toLowerCase())?'athlete':String(value||'unknown').toLowerCase()
export async function GET(request:Request){
  const auth=await requireSuperadminApi(request);if(auth.error)return auth.error
  const userId=parseUuid(new URL(request.url).searchParams.get('user_id'));if(!userId)return NextResponse.json({error:'A valid user_id is required.'},{status:422})
  const [{data:profile},{data:authUser},{data:owned},{data:familyLinks}]=await Promise.all([
    supabaseAdmin.from('profiles').select('id,email,full_name,role,status').eq('id',userId).maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from('athlete_profiles').select('*').or(`owner_user_id.eq.${userId},auth_user_id.eq.${userId}`),
    supabaseAdmin.from('family_members').select('*').eq('user_id',userId),
  ])
  if(!profile)return NextResponse.json({error:'User not found.'},{status:404})
  const familyIds=(familyLinks||[]).map((row:any)=>row.family_id).filter(Boolean)
  const {data:familyMembers}=familyIds.length?await supabaseAdmin.from('family_members').select('*').in('family_id',familyIds):{data:[] as any[]}
  const familyAthletes=familyIds.length?await supabaseAdmin.from('athlete_profiles').select('*').in('family_id',familyIds):{data:[] as any[]}
  const athleteIds=Array.from(new Set([...(owned||[]).map((r:any)=>r.id),...(familyAthletes.data||[]).map((r:any)=>r.id)].filter(Boolean)))
  const [{data:athletes},{data:orgs},{data:teams}]=await Promise.all([
    athleteIds.length?supabaseAdmin.from('athlete_profiles').select('*').in('id',athleteIds):Promise.resolve({data:[]}),
    athleteIds.length?supabaseAdmin.from('athlete_organization_memberships').select('*').in('athlete_id',athleteIds):Promise.resolve({data:[]}),
    athleteIds.length?supabaseAdmin.from('org_team_members').select('*').in('athlete_id',athleteIds):Promise.resolve({data:[]}),
  ])
  const metadataRole=authUser?.user?.user_metadata?.role||null,canonicalRole=profile.role||null
  return NextResponse.json({account_owner:profile,authorized_athletes:athletes||[],guardian_relationships:familyMembers||[],
    organization_relationships:orgs||[],team_relationships:teams||[],role_normalization:{canonical:normalizedRole(canonicalRole),auth_metadata:normalizedRole(metadataRole)},
    canonical_profile_role:canonicalRole,auth_metadata_role:metadataRole,onboarding_state:{completed:athleteIds.length>0&&profile.status==='active',has_accessible_athlete:athleteIds.length>0,profile_status:profile.status}})
}
