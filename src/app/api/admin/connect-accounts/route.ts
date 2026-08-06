import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const auth=await requireSuperadminApi(); if(auth.error)return auth.error
  const p=new URL(request.url).searchParams, q=(p.get('query')||'').toLowerCase(), status=p.get('status')||''
  let db=supabaseAdmin.from('stripe_connect_accounts').select('*').order('updated_at',{ascending:false}).limit(250); if(status)db=db.eq('connect_status',status)
  const {data,error}=await db; if(error)return NextResponse.json({error:'Unable to load Connect accounts.'},{status:500})
  const items=(data||[]).filter((r:any)=>!q||JSON.stringify(r).toLowerCase().includes(q)).map((r:any)=>({...r,requirements_due:(r.requirements_due||[]).join(', ')}))
  return NextResponse.json({items,summary:{accounts:items.length,enabled:items.filter((r:any)=>r.connect_status==='enabled').length,restricted:items.filter((r:any)=>r.connect_status==='restricted').length,action_required:items.filter((r:any)=>(r.requirements_due||'').length>0).length}})
}
