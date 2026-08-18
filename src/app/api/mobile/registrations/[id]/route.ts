import { NextResponse } from 'next/server'
import { mobileError, requireMobileUser } from '@/lib/mobilePaymentApi'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await requireMobileUser(request);if('response'in auth)return auth.response;const{id}=await params
  const {data:registration,error}=await supabaseAdmin.from('org_enrollment_forms').select('*,organizations(name)').eq('id',id).maybeSingle()
  if(error||!registration)return mobileError('Registration not found',404)
  if(!registration.is_active){const{data:m}=await supabaseAdmin.from('organization_memberships').select('org_id').eq('org_id',registration.org_id).eq('user_id',auth.user.id).maybeSingle();if(!m)return mobileError('Registration is closed',410)}
  const {data:submissions}=await supabaseAdmin.from('org_enrollment_submissions').select('*').eq('form_id',id).or(`family_account_id.eq.${auth.user.id},player_id.eq.${auth.user.id}`)
  return NextResponse.json({registration,submissions:submissions||[]})
}
