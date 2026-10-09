import {supabaseAdmin} from '@/lib/supabaseAdmin'
import type {WorkspaceContext} from '@/lib/workspaceAuthority'

export type RecipientType='parent_athlete'|'coach'|'program_director'|'organization'|'user'
export type MobileRecipient={recipient_type:RecipientType;recipient_id:string;user_id:string|null;organization_id:string|null;athlete_profile_id:string|null;display_name:string;subtitle:string|null;avatar_url:string|null;can_message:boolean;message_unavailable_reason:string|null}
type Candidate=MobileRecipient&{resolved_user_id:string|null;matched_query?:boolean}

const bool=(value:unknown,key:string,defaultValue=true)=>value&&typeof value==='object'&&key in (value as Record<string,unknown>)?(value as Record<string,unknown>)[key]!==false:defaultValue
const messagingStaff=(row:any)=>{const roles=row?.roles||[],permissions=row?.permissions&&typeof row.permissions==='object'?row.permissions:{};return roles.some((role:string)=>['owner','org_admin','program_director','coach','assistant_coach'].includes(role))||permissions.manage_messages===true||permissions['messages.manage']===true||permissions.messaging===true}
const uniq=(rows:Candidate[])=>Array.from(new Map(rows.map(row=>[`${row.recipient_type}:${row.recipient_id}`,row])).values())
const publicRecipient=(row:any)=>!row?.is_test&&['','active'].includes(String(row?.status||'').trim().toLowerCase())

async function blocked(userId:string,otherIds:string[]){
  if(!otherIds.length)return new Set<string>()
  const {data}=await (supabaseAdmin as any).from('user_blocks').select('blocker_id,blocked_user_id')
    .or(`and(blocker_id.eq.${userId},blocked_user_id.in.(${otherIds.join(',')})),and(blocked_user_id.eq.${userId},blocker_id.in.(${otherIds.join(',')}))`)
  return new Set((data||[]).map((row:any)=>row.blocker_id===userId?row.blocked_user_id:row.blocker_id))
}

async function recentUsers(userId:string){
  const {data:mine}=await supabaseAdmin.from('thread_participants').select('thread_id,threads!inner(updated_at)').eq('user_id',userId)
    .order('updated_at',{ascending:false,referencedTable:'threads'}).limit(20)
  const ids=(mine||[]).map((row:any)=>row.thread_id)
  if(!ids.length)return new Map<string,number>()
  const {data}=await supabaseAdmin.from('thread_participants').select('user_id,thread_id').in('thread_id',ids).neq('user_id',userId)
  const order=new Map(ids.map((id,index)=>[id,index])),result=new Map<string,number>()
  for(const row of data||[])result.set(row.user_id,Math.min(result.get(row.user_id)??999,order.get(row.thread_id)??999))
  return result
}

async function publicFamilyCandidates(userId:string,q:string):Promise<Candidate[]>{
  // Public family discovery is explicit opt-in on both sides. Athlete-name
  // matches resolve to the adult account holder and never expose a minor's
  // identifier or name in the returned subtitle.
  if(!q)return[]
  const {data,error}=await (supabaseAdmin as any).rpc('search_mobile_public_family_accounts',{
    p_requester_user_id:userId,p_query:q,p_limit:60,
  })
  if(error)throw new Error('public_family_recipient_search_failed')
  return(data||[]).map((row:any)=>({recipient_type:'parent_athlete' as const,recipient_id:row.recipient_user_id,
    user_id:row.recipient_user_id,organization_id:null,athlete_profile_id:row.athlete_profile_id||null,
    display_name:row.display_name||'Parent/Athlete',subtitle:row.subtitle||'Parent/Athlete',avatar_url:row.avatar_url||null,
    can_message:row.can_message===true,message_unavailable_reason:row.message_unavailable_reason||null,resolved_user_id:row.recipient_user_id,matched_query:true}))
}

