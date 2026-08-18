import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { mobileError, money, requireMobileOrgAuthority, requireMobileUser, teamBelongsToOrg } from '@/lib/mobilePaymentApi'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const slug = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)}-${randomBytes(4).toString('hex')}`

export async function GET(request: Request) {
  const auth = await requireMobileUser(request); if ('response' in auth) return auth.response
  const workspaceId = request.headers.get('x-workspace-id') || new URL(request.url).searchParams.get('workspace_id')
  if (workspaceId || new URL(request.url).searchParams.get('scope') === 'organization') {
    const authority = await requireMobileOrgAuthority(request, 'manage_payments')
    if ('response' in authority) return authority.response
    const { data, error } = await supabaseAdmin.from('org_enrollment_forms').select('*').eq('org_id',authority.orgId).order('created_at',{ascending:false})
    if (error) return mobileError(error.message,500)
    return NextResponse.json({ registrations:data||[] })
  }
  const [{ data: forms }, { data: submissions }] = await Promise.all([
    supabaseAdmin.from('org_enrollment_forms').select('*').eq('is_active',true).order('created_at',{ascending:false}),
    supabaseAdmin.from('org_enrollment_submissions').select('*').or(`family_account_id.eq.${auth.user.id},player_id.eq.${auth.user.id}`).order('created_at',{ascending:false}),
  ])
  return NextResponse.json({ registrations:forms||[], submissions:submissions||[] })
}

export async function POST(request: Request) {
  const authority=await requireMobileOrgAuthority(request,'manage_payments'); if('response'in authority)return authority.response
  const body=await request.json().catch(()=>({})); const name=String(body.name||body.title||'').trim(); const standard=money(body.standard_fee_cents??body.enrollment_fee_cents)
  if(!name||standard<0)return mobileError('name and a non-negative standard_fee_cents are required')
  if(!(await teamBelongsToOrg(body.team_id,authority.orgId)))return mobileError('Team does not belong to this organization',403)
  const waiverIds=Array.isArray(body.required_waiver_ids)?Array.from(new Set<string>(body.required_waiver_ids.map(String))):[]
  if(waiverIds.length){const{data:waivers}=await supabaseAdmin.from('org_waivers').select('id').eq('org_id',authority.orgId).in('id',waiverIds);if((waivers||[]).length!==waiverIds.length)return mobileError('Every required waiver must belong to this organization',403)}
  const early=body.early_bird_fee_cents==null?null:money(body.early_bird_fee_cents), late=body.late_fee_cents==null?null:money(body.late_fee_cents)
  if((early!=null&&early<0)||(late!=null&&late<0))return mobileError('Fee values cannot be negative')
  const {data,error}=await supabaseAdmin.from('org_enrollment_forms').insert({
    org_id:authority.orgId,title:name,description:String(body.description||'').trim()||null,enrollment_fee_cents:standard,
    early_bird_fee_cents:early,early_bird_deadline:body.early_bird_deadline||null,late_fee_cents:late,late_fee_starts_at:body.late_fee_starts_at||null,
    bundle_config:body.bundle_pricing&&typeof body.bundle_pricing==='object'?body.bundle_pricing:{},team_id:body.team_id||null,season_id:body.season_id||null,
    required_waiver_ids:waiverIds,slug:slug(name),is_active:true,
  }).select('*').single()
  if(error)return mobileError(error.message,500)
  return NextResponse.json({registration:data,share_url:`/enroll/${data.slug}`},{status:201})
}
