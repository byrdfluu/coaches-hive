'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import OrgSidebar from '@/components/OrgSidebar'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import {createSafeClientComponentClient as createClient} from '@/lib/supabaseHelpers'
import {getActiveOrganizationId} from '@/lib/clientOrganization'

type Coach={id:string;full_name:string|null}
type Offering={id:string;kind:'program'|'tryout'|'training_package'|'training_session';title:string;subtitle:string;coach_ids:string[]}
const sources=[
 {kind:'program',table:'programs',title:'name',rpc:'set_org_program_coaches',arg:'p_program_id',assignment:'org_program_coaches',foreign:'program_id'},
 {kind:'tryout',table:'org_tryouts',title:'title',rpc:'set_org_tryout_coaches',arg:'p_tryout_id',assignment:'org_tryout_coaches',foreign:'tryout_id'},
 {kind:'training_package',table:'org_training_packages',title:'name',rpc:'set_org_training_package_coaches',arg:'p_package_id',assignment:'org_training_package_coaches',foreign:'package_id'},
 {kind:'training_session',table:'org_training_sessions',title:'title',rpc:'set_org_training_session_coaches',arg:'p_session_id',assignment:'org_training_session_coaches',foreign:'session_id'},
] as const
const labels={program:'Program / camp / clinic / league',tryout:'Tryout',training_package:'Training package',training_session:'Training session'}

export default function OfferingCoachesPage(){
 const supabase=createClient(),[loading,setLoading]=useState(true),[saving,setSaving]=useState<string|null>(null),[coaches,setCoaches]=useState<Coach[]>([]),[offerings,setOfferings]=useState<Offering[]>([]),[toast,setToast]=useState('')
 const names=useMemo(()=>new Map(coaches.map(c=>[c.id,c.full_name||'Coach'])),[coaches])
 const load=useCallback(async()=>{setLoading(true);const orgId=await getActiveOrganizationId(supabase);if(!orgId){setLoading(false);return}
  const{data:members}=await supabase.from('organization_memberships').select('user_id').eq('org_id',orgId).eq('status','active').in('role',['coach','assistant_coach','head_coach','program_director','org_admin','owner'])
  const ids=Array.from(new Set((members||[]).map(x=>x.user_id))),{data:profiles}=ids.length?await supabase.from('profiles').select('id,full_name').in('id',ids).or('status.is.null,status.eq.active').or('is_test.is.null,is_test.eq.false'):{data:[]};setCoaches((profiles||[])as Coach[])
  const groups=await Promise.all(sources.map(async source=>{const [{data:rows},{data:assigned}]=await Promise.all([supabase.from(source.table).select(`id,${source.title}${source.kind==='program'?',type':''}`).eq('org_id',orgId).order(source.title),supabase.from(source.assignment).select(`${source.foreign},coach_id`)]);return(rows||[]).map((row:any)=>({id:row.id,kind:source.kind,title:row[source.title]||labels[source.kind],subtitle:source.kind==='program'?String(row.type||'program'):labels[source.kind],coach_ids:(assigned||[]).filter((a:any)=>a[source.foreign]===row.id).map((a:any)=>a.coach_id)}))}));setOfferings(groups.flat()as Offering[]);setLoading(false)
 },[supabase])
 useEffect(()=>{void load()},[load])
 const toggle=async(offering:Offering,coachId:string)=>{const source=sources.find(s=>s.kind===offering.kind)!;const next=offering.coach_ids.includes(coachId)?offering.coach_ids.filter(id=>id!==coachId):[...offering.coach_ids,coachId];setSaving(offering.id);const{error}=await supabase.rpc(source.rpc,{[source.arg]:offering.id,p_coach_ids:next});setSaving(null);if(error)return setToast(error.message);setOfferings(rows=>rows.map(row=>row.id===offering.id?{...row,coach_ids:next}:row));setToast('Coach assignments updated.')}
 return <div className="min-h-screen bg-[#f7f7f5] text-[#191919]"><OrgSidebar/><main className="mx-auto max-w-6xl px-5 py-10 lg:pl-72"><p className="text-sm font-semibold uppercase tracking-wider text-[#b80f0a]">Organization offerings</p><h1 className="text-3xl font-bold">Assigned coaches</h1><p className="mt-2 text-gray-600">Select multiple active staff members. Changes are atomic and appear in coach workspaces and the public storefront.</p>{loading?<div className="mt-8"><LoadingState/></div>:<div className="mt-8 space-y-4">{offerings.map(offering=><article key={`${offering.kind}:${offering.id}`} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{offering.subtitle}</p><h2 className="mt-1 text-lg font-semibold">{offering.title}</h2><div className="mt-4 flex flex-wrap gap-2">{coaches.map(coach=>{const selected=offering.coach_ids.includes(coach.id);return <button key={coach.id} type="button" disabled={saving===offering.id} onClick={()=>void toggle(offering,coach.id)} className={`rounded-full border px-3 py-2 text-sm disabled:opacity-50 ${selected?'border-[#b80f0a] bg-[#fff1ef] text-[#b80f0a]':''}`}>{selected?'✓ ':''}{names.get(coach.id)}</button>})}{!coaches.length?<span className="text-sm text-gray-500">No active coaching staff.</span>:null}</div></article>)}{!offerings.length?<p className="rounded-2xl bg-white p-8 text-center text-gray-500">No offerings found.</p>:null}</div>}{toast?<Toast message={toast} onClose={()=>setToast('')}/>:null}</main></div>
}