export async function familyRecipients(userId:string,athleteId:string,q:string,limit:number):Promise<MobileRecipient[]>{
  const candidates:Candidate[]=[]
  const [{data:coachRows,error:coachError},{data:relationships},{data:self},publicFamilies]=await Promise.all([
    (supabaseAdmin as any).rpc('discover_mobile_public_messaging_staff',{p_requester_user_id:userId}),
    supabaseAdmin.from('athlete_organization_memberships').select('org_id').eq('athlete_id',athleteId).eq('status','active'),
    supabaseAdmin.from('profiles').select('athlete_privacy_settings').eq('id',userId).maybeSingle(),
    publicFamilyCandidates(userId,q),
  ])
  if(coachError)throw new Error('public_staff_recipient_search_failed')
  candidates.push(...publicFamilies)
  for(const row of coachRows||[])candidates.push({recipient_type:row.recipient_type==='program_director'?'program_director':'coach',recipient_id:row.user_id,user_id:row.user_id,organization_id:row.organization_id||null,athlete_profile_id:null,display_name:row.full_name||row.role_label||'Coach',subtitle:row.organization_name?`${row.role_label||'Coach'} · ${row.organization_name}`:(row.role_label||'Coach'),avatar_url:row.avatar_url||null,can_message:Boolean(row.can_message),message_unavailable_reason:row.message_unavailable_reason||null,resolved_user_id:row.user_id})
  const orgIds=Array.from(new Set((relationships||[]).map(row=>row.org_id).filter(Boolean)))
  if(orgIds.length){
    const [{data:orgs},{data:settings},{data:workspaces}]=await Promise.all([
      supabaseAdmin.from('organizations').select('id,name,status,is_test').in('id',orgIds).eq('is_test',false),
      supabaseAdmin.from('org_settings').select('org_id,profile_image_url,primary_family_contact_user_id,primary_family_contact_label').in('org_id',orgIds),
      supabaseAdmin.from('business_workspaces').select('id,organization_id,is_test,status').in('organization_id',orgIds).eq('workspace_type','organization').eq('status','active').eq('is_test',false),
    ])
    const valid=new Set((workspaces||[]).map(row=>row.organization_id)),settingMap=new Map((settings||[]).map(row=>[row.org_id,row])),workspaceMap=new Map((workspaces||[]).map(row=>[row.organization_id,row.id]))
    const contactIds=Array.from(new Set((settings||[]).map(row=>row.primary_family_contact_user_id).filter(Boolean))),workspaceIds=(workspaces||[]).map(row=>row.id)
    const {data:contactMemberships}=contactIds.length&&workspaceIds.length?await supabaseAdmin.from('workspace_memberships').select('user_id,workspace_id,roles,permissions').in('user_id',contactIds).in('workspace_id',workspaceIds).eq('status','active'):{data:[]}
    const eligibleContacts=new Set((contactMemberships||[]).filter(messagingStaff).map(row=>`${row.workspace_id}:${row.user_id}`))
    for(const org of orgs||[]){if(!valid.has(org.id)||!publicRecipient(org))continue;const setting=settingMap.get(org.id)
      const contactOkay=Boolean(setting?.primary_family_contact_user_id&&eligibleContacts.has(`${workspaceMap.get(org.id)}:${setting.primary_family_contact_user_id}`))
      candidates.push({recipient_type:'organization',recipient_id:org.id,user_id:null,organization_id:org.id,athlete_profile_id:null,display_name:org.name||'Organization',subtitle:setting?.primary_family_contact_label||'Organization inbox',avatar_url:setting?.profile_image_url||null,can_message:contactOkay,message_unavailable_reason:contactOkay?null:'organization_inbox_unavailable',resolved_user_id:contactOkay?setting?.primary_family_contact_user_id:null})
    }
    if(contactIds.length){const [{data:directors},{data:profiles}]=await Promise.all([
      supabaseAdmin.from('workspace_memberships').select('user_id,workspace_id,roles,permissions').in('user_id',contactIds).eq('status','active'),
      supabaseAdmin.from('profiles').select('id,full_name,avatar_url,status,is_test,coach_privacy_settings').in('id',contactIds).eq('is_test',false),
    ]);const profileMap=new Map((profiles||[]).map(row=>[row.id,row])),workspaceOrg=new Map((workspaces||[]).map(row=>[row.id,row.organization_id]))
      for(const member of directors||[]){if(!(member.roles||[]).includes('program_director'))continue;const orgId=workspaceOrg.get(member.workspace_id),profile=profileMap.get(member.user_id);if(!orgId||!profile||!publicRecipient(profile))continue;const can=bool(profile.coach_privacy_settings,'allowDirectMessages')
        candidates.push({recipient_type:'program_director',recipient_id:profile.id,user_id:profile.id,organization_id:orgId,athlete_profile_id:null,display_name:profile.full_name||'Program Director',subtitle:'Program Director',avatar_url:profile.avatar_url||null,can_message:can,message_unavailable_reason:can?null:'direct_messages_disabled',resolved_user_id:profile.id})}
    }
  }
  // Public organization messaging is intentionally independent from roster
  // membership and saved connections. The selected athlete is authorized by
  // the route, while the organization contact remains server-resolved.
  const {data:publicOrgs}=await supabaseAdmin.from('organizations').select('id,name,status,is_test').eq('status','active').eq('is_test',false).limit(250)
  const publicOrgIds=(publicOrgs||[]).map(row=>row.id)
  if(publicOrgIds.length){const [{data:publicSettings},{data:publicWorkspaces}]=await Promise.all([
    supabaseAdmin.from('org_settings').select('org_id,org_name,profile_image_url,primary_family_contact_user_id,primary_family_contact_label').in('org_id',publicOrgIds),
    supabaseAdmin.from('business_workspaces').select('id,organization_id').in('organization_id',publicOrgIds).eq('workspace_type','organization').eq('status','active').eq('is_test',false),
  ]);const settingsMap=new Map((publicSettings||[]).map(row=>[row.org_id,row])),workspaceMap=new Map((publicWorkspaces||[]).map(row=>[row.organization_id,row.id])),contactIds=Array.from(new Set((publicSettings||[]).map(row=>row.primary_family_contact_user_id).filter(Boolean))),workspaceIds=(publicWorkspaces||[]).map(row=>row.id)
    const [{data:members},{data:profiles}]=await Promise.all([
      contactIds.length&&workspaceIds.length?supabaseAdmin.from('workspace_memberships').select('user_id,workspace_id,roles,permissions').in('user_id',contactIds).in('workspace_id',workspaceIds).eq('status','active'):Promise.resolve({data:[]}),
      contactIds.length?supabaseAdmin.from('profiles').select('id,status,is_test,coach_privacy_settings').in('id',contactIds).eq('is_test',false):Promise.resolve({data:[]}),
    ]);const eligibleMembers=new Set((members||[]).filter(messagingStaff).map(row=>`${row.workspace_id}:${row.user_id}`)),profileMap=new Map((profiles||[]).map(row=>[row.id,row]))
    for(const org of publicOrgs||[]){const setting=settingsMap.get(org.id),contactId=setting?.primary_family_contact_user_id||null,workspaceId=workspaceMap.get(org.id),profile=contactId?profileMap.get(contactId):null,memberOkay=Boolean(contactId&&workspaceId&&eligibleMembers.has(`${workspaceId}:${contactId}`)),profileOkay=Boolean(profile&&publicRecipient(profile)),privacyOkay=Boolean(profileOkay&&bool(profile?.coach_privacy_settings,'allowDirectMessages'))
      const can=memberOkay&&profileOkay&&privacyOkay,reason=!contactId?'organization_inbox_unavailable':!memberOkay||!profileOkay?'organization_contact_unavailable':!privacyOkay?'direct_messages_disabled':null
      candidates.push({recipient_type:'organization',recipient_id:org.id,user_id:null,organization_id:org.id,athlete_profile_id:null,display_name:setting?.org_name||org.name||'Organization',subtitle:setting?.primary_family_contact_label||'Organization inbox',avatar_url:setting?.profile_image_url||null,can_message:can,message_unavailable_reason:reason,resolved_user_id:can?contactId:null})
    }
  }
  // Shared-organization results remain available in addition to the explicitly
  // opted-in public directory above.
  if(bool(self?.athlete_privacy_settings,'allowParentToParentMessaging',false)&&orgIds.length){
    const {data:shared}=await supabaseAdmin.from('athlete_organization_memberships').select('athlete_id').in('org_id',orgIds).eq('status','active').neq('athlete_id',athleteId).limit(100)
    const athleteIds=Array.from(new Set((shared||[]).map(row=>row.athlete_id)))
    if(athleteIds.length){const {data:athletes}=await supabaseAdmin.from('athlete_profiles').select('id,owner_user_id').in('id',athleteIds).eq('status','active').eq('is_test',false)
      const owners=Array.from(new Set((athletes||[]).map(row=>row.owner_user_id).filter(id=>id&&id!==userId)))
      if(owners.length){const {data:profiles}=await supabaseAdmin.from('profiles').select('id,full_name,avatar_url,status,is_test,athlete_privacy_settings').in('id',owners).eq('is_test',false)
        for(const profile of profiles||[])if(publicRecipient(profile)&&bool(profile.athlete_privacy_settings,'allowParentToParentMessaging',false))candidates.push({recipient_type:'parent_athlete',recipient_id:profile.id,user_id:profile.id,organization_id:null,athlete_profile_id:null,display_name:profile.full_name||'Family member',subtitle:'Parent/Athlete',avatar_url:profile.avatar_url||null,can_message:true,message_unavailable_reason:null,resolved_user_id:profile.id})
      }
    }
  }
  return finalize(userId,candidates,q,limit)
}

