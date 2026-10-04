import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic='force-dynamic'
const REQUIRED_MIGRATION='20261003060000_superadmin_mobile_hardening_contracts.sql'
export async function GET(request:Request){
  const auth=await requireSuperadminApi(request);if(auth.error)return auth.error
  const cutoff=new Date(Date.now()-15*60*1000).toISOString()
  const [{count:failed},{count:processing},{data:duplicateEvents}]=await Promise.all([
    supabaseAdmin.from('stripe_webhook_events').select('*',{count:'exact',head:true}).eq('status','failed'),
    supabaseAdmin.from('stripe_webhook_events').select('*',{count:'exact',head:true}).eq('status','processing').lt('received_at',cutoff),
    supabaseAdmin.from('stripe_webhook_events').select('event_id').limit(2000),
  ])
  const ids=(duplicateEvents||[]).map(row=>row.event_id),duplicateCount=ids.length-new Set(ids).size
  return NextResponse.json({
    deployed_backend_commit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.NEXT_PUBLIC_BUILD_SHA||null,
    deployment_id:process.env.VERCEL_DEPLOYMENT_ID||process.env.VERCEL_URL||null,
    migration_state:{required_latest:REQUIRED_MIGRATION,verified:process.env.DATABASE_MIGRATIONS_VERIFIED==='true'},
    contract_tests:{status:process.env.CONTRACT_TEST_STATUS||'unknown',commit:process.env.CONTRACT_TEST_COMMIT||null},
    stripe_environment:process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')?'live':process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')?'test':'unconfigured',
    webhook_backlog:{failed:failed||0,stuck_processing_over_15_minutes:processing||0,duplicate_event_ids:duplicateCount},
    supported_mobile_build:{minimum:process.env.MINIMUM_MOBILE_BUILD||null,recommended:process.env.RECOMMENDED_MOBILE_BUILD||null},
    generated_at:new Date().toISOString(),
  },{headers:{'Cache-Control':'no-store'}})
}
