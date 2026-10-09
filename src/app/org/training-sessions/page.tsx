'use client'

import {useCallback,useEffect,useMemo,useState}from'react'
import OrgSidebar from '@/components/OrgSidebar'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import {createSafeClientComponentClient as createClient}from'@/lib/supabaseHelpers'
import {getActiveOrganizationId}from'@/lib/clientOrganization'

type Coach={id:string;full_name:string|null}
type Session={id:string;title:string|null;description:string|null;starts_at:string;ends_at:string;location:string|null;capacity:number;status:string;total_booked:number;coach_ids:string[]}
type Roster={booking_id:string;athlete_id:string;athlete_name:string;booking_type:string;booking_status:string;booked_at:string}
const leadership=new Set(['owner','org_admin','admin','superadmin','program_director','school_admin','athletic_director','club_admin','travel_admin'])
const emptyForm={title:'',description:'',starts_at:'',ends_at:'',location:'',capacity:'12',status:'draft',coach_ids:[]as string[]}

export default function TrainingSessionsPage(){
 const supabase=createClient()
 const[sessions,setSessions]=useState<Session[]>([]),[coaches,setCoaches]=useState<Coach[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[canManage,setCanManage]=useState(false),[form,setForm]=useState(emptyForm),[editing,setEditing]=useState<string|null>(null),[roster,setRoster]=useState<Roster[]|null>(null),[rosterTitle,setRosterTitle]=useState(''),[toast,setToast]=useState('')
 const coachNames=useMemo(()=>new Map(coaches.map(c=>[c.id,c.full_name||'Coach'])),[coaches])
 const load=useCallback(async()=>{
  setLoading(true)
  const[{data:userData},orgId]=await Promise.all([supabase.auth.getUser(),getActiveOrganizationId(supabase)])
  const userId=userData.user?.id
  if(!userId||!orgId){setLoading(false);return}
  const{data:member}=await supabase.from('organization_memberships').select('role').eq('org_id',orgId).eq('user_id',userId).eq('status','active').maybeSingle()
  const manage=leadership.has(String(member?.role||userData.user?.user_metadata?.role||''));setCanManage(manage)
  const{data:members}=await supabase.from('organization_memberships').select('user_id,role').eq('org_id',orgId).eq('status','active').in('role',['coach','assistant_coach','head_coach','program_director','org_admin','owner'])
  const coachIds=Array.from(new Set((members||[]).map(m=>m.user_id)))
  const{data:profiles}=coachIds.length?await supabase.from('profiles').select('id,full_name').in('id',coachIds):{data:[]};setCoaches((profiles||[])as Coach[])
  let visibleIds:string[]|null=null
  if(!manage){const{data:a}=await supabase.from('org_training_session_coaches').select('session_id').eq('coach_id',userId);visibleIds=(a||[]).map(x=>x.session_id);if(!visibleIds.length){setSessions([]);setLoading(false);return}}
  let query=supabase.from('org_training_sessions').select('id,title,description,starts_at,ends_at,location,capacity,status').eq('org_id',orgId).gte('starts_at',new Date().toISOString()).order('starts_at')
  if(visibleIds)query=query.in('id',visibleIds)
  const{data:rows}=await query,ids=(rows||[]).map(x=>x.id)
  const[{data:assignments},{data:bookings}]=ids.length?await Promise.all([supabase.from('org_training_session_coaches').select('session_id,coach_id').in('session_id',ids),supabase.from('org_training_session_bookings').select('session_id,status').in('session_id',ids)]):[{data:[]},{data:[]}]
  setSessions((rows||[]).map(s=>({...s,coach_ids:(assignments||[]).filter(a=>a.session_id===s.id).map(a=>a.coach_id),total_booked:(bookings||[]).filter(b=>b.session_id===s.id&&['pending_payment','reserved','attended','no_show'].includes(b.status)).length}))as Session[]);setLoading(false)
 },[supabase])
 useEffect(()=>{load()},[load])
 const toggle=(id:string)=>setForm(f=>({...f,coach_ids:f.coach_ids.includes(id)?f.coach_ids.filter(x=>x!==id):[...f.coach_ids,id]}))
 const save=async()=>{
  const orgId=await getActiveOrganizationId(supabase)
  if(!orgId||!form.title||!form.starts_at||!form.ends_at)return setToast('Title, start, and end are required.')
  setSaving(true)
  const payload={org_id:orgId,title:form.title.trim(),description:form.description.trim()||null,starts_at:new Date(form.starts_at).toISOString(),ends_at:new Date(form.ends_at).toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,location:form.location.trim()||null,capacity:Number(form.capacity),session_type:'group',drop_in_price_cents:0,status:form.status,coach_id:form.coach_ids[0]||null,updated_at:new Date().toISOString()}
  let id=editing
  if(editing){const{error}=await supabase.from('org_training_sessions').update(payload).eq('id',editing);if(error){setSaving(false);return setToast(error.message)}}
  else{const{data,error}=await supabase.from('org_training_sessions').insert(payload).select('id').single();if(error){setSaving(false);return setToast(error.message)}id=data.id}
  const{error}=await supabase.rpc('set_org_training_session_coaches',{p_session_id:id,p_coach_ids:form.coach_ids});setSaving(false)
  if(error)return setToast(error.message);setForm(emptyForm);setEditing(null);setToast('Training session saved.');load()
 }
 const edit=(s:Session)=>{setEditing(s.id);setForm({title:s.title||'',description:s.description||'',starts_at:s.starts_at.slice(0,16),ends_at:s.ends_at.slice(0,16),location:s.location||'',capacity:String(s.capacity),status:s.status,coach_ids:s.coach_ids});window.scrollTo({top:0,behavior:'smooth'})}
 const showRoster=async(s:Session)=>{const{data,error}=await supabase.rpc('my_org_training_session_roster',{p_session_id:s.id});if(error)return setToast(error.message);setRosterTitle(s.title||'Training session');setRoster((data||[])as Roster[])}
 return <div className="min-h-screen bg-[#f7f7f5] text-[#191919]"><OrgSidebar/><main className="mx-auto max-w-6xl px-5 py-10 lg:pl-72"><div className="mb-8 flex items-end justify-between"><div><p className="text-sm font-semibold uppercase tracking-wider text-[#b80f0a]">Organization training</p><h1 className="text-3xl font-bold">{canManage?'Training Sessions':'My Sessions'}</h1></div><button onClick={load} className="rounded-lg border px-4 py-2">Refresh</button></div>
 {canManage&&<section className="mb-8 rounded-2xl bg-white p-6 shadow-sm"><h2 className="mb-4 text-xl font-semibold">{editing?'Edit session':'Create session'}</h2><div className="grid gap-4 md:grid-cols-2"><input className="rounded-lg border p-3" placeholder="Session title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><input className="rounded-lg border p-3" placeholder="Location" value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/><input className="rounded-lg border p-3" type="datetime-local" value={form.starts_at} onChange={e=>setForm({...form,starts_at:e.target.value})}/><input className="rounded-lg border p-3" type="datetime-local" value={form.ends_at} onChange={e=>setForm({...form,ends_at:e.target.value})}/><input className="rounded-lg border p-3" type="number" min="1" max="100" value={form.capacity} onChange={e=>setForm({...form,capacity:e.target.value})}/><select className="rounded-lg border p-3" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option></select><textarea className="rounded-lg border p-3 md:col-span-2" placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div><h3 className="mt-5 font-semibold">Assigned coaches</h3><div className="mt-2 flex flex-wrap gap-2">{coaches.map(c=><button type="button" key={c.id} onClick={()=>toggle(c.id)} className={`rounded-full border px-3 py-2 text-sm ${form.coach_ids.includes(c.id)?'border-[#b80f0a] bg-[#fff1ef] text-[#b80f0a]':''}`}>{form.coach_ids.includes(c.id)?'✓ ':''}{c.full_name||'Coach'}</button>)}</div><div className="mt-5 flex gap-3"><button disabled={saving} onClick={save} className="rounded-lg bg-[#b80f0a] px-5 py-3 font-semibold text-white disabled:opacity-50">{saving?'Saving…':'Save session'}</button>{editing&&<button onClick={()=>{setEditing(null);setForm(emptyForm)}} className="rounded-lg border px-5 py-3">Cancel</button>}</div></section>}
 {loading?<LoadingState/>:<div className="space-y-4">{sessions.map(s=><article key={s.id} className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{s.title||'Training session'}</h2><p className="mt-1 text-sm text-gray-600">{new Date(s.starts_at).toLocaleString()} – {new Date(s.ends_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</p><p className="mt-1 text-sm">{s.location||'Location TBD'} · {s.total_booked}/{s.capacity} enrolled · {s.status}</p><div className="mt-3 flex flex-wrap gap-2">{s.coach_ids.map(id=><span key={id} className="rounded-full bg-gray-100 px-3 py-1 text-sm">{coachNames.get(id)||'Coach'}</span>)}</div></div><div className="flex gap-2"><button onClick={()=>showRoster(s)} className="rounded-lg border px-4 py-2">View roster</button>{canManage&&<button onClick={()=>edit(s)} className="rounded-lg border px-4 py-2">Edit</button>}</div></div></article>)}{!sessions.length&&<p className="rounded-2xl bg-white p-8 text-center text-gray-500">No upcoming training sessions.</p>}</div>}
 {roster&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={()=>setRoster(null)}><section className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6" onClick={e=>e.stopPropagation()}><div className="flex justify-between"><h2 className="text-xl font-semibold">{rosterTitle} roster</h2><button onClick={()=>setRoster(null)}>Close</button></div><div className="mt-4 divide-y">{roster.map(r=><div key={r.booking_id} className="grid grid-cols-2 gap-2 py-3 text-sm"><strong>{r.athlete_name}</strong><span>{r.booking_type}</span><span>{r.booking_status}</span><span>{new Date(r.booked_at).toLocaleString()}</span></div>)}{!roster.length&&<p className="py-6 text-gray-500">No registrations yet.</p>}</div></section></div>}{toast&&<Toast message={toast} onClose={()=>setToast('')}/>}</main></div>
}
