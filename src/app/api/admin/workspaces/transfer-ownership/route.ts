import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { parseUuid } from '@/lib/uuid'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'

export async function POST(request:Request){
  const auth=await requireSuperadminApi(request);if(auth.error)return auth.error
  const body=await request.json().catch(()=>({})),workspaceId=parseUuid(body.workspace_id),newOwnerId=parseUuid(body.new_owner_user_id),reason=String(body.reason||'').trim()
  if(!workspaceId||!newOwnerId||!reason)return NextResponse.json({error:'workspace_id, new_owner_user_id, and reason are required.'},{status:422})
  const bearer=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  const callerClient=bearer
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${bearer}`}}})
    : await createRouteHandlerClientCompat()
  const {data,error}=await callerClient.rpc('admin_transfer_workspace_ownership',{p_workspace_id:workspaceId,p_new_owner_user_id:newOwnerId,p_reason:reason})
  if(error)return NextResponse.json({error:'Workspace ownership could not be transferred.'},{status:error.message.includes('not found')?404:409})
  return NextResponse.json({transfer:data})
}