export async function organizationRecipients(userId:string,workspace:WorkspaceContext,q:string,limit:number):Promise<MobileRecipient[]>{
  const orgId=workspace.organizationId!,candidates:Candidate[]=[]
  const [publicFamilies,{data:workspaceMembers},{data:athleteLinks},{data:publicOrgs},{data:publicWorkspaces}]=await Promise.all([
    publicFamilyCandidates(userId,q),
    supabaseAdmin.from('workspace_memberships').select('user_id,roles,permissions').eq('workspace_id',workspace.id).eq('status','active'),
    supabaseAdmin.from('athlete_organization_memberships').select('athlete_id').eq('org_id',orgId).eq('status','active'),
    supabaseAdmin.from('organizations').select('id,name,status,is_test,org_settings(profile_image_url,primary_family_contact_user_id,primary_family_contact_label,allow_organization_messaging)').neq('id',orgId).eq('status','active').eq('is_test',false).limit(100),
    supabaseAdmin.from('business_workspaces').select('id,organization_id').eq('workspace_type','organization').eq('status','active').eq('is_test',false),
  ])
  candidates.push(...publicFamilies)
  const staffIds=(workspaceMembers||[]).map(row=>row.user_id),athleteIds=(athleteLinks||[]).map(row=>row.athlete_id)
  const {data:athletes}=athleteIds.length?await supabaseAdmin.from('athlete_profiles').select('id,full_name,owner_user_id,auth_user_id').in('id',athleteIds).eq('status','active').eq('is_test',false):{data:[]}
  const familyAccounts=new Map<string,Array<{id:string;full_name:string|null}>>()
  for(const athlete of athletes||[]){const accountId=athlete.auth_user_id||athlete.owner_user_id;if(!accountId)continue;const rows=familyAccounts.get(accountId)||[];rows.push({id:athlete.id,full_name:athlete.full_name||null});familyAccounts.set(accountId,rows)}
  const familyIds=Array.from(familyAccounts.keys())
  const profileIds=Array.from(new Set([...staffIds,...familyIds]))
  const {data:profiles}=profileIds.length?await supabaseAdmin.from('profiles').select('id,full_name,avatar_url,role,status,is_test,athlete_privacy_settings,coach_privacy_settings').in('id',profileIds).eq('is_test',false):{data:[]}
  const staffMap=new Map((workspaceMembers||[]).map(row=>[row.user_id,row]))
  for(const profile of profiles||[]){if(profile.id===userId||!publicRecipient(profile))continue;const member:any=staffMap.get(profile.id)
    if(member){const roles=member.roles||[],permissions=member.permissions&&typeof member.permissions==='object'?member.permissions as Record<string,unknown>:{},director=roles.includes('program_director'),coach=roles.some((r:string)=>['coach','assistant_coach'].includes(r)),authorized=coach||director||roles.some((r:string)=>['owner','org_admin'].includes(r))||permissions.manage_messages===true||permissions['messages.manage']===true||permissions.messaging===true;if(!authorized)continue;candidates.push({recipient_type:director?'program_director':coach?'coach':'user',recipient_id:profile.id,user_id:profile.id,organization_id:orgId,athlete_profile_id:null,display_name:profile.full_name||'Staff member',subtitle:director?'Program Director':coach?'Coach':'Organization staff',avatar_url:profile.avatar_url||null,can_message:bool(profile.coach_privacy_settings,'allowDirectMessages'),message_unavailable_reason:bool(profile.coach_privacy_settings,'allowDirectMessages')?null:'direct_messages_disabled',resolved_user_id:profile.id})}
    else if(familyAccounts.has(profile.id)){const related=familyAccounts.get(profile.id)||[],names=related.map(row=>row.full_name).filter(Boolean).join(', '),athleteAccount=String(profile.role||'').toLowerCase()==='athlete',can=bool(profile.athlete_privacy_settings,'allowDirectMessages');candidates.push({recipient_type:'parent_athlete',recipient_id:profile.id,user_id:profile.id,organization_id:orgId,athlete_profile_id:related.length===1?related[0].id:null,display_name:profile.full_name||names||'Parent/Athlete',subtitle:`${athleteAccount?'Athlete':'Parent/Guardian'}${names?` · ${names}`:''}`,avatar_url:profile.avatar_url||null,can_message:can,message_unavailable_reason:can?null:'direct_messages_disabled',resolved_user_id:profile.id})}
  }
  const publicWorkspaceOrgs=new Set((publicWorkspaces||[]).map(row=>row.organization_id))
  const publicWorkspaceMap=new Map((publicWorkspaces||[]).map(row=>[row.organization_id,row.id])),publicSettings=(publicOrgs||[]).map(org=>Array.isArray((org as any).org_settings)?(org as any).org_settings[0]:(org as any).org_settings).filter(Boolean),publicContacts=Array.from(new Set(publicSettings.map(row=>row.primary_family_contact_user_id).filter(Boolean))),publicWorkspaceIds=(publicWorkspaces||[]).map(row=>row.id)
  const {data:publicContactMemberships}=publicContacts.length&&publicWorkspaceIds.length?await supabaseAdmin.from('workspace_memberships').select('user_id,workspace_id,roles,permissions').in('user_id',publicContacts).in('workspace_id',publicWorkspaceIds).eq('status','active'):{data:[]};const publicEligible=new Set((publicContactMemberships||[]).filter(messagingStaff).map(row=>`${row.workspace_id}:${row.user_id}`))
  for(const org of publicOrgs||[]){const settings=Array.isArray((org as any).org_settings)?(org as any).org_settings[0]:(org as any).org_settings;if(!publicWorkspaceOrgs.has(org.id)||!settings?.primary_family_contact_user_id||settings.allow_organization_messaging!==true||!publicEligible.has(`${publicWorkspaceMap.get(org.id)}:${settings.primary_family_contact_user_id}`))continue;candidates.push({recipient_type:'organization',recipient_id:org.id,user_id:null,organization_id:org.id,athlete_profile_id:null,display_name:org.name||'Organization',subtitle:settings.primary_family_contact_label||'Organization inbox',avatar_url:settings.profile_image_url||null,can_message:true,message_unavailable_reason:null,resolved_user_id:settings.primary_family_contact_user_id})}
  return finalize(userId,candidates,q,limit)
}

