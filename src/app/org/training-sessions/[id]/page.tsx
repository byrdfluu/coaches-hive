'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import {useParams} from 'next/navigation'
import Link from 'next/link'
import OrgSidebar from '@/components/OrgSidebar'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import {createSafeClientComponentClient as createClient} from '@/lib/supabaseHelpers'
import {getActiveOrganizationId} from '@/lib/clientOrganization'

type Coach={id:string;full_name:string|null}
type Session={id:string;org_id:string;title:string|null;description:string|null;starts_at:string;ends_at:string;location:string|null;capacity:number;drop_in_price_cents:number;status:string;coach_ids:string[]}
type Roster={booking_id:string;athlete_name:string;booking_type:string;booking_status:string;booked_at:string}

export default function TrainingSessionDetail(){
 const {id}=useParams<{id:string}>(),supabase=createClient()
 const[session,setSession]=useState<Session|null>(null),[coaches,setCoaches]=useState<Coach[]>([]),[roster,setRoster]=useState<Roster[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[toast,setToast]=useState('')
 const[form,setForm]=useState({title:'',description:'',starts_at:'',ends_at:'',location:'',capacity:'12',price:'0',status:'draft',coach_ids:[]as string[]})
 const names=useMemo(()=>new Map(coaches.map(c=>[c.id,c.full_name||'Coach'])),[coaches])
 const load=useCallback(async()=>{setLoading(true);const orgId=await getActiveOrganizationId(supabase);if(!orgId)return setLoading(false)
  const[{data:row,error},{data:members},{data:links},{data:rosterRows,error:rosterError}]=await Promise.all([
   supabase.from('org_training_sessions').select('id,org_id,title,description,starts_at,ends_at,location,capacity,drop_in_price_cents,status').eq('id',id).eq('org_id',orgId).maybeSingle(),
   supabase.from('organization_memberships').select('user_id').eq('org_id',orgId).eq('status','active').in('role',['coach','assistant_coach','head_coach','program_director','org_admin','owner']),
   supabase.from('org_training_session_coaches').select('coach_id').eq('session_id',id),
   supabase.rpc('my_org_training_session_roster',{p_session_id:id}),
  ])
  if(error||!row){setToast(error?.message||'Training session not found.');setLoading(false);return}
  const coachIds=Array.from(new Set((members||[]).map(x=>x.user_id))),{data:profiles}=coachIds.length?await supabase.from('profiles').select('id,full_name').in('id',coachIds):{data:[]}
  const value={...row,coach_ids:(links||[]).map(x=>x.coach_id)} as Session;setSession(value);setCoaches((profiles||[])as Coach[]);if(!rosterError)setRoster((rosterRows||[])as Roster[])
  setForm({title:value.title||'',description:value.description||'',starts_at:value.starts_at.slice(0,16),ends_at:value.ends_at.slice(0,16),location:value.location||'',capacity:String(value.capacity),price:(value.drop_in_price_cents/100).toFixed(2),status:value.status,coach_ids:value.coach_ids});setLoading(false)
 },[id,supabase])
 useEffect(()=>{void load()},[load])
 const toggle=(coachId:string)=>setForm(f=>({...f,coach_ids:f.coach_ids.includes(coachId)?f.coach_ids.filter(x=>x!==coachId):[...f.coach_ids,coachId]}))
 const save=async()=>{if(!session)return;setToast('');setSaving(true);const{data,error}=await supabase.rpc('save_org_training_sessions_with_coaches',{p_org_id:session.org_id,p_session_id:session.id,p_title:form.title,p_description:form.description||null,p_starts_at:new Date(form.starts_at).toISOString(),p_ends_at:new Date(form.ends_at).toISOString(),p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,p_location:form.location||null,p_capacity:Number(form.capacity),p_drop_in_price_cents:Math.round(Number(form.price)*100),p_status:form.status,p_coach_ids:form.coach_ids,p_weekly_occurrences:1});setSaving(false);if(error||!data?.length)return setToast(error?.message||'Session and coach assignments were not saved.');setToast('Session and coach assignments saved.');void load()}
 if(loading)return <div className="min-h-screen bg-[#f7f7f5]"><OrgSidebar/><main className="mx-auto max-w-5xl px-5 py-10 lg:pl-72"><LoadingState/></main></div>
 if(!session)return <main className="p-8"><Link href="/org/training-sessions">← Training sessions</Link>{toast&&<Toast message={toast} onClose={()=>setToast('')}/>}</main>
 return <div className="min-h-screen bg-[#f7f7f5] text-[#191919]"><OrgSidebar/><main className="mx-auto max-w-5xl px-5 py-10 lg:pl-72"><Link href="/org/training-sessions" className="text-sm text-gray-600">← Training sessions</Link><p className="mt-6 text-sm font-semibold uppercase tracking-wider text-[#b80f0a]">Training session details</p><h1 className="text-3xl font-bold">{session.title||'Training session'}</h1>
 <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm"><div className="grid gap-4 md:grid-cols-2"><input aria-label="Session title" className="rounded-lg border p-3" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><input aria-label="Location" className="rounded-lg border p-3" value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/><input aria-label="Starts at" className="rounded-lg border p-3" type="datetime-local" value={form.starts_at} onChange={e=>setForm({...form,starts_at:e.target.value})}/><input aria-label="Ends at" className="rounded-lg border p-3" type="datetime-local" value={form.ends_at} onChange={e=>setForm({...form,ends_at:e.target.value})}/><input aria-label="Capacity" className="rounded-lg border p-3" type="number" min="1" value={form.capacity} onChange={e=>setForm({...form,capacity:e.target.value})}/><input aria-label="Drop-in price" className="rounded-lg border p-3" type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/><select aria-label="Registration status" className="rounded-lg border p-3" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="draft">Draft</option><option value="published">Open Registration</option><option value="cancelled">Closed</option></select><textarea aria-label="Description" className="rounded-lg border p-3 md:col-span-2" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
 <h2 className="mt-6 font-semibold">Assigned coaches</h2><div className="mt-2 flex flex-wrap gap-2">{coaches.map(c=><button type="button" key={c.id} onClick={()=>toggle(c.id)} className={`rounded-full border px-3 py-2 text-sm ${form.coach_ids.includes(c.id)?'border-[#b80f0a] bg-[#fff1ef] text-[#b80f0a]':''}`}>{form.coach_ids.includes(c.id)?'✓ ':''}{names.get(c.id)}</button>)}</div><button disabled={saving} onClick={save} className="mt-6 rounded-lg bg-[#b80f0a] px-5 py-3 font-semibold text-white disabled:opacity-50">{saving?'Saving…':'Save session'}</button></section>
 <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Roster</h2><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>void load()}>Refresh</button></div><div className="mt-4 divide-y">{roster.map(r=><div key={r.booking_id} className="grid gap-1 py-3 text-sm sm:grid-cols-4"><strong>{r.athlete_name}</strong><span>{r.booking_type}</span><span>{r.booking_status}</span><span>{new Date(r.booked_at).toLocaleString()}</span></div>)}{!roster.length&&<p className="py-5 text-gray-500">No registrations yet.</p>}</div></section>{toast&&<Toast message={toast} onClose={()=>setToast('')}/>}</main></div>
}