async function finalize(userId:string,candidates:Candidate[],q:string,limit:number){
  const rows=uniq(candidates),blockedIds=await blocked(userId,rows.map(row=>row.resolved_user_id).filter(Boolean) as string[])
  for(const row of rows)if(row.resolved_user_id&&blockedIds.has(row.resolved_user_id)){row.can_message=false;row.message_unavailable_reason='blocked'}
  const idNeedle=q.startsWith('id:')?q.slice(3).toLowerCase():null,needle=idNeedle?'':q.toLowerCase(),filtered=idNeedle?rows.filter(row=>row.recipient_id.toLowerCase()===idNeedle):needle?rows.filter(row=>row.matched_query===true||`${row.display_name} ${row.subtitle||''}`.toLowerCase().includes(needle)):rows
  let visible=filtered
  if(!needle&&!idNeedle){const recent=await recentUsers(userId);visible=filtered.filter(row=>recent.has(row.resolved_user_id||''));visible.sort((a,b)=>(recent.get(a.resolved_user_id||'')??999)-(recent.get(b.resolved_user_id||'')??999))}
  return visible.slice(0,needle||idNeedle?limit:3).map(({resolved_user_id:_,matched_query:__,...row})=>row)
}

export async function openMappedThread(input:{senderUserId:string;senderOrganizationId:string|null;recipient:MobileRecipient;resolvedUserId:string;athleteId:string|null;threadOrganizationId?:string|null}){
  const {data,error}=await (supabaseAdmin as any).rpc('open_mobile_recipient_thread',{p_sender_user_id:input.senderUserId,p_sender_organization_id:input.senderOrganizationId,p_recipient_type:input.recipient.recipient_type,p_recipient_id:input.recipient.recipient_id,p_athlete_profile_id:input.athleteId,p_resolved_recipient_user_id:input.resolvedUserId,p_thread_organization_id:input.threadOrganizationId??null,p_title:input.recipient.display_name})
  if(error)throw new Error('thread_create_failed');const row=Array.isArray(data)?data[0]:data;return{threadId:row.thread_id,reused:Boolean(row.reused)}
}
